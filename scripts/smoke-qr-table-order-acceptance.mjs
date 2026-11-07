import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { saleFixture, load } from './test-helpers/market-sale-benefits-fixture.mjs';

const f = saleFixture();
const db = f.db;
const config = load('database/qr-table-order-config');
const order = load('table-order-request-acceptance');
const tableOrder = load('table-order-service');
const intake = load('request-intake-service');
const {createPublicTableCatalog} = load('public-table-catalog-publication');

try {
  db.prepare("INSERT INTO tables(id,name,area,created_at,updated_at) VALUES('table_7','Masa 7','Bahçe',?,?)")
    .run(new Date().toISOString(), new Date().toISOString());
  assert.equal(config.getQrTableOrderConfig(db).enabled, false, 'opt-in must be off by default');
  config.setQrTableOrdersEnabled(db, true);
  assert.equal(db.prepare("SELECT job_type FROM sync_outbox WHERE job_key='menu'").get()?.job_type, 'menu_publish');
  assert.equal(db.prepare("SELECT job_type FROM sync_outbox WHERE job_key='table_catalog'").get()?.job_type, 'table_catalog_publish',
    'QR setting change must also publish table token hashes');
  const tables = config.listQrOrderTables(db);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].token.length, 24);
  assert(!tables[0].token.includes('table_7'));
  const caps = ['food_service.tables','food_service.orders','channel.qr_menu','customer.requests'];
  const published = createPublicTableCatalog(f.path, new Set(caps));
  assert.equal(published.enabled, false, 'private table publishing may stay disabled');
  assert.equal(published.orderEnabled, true, 'private order access must still be published');
  assert.equal(published.tables[0].orderTokenHash, createHash('sha256').update(tables[0].token).digest('hex'));
  assert.equal(published.tables[0].orderTokenHash.length, 64);

  const now = new Date().toISOString();
  const base = id => ({
    id, customer_id:'', source:'web_form', request_type:'table_order', status:'new',
    customer_name:'Masa 7', customer_phone:'', date_text:'', start_date:'', end_date:'', time:'',
    guest_count:1, adult_count:0, child_count:0, message:'Sıcak olsun',
    ai_summary:'', ai_suggested_reply:'', whatsapp_message:'', assigned_to:'', priority:'normal',
    sync_status:'pending', created_at:now, updated_at:now, table_id:'table_7',
    order_items:[{menu_entry_id:'menu_p1',quantity:2,note:'Şekersiz',name:'Fixture product',unit_price:1000,currency:'TRY'}]
  });
  const customersBefore = Number(db.prepare('SELECT COUNT(*) n FROM customers').get().n);
  intake.upsertSyncedRequests(db, [base('qr_req_1')]);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM customers').get().n), customersBefore, 'QR order must not create fake customer');
  assert.equal(db.prepare("SELECT order_items_json FROM requests WHERE id='qr_req_1'").get().order_items_json.includes('Şekersiz'), true);
  const beforeStock = Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity);
  const approved = order.acceptQrTableOrderRequest(db, 'qr_req_1');
  assert.equal(approved.ok, true, approved.message);
  const tableOrderRow = db.prepare('SELECT * FROM table_orders WHERE id=?').get(approved.orderId);
  assert.equal(tableOrderRow.table_id, 'table_7');
  const line = db.prepare('SELECT quantity,note,unit_price FROM table_order_items WHERE order_id=?').get(approved.orderId);
  assert.equal(Number(line.quantity), 2);
  assert.equal(line.note, 'Şekersiz');
  assert.equal(Number(line.unit_price), 1000);
  assert.equal(Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity), beforeStock - 2);
  assert.equal(db.prepare("SELECT accepted_order_id,status FROM requests WHERE id='qr_req_1'").get().status, 'approved');
  const replay = order.acceptQrTableOrderRequest(db,'qr_req_1');
  assert.equal(replay.ok,true);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM table_order_items WHERE order_id=?').get(approved.orderId).n),1);
  assert.equal(Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity),beforeStock-2);

  db.prepare('UPDATE catalog_products SET sale_price=1200 WHERE id=?').run('p1');
  intake.upsertSyncedRequests(db, [base('qr_req_price')]);
  const rejectedPrice = order.acceptQrTableOrderRequest(db,'qr_req_price');
  assert.equal(rejectedPrice.ok,false,'changed price must fail');
  assert.match(rejectedPrice.message,/fiyatı değişmiş/);
  assert.equal(Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity),beforeStock-2);
  assert.equal(db.prepare("SELECT status FROM requests WHERE id='qr_req_price'").get().status,'new');
  db.prepare('UPDATE catalog_products SET sale_price=1000 WHERE id=?').run('p1');

  // Another guest at the same table generates a separate request, not another adisyon.
  const second = base('qr_req_second');
  second.order_items = [{...second.order_items[0], quantity:1, note:'Limonlu'}];
  intake.upsertSyncedRequests(db, [second]);
  const acceptedSecond = order.acceptQrTableOrderRequest(db, 'qr_req_second');
  assert.equal(acceptedSecond.ok, true, acceptedSecond.message);
  assert.equal(acceptedSecond.orderId, approved.orderId, 'different guests must share the active table adisyon');
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM table_orders WHERE table_id=?').get('table_7').n),1);
  assert.equal(Number(db.prepare('SELECT SUM(quantity) n FROM table_order_items WHERE order_id=?').get(approved.orderId).n),3);
  assert.equal(Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity),beforeStock-3);
  assert.equal(order.acceptQrTableOrderRequest(db, 'qr_req_second').orderId, approved.orderId);

  // An exception after stock movement must roll back the complete multi-service operation.
  db.prepare("INSERT INTO tables(id,name,created_at,updated_at) VALUES ('table_8','Masa 8',?,?)").run(now,now);
  intake.upsertSyncedRequests(db,[{...base('qr_req_rollback'),table_id:'table_8'}]);
  db.exec("CREATE TEMP TRIGGER qr_force_rollback BEFORE UPDATE ON requests WHEN NEW.id='qr_req_rollback' BEGIN SELECT RAISE(ABORT,'forced-failure'); END");
  const stockBeforeRollback=Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity);
  const failedAtomic=order.acceptQrTableOrderRequest(db,'qr_req_rollback');
  assert.equal(failedAtomic.ok,false);
  assert.equal(Number(db.prepare("SELECT quantity FROM inventory_balances WHERE product_id='p1'").get().quantity),stockBeforeRollback);
  assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM table_orders WHERE table_id='table_8'").get().n),0);
  assert.equal(db.prepare("SELECT status FROM requests WHERE id='qr_req_rollback'").get().status,'new');
  db.exec('DROP TRIGGER qr_force_rollback');

  assert.equal(tableOrder.closeTableOrder(db,{orderId:approved.orderId,status:'cancelled'}).ok,true);
  intake.upsertSyncedRequests(db,[base('qr_req_stale')]);
  const stale = order.acceptQrTableOrderRequest(db,'qr_req_stale');
  assert.equal(stale.ok,false,'previous session request cannot enter new adisyon');
  assert.match(stale.message,/oturumu kapanmış/);
  assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM table_orders WHERE table_id='table_7'").get().n),1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  console.log('QR TABLE ORDER: PASS (token, private catalog, anonymous intake, atomic adisyon, stock, replay, price conflict, multiple guests to single adisyon, forced rollback, stale session)');
} finally { f.close(); }
