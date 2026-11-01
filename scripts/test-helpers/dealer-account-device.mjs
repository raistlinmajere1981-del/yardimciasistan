import assert from 'node:assert/strict';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {accountFixture} from './customer-accounts.mjs';
const require=createRequire(import.meta.url);
const {WebSyncIngress}=require('../../apps/desktop-app/dist-electron/web-sync-ingress.js');
const {BUSINESS_CAPABILITIES:C}=require('../../packages/shared/dist/index.js');
const {saveRuntimeCatalogProduct,listRuntimeOrders}=require('../../apps/desktop-app/dist-electron/commerce-runtime.js');

/** Disposable loopback TLS/PHP/SQLite fixture, reachable only through this test's own ADB reverse. */
export async function createDealerAccountDeviceFixture(serial) {
  const f=await accountFixture();let server,port,reversed=false,raw;
  const adb=args=>{const result=spawnSync('adb',['-s',serial,...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout;};
  const cleanup=async()=>{
    try {if(reversed)adb(['reverse','--remove',`tcp:${port}`]);}
    finally {raw?.close();try {if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}finally{await f.cleanup();}}
  };
  try {
    await f.publish();const accountId=await f.register('physical@example.test','Physical account fixture');
    const ingress=new WebSyncIngress({database:f.database},()=>'',()=>{});
    assert.equal((await ingress.pullCustomerAccountPages(f.transport)).error,'');
    const customer=f.database.listCustomers({}).items.find(row=>row.email==='physical@example.test');assert.ok(customer);
    const product=saveRuntimeCatalogProduct(f.database.databasePath,{name:'Physical API fixture product',sku:'PHYSICAL-ACCOUNT',brand:'',categoryId:'',salePrice:100,dealerPriceA:80,dealerPriceB:60,purchasePrice:20,currency:'TRY',unit:'piece',taxRate:20,trackInventory:false,isActive:true});
    await f.publish();
    const webCookie=await f.login('physical@example.test');let webSurvivedLogout=false;
    raw=new DatabaseSync(f.database.databasePath);
    server=https.createServer({key:readFileSync(join(f.root,'smtp.key')),cert:readFileSync(join(f.root,'smtp.pem'))},async(req,res)=>{
      try {
        const url=new URL(req.url,'https://localhost');
        if(url.pathname.startsWith('/__fixture/')) {
          const action=url.pathname.slice('/__fixture/'.length);
          if(action==='promote'||action==='demote') {
            const saved=f.database.saveCustomer({...f.database.getCustomer(customer.id),commercialProfile:{companyName:'Physical API dealer',dealerStatus:action==='promote'?'active':'inactive',priceGroup:'dealer_a'}});assert.equal(saved.ok,true,saved.message);await f.publish();
          } else if(action==='disable'||action==='enable') {raw.prepare('UPDATE business_capabilities SET is_enabled=? WHERE capability_id=?').run(action==='enable'?1:0,C.ONLINE_SALES);await f.publish();}
          else if(action==='revoke') {f.database.changeDealerWebAccess(customer.id,'revoke_sessions');await f.publish();}
          else if(action==='reprice') {
            // Same canonical product id: only the private dealer A price changes.
            assert.equal(product.dealerPriceA,80,'fixture product must start at the published dealer A price');
            const repriced=saveRuntimeCatalogProduct(f.database.databasePath,{id:product.id,name:product.name,sku:product.sku,brand:product.brand,description:product.description,categoryId:product.categoryId??'',salePrice:100,dealerPriceA:65,dealerPriceB:60,purchasePrice:20,currency:'TRY',unit:'piece',taxRate:20,trackInventory:false,isActive:true});
            assert.equal(repriced.id,product.id,'reprice must keep the canonical product id');
            assert.equal(repriced.dealerPriceA,65,'fixture reprice must persist the new dealer A price');
            assert.equal(repriced.salePrice,100,'fixture reprice must keep the retail price');
            assert.equal(repriced.dealerPriceB,60,'fixture reprice must keep the dealer B price');
            await f.publish();
          } else if(action==='import') {assert.equal((await ingress.pullWebOrderPages(f.transport)).error,'');await f.publish();}
          else throw new Error('unknown fixture operation');
          res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,accountId,productId:product.id}));return;
        }
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
        const response=await fetch(f.siteUrl+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)}),redirect:'manual'});
        if(url.pathname.endsWith('/account/logout.php') && response.ok && !webSurvivedLogout) {assert.equal((await f.call('account/session',undefined,webCookie)).status,200);webSurvivedLogout=true;}
        res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':response.headers.getSetCookie()});res.end(Buffer.from(await response.arrayBuffer()));
      } catch(error) {res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,code:'fixture_failed',message:error.message}));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));port=server.address().port;
    assert.equal(adb(['reverse','--list']).includes(`tcp:${port} `),false,'preserve existing ADB reverse mappings');
    adb(['reverse',`tcp:${port}`,`tcp:${port}`]);reversed=true;
    return {baseUrl:`https://localhost:${port}/yardimci-asistan/`,ca:readFileSync(join(f.root,'smtp.pem')).toString('base64'),
      verify(){assert.ok(webSurvivedLogout,'Android logout must preserve the independent web session');assert.equal(listRuntimeOrders(f.database.databasePath).filter(order=>order.customerId===customer.id).length,1,'physical retries create one canonical order');},cleanup};
  } catch(error) {await cleanup();throw error;}
}
