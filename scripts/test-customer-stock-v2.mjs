import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const nodeRequire = createRequire(import.meta.url);
const shared = { BUSINESS_CAPABILITIES:{
  INVENTORY:"commerce.inventory",ONLINE_SALES:"channel.online_sales",
  WHOLESALE:"commerce.wholesale", CUSTOMERS:"core.customers"
},createId:prefix=>prefix+"test_"+Math.random().toString(36).slice(2),
  normalizeBarcodeIdentity:v=>String(v??"").trim(),
  normalizePhone:v=>({ok:true,e164:String(v)}),
  moneyToMinor:v=>Math.round(Number(v)*100) };
let enabled=["commerce.inventory"];
function compile(source, dependencies={}) {
  const output=ts.transpileModule(readFileSync(source,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function("module","exports","require",output)(module,module.exports,id=>{
    if(id==="@yardimci-asistan/shared")return shared;
    if(id==="./business-capability-store"||id==="./business-capability-store.js"||id==="../business-capability-store")
      return {readEnabledBusinessCapabilities:()=>enabled};
    if(id in dependencies)return dependencies[id];
    if(id.startsWith("./"))return {};
    return nodeRequire(id);
  });
  return module.exports;
}
const customerModel=compile("apps/desktop-app/src/app/customer-model.ts");
const categories=compile("apps/desktop-app/electron/commerce-category-store.ts");
const tracking=compile("apps/desktop-app/electron/inventory-tracking.ts");
const products=compile("apps/desktop-app/electron/commerce-store.ts",{"./inventory-tracking.js":tracking});
const stocking=compile("apps/desktop-app/electron/stock-replenishment.ts");
const customerUtils=compile("apps/desktop-app/electron/database/customer-utils.ts",{
  "./report-utils.js":{isIsoDate:()=>true}
});
const customerStore=compile("apps/desktop-app/electron/database/customer-store.ts",{
  "./customer-utils.js":customerUtils,
  "./event-store.js":{insertDatabaseEvent:()=>{}},
  "./request-utils.js":{normalizeBoolean:(v,defaultValue)=>v===undefined?defaultValue:Boolean(v)},
  "./customer-room-stay-store":{getCustomerRoomStays:()=>[]},
  "./reservation-store":{getReservations:()=>[]},
  "./hospitality-notification-store":{getHospitalityNotifications:()=>[]}
});

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),"yardimci-stock-v2-"));
  const path=join(dir,"market.sqlite"), db=new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));
  db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES ('biz','Market','Market','market','t','t')").run();
  return {db,path,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
test("commercial identity edits preserve hidden dealer metadata; IPC guards privilege",()=>{
  const base={...customerModel.toCustomerForm(null),fullName:"Market 24",commercialProfileEnabled:true,
    commercialCompanyName:"Market 24 LTD",commercialTaxNumber:"1234567890",
    commercialDealerStatus:"active",commercialPriceGroup:"dealer_b",commercialPaymentTermDays:"30"};
  const retail=customerModel.customerFormToInput(base,false);
  assert.equal(retail.commercialProfile.companyName,"Market 24 LTD");
  assert.equal(retail.commercialProfile.taxNumber,"1234567890");
  assert.equal(retail.commercialProfile.dealerStatus,"active","existing hidden status is preserved for the IPC owner");
  assert.equal(retail.commercialProfile.priceGroup,"dealer_b","existing hidden pricing is preserved rather than silently demoted");
  assert.equal(retail.commercialProfile.paymentTermDays,30);
  const wholesale=customerModel.customerFormToInput(base,true);
  assert.equal(wholesale.commercialProfile.dealerStatus,"active");
  assert.equal(wholesale.commercialProfile.priceGroup,"dealer_b");
  assert.equal(customerModel.customerFormToInput({...base,commercialProfileEnabled:false},false).commercialProfile,null);
});
test("retail commercial profile persists and lists as commercial, never as active dealer",()=>{
  const f=fixture();
  try{
    const base={...customerModel.toCustomerForm(null),fullName:"Eski Çarşı Gıda",commercialProfileEnabled:true,
      commercialCompanyName:"Eski Çarşı Gıda",commercialTaxOffice:"Konya",commercialTaxNumber:"1234567890"};
    const result=customerStore.saveCustomer(f.db,customerModel.customerFormToInput(base,false));
    assert.equal(result.ok,true,JSON.stringify(result));
    const card=customerStore.getCustomer(f.db,result.savedId);
    assert.equal(card.commercialProfile.companyName,"Eski Çarşı Gıda");
    assert.equal(card.commercialProfile.dealerStatus,"inactive");
    assert.equal(customerStore.listCustomersPage(f.db,{filter:"commercial"}).matched,1);
    assert.equal(customerStore.listCustomersPage(f.db,{filter:"dealers"}).matched,0);
    assert.equal(customerStore.listCustomersPage(f.db,{search:"1234567890"}).matched,1);
    const wh=customerModel.customerFormToInput({...base,id:result.savedId,commercialDealerStatus:"active",commercialPriceGroup:"dealer_a"},true);
    assert.equal(customerStore.saveCustomer(f.db,wh).ok,true);
    assert.equal(customerStore.listCustomersPage(f.db,{filter:"dealers"}).matched,1);
  }finally{f.close();}
});
test("IPC permits retail company identity but rejects forged dealer privilege when Wholesale is off",()=>{
  const registered=new Map();
  const handlers=compile("apps/desktop-app/electron/ipc/customer-ipc.ts",{
    electron:{ipcMain:{handle:(channel,cb)=>registered.set(channel,cb)}}
  });
  let captured=null;
  handlers.registerCustomerIpcHandlers({
    getDatabase:()=>({
      getCustomer:id=>id==="stored" ? {commercialProfile:{dealerStatus:"active",priceGroup:"dealer_a",paymentTermDays:45}} : null,
      saveCustomer:input=>{captured=input;return {ok:true,message:"saved",savedId:"c1"};}
    }),
    assertUnlocked:()=>{},
    assertCapability:cap=>{if(cap===shared.BUSINESS_CAPABILITIES.WHOLESALE)throw Error("Wholesale disabled");},
    finalizeRecordDeletion:v=>v,finalizeCustomerMutation:v=>v,
    finalizeCheckInMutation:async v=>v,finalizeCheckoutMutation:async v=>v,finalizeRoomChangeMutation:async v=>v
  });
  const handler=registered.get("customer:save");
  assert.ok(handler);
  const base={...customerModel.toCustomerForm(null),fullName:"Ticaret",commercialProfileEnabled:true,commercialCompanyName:"Ticaret LTD"};
  const safe=customerModel.customerFormToInput(base,false);
  assert.equal(handler(null,safe).ok,true);
  assert.equal(captured.commercialProfile.dealerStatus,"inactive");
  const ordinaryWithTerms=customerModel.customerFormToInput({...base,commercialPaymentTermDays:"30"},false);
  assert.equal(handler(null,ordinaryWithTerms).ok,true,"ordinary commercial payment terms do not grant dealer access");
  assert.equal(captured.commercialProfile.paymentTermDays,30);
  const existing=customerModel.customerFormToInput({...base,id:"stored",commercialDealerStatus:"active",
    commercialPriceGroup:"dealer_a",commercialPaymentTermDays:"60"},false);
  assert.equal(handler(null,existing).ok,true,"existing dealer metadata may be preserved without wholesale");
  assert.equal(captured.commercialProfile.paymentTermDays,60);
  const changedGroup=customerModel.customerFormToInput({...base,id:"stored",commercialDealerStatus:"active",
    commercialPriceGroup:"dealer_b",commercialPaymentTermDays:"60"},false);
  assert.throws(()=>handler(null,changedGroup),/Wholesale disabled/);
  const forged=customerModel.customerFormToInput({...base,commercialDealerStatus:"active",commercialPriceGroup:"dealer_a"},true);
  assert.throws(()=>handler(null,forged),/Wholesale disabled/);
});
test("category VAT defaults, manual product override and ideal inventory stock are persisted",()=>{
  const f=fixture();
  try{
    const cat=categories.saveCatalogCategoryInTransaction(f.db,{name:"Sigara",defaultTaxRate:20});
    assert.equal(cat.defaultTaxRate,20);
    const prod=products.saveCatalogProductInTransaction(f.db,{name:"A",categoryId:cat.id,trackInventory:true,idealQuantity:30,minimumQuantity:10});
    assert.equal(prod.taxRate,20);
    assert.equal(prod.idealQuantity,30);
    assert.equal(prod.minimumQuantity,10);
    const nextCat=categories.saveCatalogCategoryInTransaction(f.db,{id:cat.id,name:"Sigara",defaultTaxRate:10});
    assert.equal(nextCat.defaultTaxRate,10);
    assert.equal(f.db.prepare("SELECT tax_rate FROM catalog_products WHERE id=?").get(prod.id).tax_rate,20,"existing product VAT must not change on category update");
    const next=products.saveCatalogProductInTransaction(f.db,{id:prod.id,name:"A",categoryId:cat.id,taxRate:1,idealQuantity:40,trackInventory:true});
    assert.equal(next.taxRate,1,"manual override remains the product authority");
    assert.equal(next.idealQuantity,40);
    const fresh=products.saveCatalogProductInTransaction(f.db,{name:"B",categoryId:cat.id,trackInventory:false});
    assert.equal(fresh.taxRate,10,"new product inherits latest category rate");
    assert.equal(fresh.idealQuantity,0);
    assert.throws(()=>categories.saveCatalogCategoryInTransaction(f.db,{name:"Bad",defaultTaxRate:101}),/KDV/);
    assert.throws(()=>products.saveCatalogProductInTransaction(f.db,{name:"Bad",idealQuantity:-1}),/İdeal/);
  } finally{ f.close(); }
});
test("disabling inventory preserves existing product data but blocks new tracked products",()=>{
  const f=fixture();
  try {
    const existing=products.saveCatalogProductInTransaction(f.db,{name:"A",trackInventory:true,minimumQuantity:3,idealQuantity:20});
    const before=Number(f.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n);
    f.db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('biz','commerce.catalog',1,'t','t')").run();
    f.db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('biz','commerce.inventory',0,'t','t')").run();
    const saved=products.saveCatalogProductInTransaction(f.db,{id:existing.id,name:"A edited",trackInventory:true,idealQuantity:30});
    assert.equal(saved.name,"A edited");
    assert.equal(saved.idealQuantity,30);
    assert.throws(()=>products.saveCatalogProductInTransaction(f.db,{name:"Cannot enable stock",trackInventory:true}),/Stok takibini/);
    const retail=products.saveCatalogProductInTransaction(f.db,{name:"No stock",trackInventory:false});
    assert.equal(retail.trackInventory,false);
    assert.equal(Number(f.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n),before);
  }finally{f.close();}
});
test("stock suggestion sums real balances, includes above-minimum shortfall and never writes",()=>{
  const f=fixture();
  try{
    const cat=categories.saveCatalogCategoryInTransaction(f.db,{name:"İçecek",defaultTaxRate:10});
    const a=products.saveCatalogProductInTransaction(f.db,{name:"A",categoryId:cat.id,idealQuantity:30,minimumQuantity:10,trackInventory:true});
    const b=products.saveCatalogProductInTransaction(f.db,{name:"B",categoryId:cat.id,idealQuantity:40,minimumQuantity:10,trackInventory:true});
    const location=f.db.prepare("SELECT id FROM inventory_locations WHERE business_id='biz' AND is_primary=1").get().id;
    f.db.prepare("UPDATE inventory_balances SET quantity=12 WHERE product_id=? AND location_id=?").run(a.id,location);
    f.db.prepare("UPDATE inventory_balances SET quantity=45 WHERE product_id=? AND location_id=?").run(b.id,location);
    // Closed warehouses cannot inflate "available" stock used for reorder suggestions.
    f.db.prepare("INSERT INTO inventory_locations(id,business_id,name,code,is_primary,is_active,created_at,updated_at) VALUES('inactive','biz','Kapalı Depo','OLD',0,0,'t','t')").run();
    f.db.prepare("INSERT INTO inventory_balances(product_id,location_id,quantity,updated_at) VALUES(?,'inactive',500,'t')").run(a.id);
    const countBefore=Number(f.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n);
    const rows=stocking.listStockReplenishment(f.path);
    assert.equal(rows.length,1);
    assert.equal(rows[0].productId,a.id);
    assert.equal(rows[0].quantity,12);
    assert.equal(rows[0].minimumQuantity,10);
    assert.equal(rows[0].suggestedQuantity,18);
    assert.equal(Number(f.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n),countBefore);
    enabled=[];assert.throws(()=>stocking.listStockReplenishment(f.path),/Stok takibi/);enabled=["commerce.inventory"];
    f.db.prepare("UPDATE inventory_balances SET quantity=31 WHERE product_id=?").run(a.id);
    assert.deepEqual(stocking.listStockReplenishment(f.path),[]);
  }finally {f.close();enabled=["commerce.inventory"];}
});

test("Android replenishment is bounded, explicitly truncated and uses the same stock SQL",()=>{
  const f=fixture();
  try {
    const insert=f.db.prepare("INSERT INTO catalog_products(id,business_id,name,ideal_quantity,track_inventory,created_at,updated_at) VALUES(?,'biz',?,1,1,'t','t')");
    f.db.exec("BEGIN IMMEDIATE");
    for(let i=0;i<1203;i++) {
      const id="mobile-stocking-"+String(i).padStart(4,"0");
      insert.run(id,"Ürün "+String(i).padStart(4,"0"));
    }
    f.db.exec("COMMIT");
    const full=stocking.listStockReplenishment(f.path);
    const mobile=stocking.listAndroidStockReplenishment(f.path);
    assert.equal(full.length,1203);
    assert.equal(mobile.rows.length,1200);
    assert.equal(mobile.truncated,true);
    assert.deepEqual(mobile.rows,full.slice(0,1200));
    assert.equal(Number(f.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n),0);
    assert.equal(Number(f.db.prepare("SELECT COUNT(*) n FROM purchase_orders").get().n),0);
  }finally{f.close();}
});
