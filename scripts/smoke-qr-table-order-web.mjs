import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {cpSync, mkdtempSync, rmSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {saleFixture, load} from './test-helpers/market-sale-benefits-fixture.mjs';

const root = mkdtempSync(join(tmpdir(),'qr-table-web-'));
const hosting = join(root,'web-module');
cpSync('firm-template/web-module', hosting, {recursive:true});
for (const filename of ['yardimci-asistan.sqlite','yardimci-asistan.sqlite-wal','yardimci-asistan.sqlite-shm'])
  rmSync(join(hosting,'data',filename),{force:true});
const configPath=join(hosting,'config','business.json');
writeFileSync(configPath,JSON.stringify({...JSON.parse(readFileSync(configPath,'utf8')), sync_secret:'qr-local-test-secret'}));

const port = await new Promise(resolve => {
  const server=createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});
});
const base = 'http://127.0.0.1:'+port;
const php = spawn('php',['-S','127.0.0.1:'+port,'-t',hosting],{stdio:'ignore'});
let database;
const sha = value => createHash('sha256').update(value).digest('hex');
try {
  let ready = false;
  for(let i=0;i<80;i++){
    try { const res=await fetch(base+'/api/menu.php'); if (res.status===200){ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,45));
  }
  assert(ready,'PHP fixture did not start');
  database = new DatabaseSync(join(hosting,'data','yardimci-asistan.sqlite'));
  const publish = (name,value) => database.prepare(
    'INSERT INTO publications(name,source_client_id,source_epoch,payload_hash,source_revision,server_revision,payload_json,updated_at) VALUES(?,?,1,?,1,1,?,?)'
  ).run(name,'fixture-desktop',sha(JSON.stringify(value)),JSON.stringify(value),new Date().toISOString());
  const token='AbCdEfGhIjKlMnOpQrStUvWx';
  publish('menu',{enabled:true,table_orders_enabled:true,categories:[{id:'c1',name:'İçecekler',is_active:true,sort_order:0}],
    items:[{id:'m1',name:'Çay',category_id:'c1',is_available:true,price:25,currency:'TRY',stock_quantity:100,
      hide_when_out_of_stock:false,stock_consumption_quantity:1,sort_order:0}]});
  publish('table_catalog',{enabled:true,orderEnabled:true,tables:[{id:'table_7',name:'Masa 7',area:'Bahçe',
    orderTokenHash:sha(token),capacity:4,media:[]}],version:1});
  publish('android_snapshot',{business_capabilities:['core.customers','customer.requests','channel.qr_menu',
    'food_service.tables','food_service.orders','food_service.menu']});
  const menuResponse = await fetch(base+'/api/menu.php').then(x=>x.json());
  assert.equal(menuResponse.table_orders_enabled,true);
  const tablesResponse = await fetch(base+'/api/tables.php').then(x=>x.json());
  assert.equal(tablesResponse.tables[0].name,'Masa 7');
  assert(!JSON.stringify(tablesResponse).includes('orderTokenHash'),'private token hash leaked in public API');
  assert(!JSON.stringify(tablesResponse).includes(sha(token)),'private digest leaked in public API');

  const valid = await fetch(base+'/api/table-order.php?table='+token);
  assert.equal(valid.status,200);
  assert.equal((await valid.json()).table.id,'table_7');
  const invalid = await fetch(base+'/api/table-order.php?table=abcdefghijabcdefghijabcd');
  assert.equal(invalid.status,404);
  const key = randomUUID();
  const payload = {table_token:token,idempotency_key:key,items:[{id:'m1',quantity:2,note:'Az şekerli'}],note:'Sıcak olsun'};
  const post = body => fetch(base+'/api/table-order.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const first = await post(payload);
  assert.equal(first.status,201,'first submission failed: '+await first.clone().text());
  const result = await first.json();
  assert.match(result.request_id,/^request_/);
  const repeat = await post(payload);
  assert.equal(repeat.status,201);
  assert.equal((await repeat.json()).request_id,result.request_id,'idempotency replay produced duplicate');
  const altered = await post({...payload,items:[{id:'m1',quantity:3,note:'Az şekerli'}]});
  assert.equal(altered.status,409,'different cart with same key accepted');
  const spoof = await post({...payload,idempotency_key:randomUUID(),items:[{id:'other',quantity:1}]});
  assert.equal(spoof.status,422,'unknown product accepted');
  const requests=database.prepare('SELECT payload_json FROM web_requests').all().map(row=>JSON.parse(row.payload_json));
  assert.equal(requests.length,1);
  assert.equal(requests[0].customer_phone,'');
  assert.equal(requests[0].table_id,'table_7');
  assert.deepEqual(requests[0].order_items.map(i=>[i.menu_entry_id,i.quantity,i.unit_price,i.note]),
    [['m1',2,25,'Az şekerli']]);
  const syncResponse=await fetch(base+'/api/sync.php',{method:'POST',headers:{'Content-Type':'application/json','X-YA-Sync-Secret':'qr-local-test-secret'},body:JSON.stringify({action:'pull_requests',after_seq:0,limit:10})});
  assert.equal(syncResponse.status,200,'authenticated request pull failed');
  const synced=await syncResponse.json();
  assert.equal(synced.requests.length,1);
  assert.equal(synced.requests[0].request_type,'table_order');
  assert.equal(synced.requests[0].table_id,'table_7');
  assert.equal(synced.requests[0].order_items[0].menu_entry_id,'m1');
  // Entire handoff: real PHP guest POST -> authenticated sync payload -> actual
  // Desktop SQLite intake -> canonical table order / stock transaction.
  const desktop=saleFixture();
  try {
    desktop.db.prepare("INSERT INTO tables(id,name,created_at,updated_at) VALUES ('table_7','Masa 7',?,?)")
      .run(new Date().toISOString(),new Date().toISOString());
    desktop.db.prepare("UPDATE menu_product_entries SET id='m1' WHERE id='menu_p1'").run();
    desktop.db.prepare("UPDATE catalog_products SET sale_price=25 WHERE id='p1'").run();
    const intake=load('request-intake-service');
    const acceptance=load('table-order-request-acceptance');
    intake.upsertSyncedRequests(desktop.db,synced.requests);
    const accepted=acceptance.acceptQrTableOrderRequest(desktop.db,synced.requests[0].id);
    assert.equal(accepted.ok,true,accepted.message);
    const items=desktop.db.prepare('SELECT quantity,note,unit_price FROM table_order_items WHERE order_id=?').all(accepted.orderId);
    assert.equal(items.length,1);
    assert.equal(Number(items[0].quantity),2);
    assert.equal(items[0].note,'Az şekerli');
    assert.equal(Number(items[0].unit_price),25);
    assert.equal(Number(desktop.db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity),48);
    assert.equal(desktop.db.prepare('SELECT accepted_order_id FROM requests WHERE id=?').get(synced.requests[0].id).accepted_order_id,accepted.orderId);
  } finally { desktop.close(); }

  console.log('QR WEB ORDER: PASS (GET, token rejection, public API privacy, server pricing, idempotency, order validation, real web-to-desktop-to-adisyon handoff)');
} finally {
  if(database) database.close();
  php.kill('SIGTERM');
  rmSync(root,{force:true,recursive:true});
}
