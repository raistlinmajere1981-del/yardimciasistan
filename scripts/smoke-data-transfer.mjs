import { spawn } from "node:child_process";
import { getLocalElectronExecutable } from "./test-helpers/local-electron.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const require=createRequire(import.meta.url);
const {createTransferPlan,applyTransferPlan,collectTransferExport,createTransferExport}=require("../apps/desktop-app/dist-electron/data-transfer-service.js");
const {parseTransferFile,encodeTransferFile,suggestTransferMapping,transferNumber,readTransferArchive,transferHash,imageMime,MAX_TRANSFER_BYTES}=require("../apps/desktop-app/dist-electron/data-transfer-format.js");
const {DEFAULT_TRANSFER_PREFERENCES:P}=require("../apps/desktop-app/dist-electron/data-transfer-contract.js");
const {listCustomersPage,getCustomer}=require("../apps/desktop-app/dist-electron/database/customer-store.js");
const writeXlsx=require("write-excel-file/node").default;
const {zipSync,strToU8}=require("fflate");
const root=mkdtempSync(join(tmpdir(),"ya-data-transfer-"));
function database(name){const path=join(root,`${name}.sqlite`),db=new DatabaseSync(path);db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));db.exec("PRAGMA foreign_keys=ON; INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Test','Test','market','t','t')");for(const c of ["commerce.catalog","core.customers","commerce.wholesale","channel.online_sales","commerce.inventory","food_service.menu"]){db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'t','t')").run(c);}return {path,db};}
// Only image transport is adapted here. Native decoding/archiving has a separate Electron smoke.
const images={validate(bytes){imageMime(bytes);},async prepare(path,productId,bytes,originals){const assetPath=`assets/products/${productId}/image_00000000-0000-4000-8000-000000000000.jpg`;mkdirSync(join(root,"assets","products",productId),{recursive:true});writeFileSync(join(root,assetPath),bytes);const originalAssets=(originals??[bytes]).map((original,i)=>{const format=imageMime(original),originalPath=`assets/products/${productId}/original_${i}.${format.split("/")[1]}`;writeFileSync(join(root,originalPath),original);return {assetPath:originalPath,hash:transferHash(original),format};});return {productId,assetPath,sourceUrl:"",license:"",originalAssets};}};
const source=(headers,records)=>({headers,records,assets:{},warnings:[],format:"csv"});
const plan=(db,entity,document,prefs=P)=>createTransferPlan(db.path,entity,document,suggestTransferMapping(document.headers,entity),{...prefs},images);
const apply=async(db,p)=>applyTransferPlan(db.path,p,images,()=>{},()=>{});
const open=[];
try{
  for(const [s,n]of [["1.234,56",1234.56],["1,234.56",1234.56],["1234,56",1234.56],["28251.50",28251.5],["0",0]])assert.equal(transferNumber(s),n);
  assert.equal(transferNumber(""),undefined);assert.throws(()=>transferNumber("1,2,3"));
  for(const delimiter of [",",";"]){const doc=await parseTransferFile("a.csv",Buffer.from(`\ufeffname${delimiter}sku${delimiter}salePrice\r\n"Çay; kahve"${delimiter}A01${delimiter}"1.234,56"\r\n`),"products");assert.equal(doc.records[0].name,"Çay; kahve");assert.equal(transferNumber(doc.records[0].salePrice),1234.56);}
  const xlsx=await writeXlsx([[{value:"Müşteri adı"},{value:"Telefon"},{value:"Doğum tarihi"},{value:"Vergi numarası"}],[{value:"Örnek Kişi"},{type:Number,value:905551112233},{type:Date,value:new Date("1990-02-03T00:00:00Z"),format:"yyyy-mm-dd"},{type:Number,value:1234567890}]]).toBuffer();
  const excel=await parseTransferFile("test.xlsx",xlsx,"customers");assert.equal(excel.records[0]["Doğum tarihi"],"1990-02-03");assert.equal(excel.records[0].Telefon,"905551112233");
  const fixture=database("customers");open.push(fixture.db);
  const records=Array.from({length:650},(_,i)=>({fullName:`Müşteri ${String(i+1).padStart(3,"0")}`,phone:`+90555${String(i+1).padStart(7,"0")}`,email:`customer${i+1}@example.test`,companyName:i%2===0?`Firma ${i+1}`:"",dealerStatus:i%2===0?"active":"",priceGroup:i%2===0?"dealer_a":"",taxNumber:i%2===0?String(1000000000+i):"",notes:"=HYPERLINK(unsafe)"}));
  const document=source(Object.keys(records[0]),records),p=plan(fixture,"customers",document);
  assert.equal(p.preview.counts.new,650);assert.equal(p.preview.counts.error,0,JSON.stringify(p.preview.rows.filter(r=>r.status==="error")));
  assert.equal(fixture.db.prepare("SELECT COUNT(*) n FROM customers").get().n,0,"preview rolls back all writes");
  assert.equal((await apply(fixture,p)).added,650);
  const page=listCustomersPage(fixture.db,{limit:50});assert.equal(page.total,650);assert.equal(page.items.length,50);
  for(const n of [501,650]){const result=listCustomersPage(fixture.db,{search:`Müşteri ${n}`});assert.equal(result.matched,1);assert.equal(getCustomer(fixture.db,result.items[0].id).fullName,`Müşteri ${n}`);}
  assert.equal(listCustomersPage(fixture.db,{filter:"dealers"}).matched,325);
  assert.equal(listCustomersPage(fixture.db,{search:"HYPERLINK"}).matched,650,"Customer notes must be searchable");
  assert.equal(fixture.db.prepare("PRAGMA table_info(customers)").all().some(c=>c.name==="tags_json"),false,"Customer tag column must not exist");
  assert.equal(fixture.db.prepare("PRAGMA table_info(customer_commercial_profiles)").all().some(c=>c.name==="notes"),false,"Separate commercial notes must not exist");
  assert.equal(plan(fixture,"customers",document).preview.counts.skip,650);
  // Existing dealer commercial profile fields must appear as *old values* in the row preview.
  const third=fixture.db.prepare("SELECT id FROM customers WHERE full_name='Müşteri 003'").get();
  fixture.db.prepare("UPDATE customer_commercial_profiles SET tax_office='Eski Daire', authorized_person='Eski Yetkili', payment_term_days=30 WHERE customer_id=?").run(third.id);
  const edit=source(["phone","companyName","taxOffice","taxNumber","authorizedPerson","dealerStatus","priceGroup","paymentTermDays"],[{
    phone:records[2].phone, companyName:"Firma 3 Yeni",taxOffice:"Yeni Daire",
    taxNumber:records[2].taxNumber,authorizedPerson:"Yeni Yetkili",dealerStatus:"active",
    priceGroup:"dealer_b",paymentTermDays:"45"
  }]);
  const editPlan=plan(fixture,"customers",edit,{...P,conflicts:"update"});
  assert.equal(editPlan.preview.counts.update,1,JSON.stringify(editPlan.preview.rows));
  assert.deepEqual(Object.fromEntries(["companyName","taxOffice","taxNumber","authorizedPerson","dealerStatus","priceGroup","paymentTermDays"]
    .map(field=>[field,editPlan.preview.rows[0].before[field]])),{
      companyName:"Firma 3",taxOffice:"Eski Daire",taxNumber:records[2].taxNumber,
      authorizedPerson:"Eski Yetkili",dealerStatus:"active",priceGroup:"dealer_a",
      paymentTermDays:"30"
    },"preview must show prior dealer data flattened under exported field keys");
  assert.equal(editPlan.preview.rows[0].after.companyName,"Firma 3 Yeni");
  assert.equal(fixture.db.prepare("SELECT company_name FROM customer_commercial_profiles WHERE customer_id=?").get(third.id).company_name,"Firma 3","preview must not update data");
  assert.equal((await apply(fixture,editPlan)).updated,1);
  assert.equal(fixture.db.prepare("SELECT company_name FROM customer_commercial_profiles WHERE customer_id=?").get(third.id).company_name,"Firma 3 Yeni");
  const exported=collectTransferExport(fixture.path,{entity:"customers",format:"zip",scope:"all",includeImages:false,includeIdentity:false});assert.equal(exported.records.length,650);assert(!exported.headers.includes("identityNumber"));assert(exported.records.some(r=>r.companyName==="Firma 1"));
  for(const format of ["csv","xlsx","zip"]){const encoded=await encodeTransferFile(format,"customers",exported.headers,exported.records);const decoded=await parseTransferFile(`customers.${format}`,encoded,"customers");assert.equal(decoded.records.length,650);assert.equal(decoded.records[0].notes,"=HYPERLINK(unsafe)");const target=database(`roundtrip-${format}`);open.push(target.db);const roundtrip=plan(target,"customers",decoded);assert.equal(roundtrip.preview.counts.new,650);assert.equal((await apply(target,roundtrip)).added,650);assert.equal(target.db.prepare("SELECT COUNT(*) n FROM customer_commercial_profiles WHERE dealer_status='active' AND price_group='dealer_a'").get().n,324);}
  const corrupt=source(["name","sku","salePrice","taxRate","trackInventory"],[{name:"Geçerli Ürün",sku:"A",salePrice:"123,45",taxRate:"",trackInventory:""},{name:"Hatalı ürün",sku:"B",salePrice:"xyz",taxRate:"20",trackInventory:"false"},{name:"Geçerli Ürün",sku:"A",salePrice:"123,45",taxRate:"",trackInventory:""}]);
  const productDb=database("products");open.push(productDb.db);
  const cp=plan(productDb,"products",corrupt);assert.deepEqual(cp.preview.counts,{new:1,update:0,skip:1,error:1});const outcome=await apply(productDb,cp);assert.deepEqual([outcome.added,outcome.skipped,outcome.errors],[1,1,1]);
  const saved=productDb.db.prepare("SELECT * FROM catalog_products").get();assert.equal(saved.is_active,0);assert.equal(saved.sale_price,123.45);assert(saved.description.includes("doğrulanmalı"));assert.equal(productDb.db.prepare("SELECT is_published FROM commerce_product_publications").get().is_published,0);assert.equal(productDb.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n,0);
  assert.equal(plan(productDb,"products",corrupt).preview.counts.new,0);
  const update=source(["sku","name"],[{sku:"A",name:"Yeni ad"}]);const u=plan(productDb,"products",update,{...P,conflicts:"update"});assert.equal((await apply(productDb,u)).updated,1);assert.equal(productDb.db.prepare("SELECT sale_price FROM catalog_products").get().sale_price,123.45);
  const stale=plan(productDb,"products",update,{...P,conflicts:"update"});productDb.db.exec("UPDATE catalog_products SET updated_at='changed'");await assert.rejects(()=>apply(productDb,stale),/değişti/);
  const full=source(["name","sku","salePrice","taxRate","trackInventory","unit","currency","purchasePrice"],[{name:"Yayın ürünü",sku:"PUBLIC",salePrice:"100",taxRate:"20",trackInventory:"false",unit:"piece",currency:"TRY",purchasePrice:"50"}]);const publishPlan=plan(productDb,"products",full,{...P,activate:true,publish:true});assert.equal(publishPlan.preview.publishable,1);assert.equal((await apply(productDb,publishPlan)).added,1);assert.equal(productDb.db.prepare("SELECT sale_price FROM catalog_products WHERE sku='PUBLIC'").get().sale_price,100,"gross price is never taxed twice");
  productDb.db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='channel.online_sales'");assert.throws(()=>plan(productDb,"products",full,{...P,publish:true}),/özellik/);
  // Stock counts and menu links use their canonical transaction owners.
  const menuSource=source(["name","sku","salePrice","taxRate","trackInventory","stockQuantity","unit","currency","purchasePrice","menuCategory","menuPriceOverride","allergens","tags","menuAvailable"],[{name:"Menü çayı",sku:"MENU",salePrice:"50",taxRate:"10",trackInventory:"true",stockQuantity:"12",unit:"piece",currency:"TRY",purchasePrice:"10",menuCategory:"İçecekler",menuPriceOverride:"65,5",allergens:"süt|fındık",tags:"sıcak",menuAvailable:"true"}]);
  const menuPlan=plan(productDb,"products",menuSource,{...P,applyStock:true,menuCategoryId:"__source__"});assert.equal(menuPlan.preview.counts.new,1,JSON.stringify(menuPlan.preview.rows));assert.equal((await apply(productDb,menuPlan)).added,1);
  assert.equal(productDb.db.prepare("SELECT quantity FROM inventory_balances b JOIN catalog_products p ON p.id=b.product_id WHERE p.sku='MENU'").get().quantity,12);
  assert.equal(productDb.db.prepare("SELECT price_override FROM menu_product_entries m JOIN catalog_products p ON p.id=m.product_id WHERE p.sku='MENU'").get().price_override,65.5);
  const menuOut=collectTransferExport(productDb.path,{entity:"products",format:"zip",scope:"filtered",search:"Menü çayı",includeImages:false,includeIdentity:false});assert.equal(menuOut.records[0].menuCategory,"İçecekler");assert.equal(menuOut.records[0].allergens,"süt|fındık");
  const menuTarget=database("menu-roundtrip");open.push(menuTarget.db);const menuBytes=await encodeTransferFile("zip","products",menuOut.headers,menuOut.records);const menuDecoded=await parseTransferFile("menu.zip",menuBytes,"products");assert.equal((await apply(menuTarget,plan(menuTarget,"products",menuDecoded,{...P,menuCategoryId:"__source__"}))).added,1);assert.equal(menuTarget.db.prepare("SELECT price_override FROM menu_product_entries").get().price_override,65.5);
  // Menu is a scope of the same products, never a parallel product writer.
  const menuOptions={entity:"menu",format:"zip",scope:"all",includeImages:false,includeIdentity:false};
  assert.equal(collectTransferExport(productDb.path,menuOptions).records.length,1,"catalog-only products must not leak into menu exports");
  assert.throws(()=>plan(productDb,"menu",menuSource),/kategori seçin/);
  const missingMenu=source(["name","sku"],[{name:"Kategorisiz",sku:"NO-MENU"}]);
  const missingPlan=plan(productDb,"menu",missingMenu,{...P,menuCategoryId:"__source__"});
  assert.equal(missingPlan.preview.counts.error,1);assert.match(missingPlan.preview.rows[0].reasons.join(" "),/Menü kategorisi eksik/);
  assert.equal((await apply(productDb,missingPlan)).added,0);
  const secondMenu=source(menuSource.headers,[{...menuSource.records[0],sku:"MENU-FOOD",name:"Menü yemeği",menuCategory:"Yemekler",trackInventory:"false",menuAvailable:"false"}]);
  const secondPlan=plan(productDb,"menu",secondMenu,{...P,menuCategoryId:"__source__"});
  assert.equal(secondPlan.preview.counts.new,1,JSON.stringify(secondPlan.preview.rows));
  assert.equal((await apply(productDb,secondPlan)).added,1);
  const drinksId=String(productDb.db.prepare("SELECT id FROM menu_categories WHERE name='İçecekler'").get().id);
  const filteredMenu=collectTransferExport(productDb.path,{...menuOptions,scope:"filtered",menuCategoryId:drinksId});
  assert.deepEqual(filteredMenu.records.map(r=>r.sku),["MENU"]);
  assert.equal(collectTransferExport(productDb.path,{...menuOptions,scope:"all",menuCategoryId:drinksId}).records.length,2);
  assert.equal(collectTransferExport(productDb.path,{...menuOptions,scope:"filtered",menuCategoryId:"missing"}).records.length,0);
  assert(collectTransferExport(productDb.path,{...menuOptions,template:"basic"}).headers.includes("menuCategory"));
  for(const format of ["csv","xlsx","zip"]){
    const out=await createTransferExport(productDb.path,{...menuOptions,format},images,()=>{},()=>{});
    const decoded=await parseTransferFile(`menu.${format}`,out.bytes,"menu");
    const target=database(`menu-scope-${format}`);open.push(target.db);
    const importPlan=plan(target,"menu",decoded,{...P,menuCategoryId:"__source__"});
    assert.equal(importPlan.preview.counts.new,2,JSON.stringify(importPlan.preview.rows));
    assert.equal(target.db.prepare("SELECT COUNT(*) n FROM menu_categories").get().n,0,"menu preview must roll back categories too");
    assert.equal((await apply(target,importPlan)).added,2);
    assert.equal(target.db.prepare("SELECT COUNT(*) n FROM menu_product_entries").get().n,2);
    assert.equal(target.db.prepare("SELECT COUNT(*) n FROM catalog_products WHERE is_active=0").get().n,2);
    assert.equal(target.db.prepare("SELECT COUNT(*) n FROM menu_categories WHERE is_active=0").get().n,2);
    assert.equal(target.db.prepare("SELECT COUNT(*) n FROM inventory_movements").get().n,0);
    assert.equal(target.db.prepare("SELECT COUNT(*) n FROM commerce_product_publications WHERE is_published=1").get().n,0);
    const menuValues=collectTransferExport(target.path,menuOptions).records;
    assert.equal(menuValues.find(r=>r.sku==="MENU").menuPriceOverride,"65.5");
    assert.equal(menuValues.find(r=>r.sku==="MENU").allergens,"süt|fındık");
    assert.equal(menuValues.find(r=>r.sku==="MENU-FOOD").menuAvailable,"false");
    assert.equal(plan(target,"menu",decoded,{...P,menuCategoryId:"__source__"}).preview.counts.skip,2);
    if(format==="zip") {
      assert.equal((await parseTransferFile("menu.zip",out.bytes,"products")).records.length,2,"menu archives use catalog product records");
      await assert.rejects(()=>parseTransferFile("menu.zip",out.bytes,"customers"),/kayıt türü/);
    }
  }
  assert.equal((await parseTransferFile("products.zip",menuBytes,"menu")).records.length,1,"existing product archives remain usable from menu");
  const menuEdit=source(["sku","menuCategory","menuPriceOverride"],[{sku:"MENU",menuCategory:"İçecekler",menuPriceOverride:"70"}]);
  const menuEditPlan=plan(productDb,"menu",menuEdit,{...P,conflicts:"update",menuCategoryId:"__source__"});
  assert.equal(menuEditPlan.preview.counts.update,1,JSON.stringify(menuEditPlan.preview.rows));
  assert.equal(menuEditPlan.preview.rows[0].before.menuPriceOverride,"65.5");
  assert.equal(menuEditPlan.preview.rows[0].after.menuPriceOverride,"70");
  assert.equal((await apply(productDb,menuEditPlan)).updated,1);
  assert.equal(productDb.db.prepare("SELECT COUNT(*) n FROM catalog_products WHERE sku='MENU'").get().n,1);
  // A category chosen by the operator also handles files without menu columns.
  const targeted=plan(productDb,"menu",missingMenu,{...P,menuCategoryId:drinksId});
  assert.equal(targeted.preview.rows[0].after.menuCategory,"İçecekler");
  const productsBefore=productDb.db.prepare("SELECT COUNT(*) n FROM catalog_products").get().n;
  productDb.db.exec("UPDATE business_capabilities SET is_enabled=0 WHERE capability_id='food_service.menu'");
  assert.throws(()=>collectTransferExport(productDb.path,menuOptions),/özellik/);
  assert.throws(()=>plan(productDb,"menu",menuSource,{...P,menuCategoryId:"__source__"}),/özellik/);
  await assert.rejects(()=>apply(productDb,targeted),/özellik/);
  assert.equal(productDb.db.prepare("SELECT COUNT(*) n FROM catalog_products").get().n,productsBefore);
  productDb.db.exec("UPDATE business_capabilities SET is_enabled=1 WHERE capability_id='food_service.menu'");
  assert.equal((await apply(productDb,plan(productDb,"menu",missingMenu,{...P,menuCategoryId:drinksId}))).added,1);
  console.log("menu-transfer: menu-only/category exports, CSV/XLSX/ZIP roundtrips, canonical identity, menu before/after, missing category and capability revocation guards");
  const identitySource=source(["name","description"],[{name:"Aynı ad",description:"Bir"},{name:"Aynı ad",description:"İki"}]);assert.equal((await apply(productDb,plan(productDb,"products",identitySource))).added,2);assert.equal(plan(productDb,"products",identitySource).preview.counts.skip,2,"never merge by name");
  const formula=await encodeTransferFile("csv","customers",["fullName"],[{fullName:"=SUM(1,1)"}]);assert(formula.toString().includes("'=SUM"));
  await assert.rejects(()=>parseTransferFile("bad.csv",Buffer.from('name;sku\n"unfinished'),"products"));
  await assert.rejects(()=>parseTransferFile("big.csv",new Uint8Array(MAX_TRANSFER_BYTES+1),"products"));
  await assert.rejects(()=>parseTransferFile("evil.zip",zipSync({"../escape":strToU8("bad")}),"products"),/güvenli/);
  const oversized=zipSync({"oversized":new Uint8Array(129*1024*1024)},{level:1});assert.throws(()=>readTransferArchive(oversized),/boyut/);
  // Teknikel demo import uses the exact external CSV shipped to the pilot operator.
  let demoCsv;
  try { if (process.argv.includes("--external-pilots")) demoCsv=readFileSync("/home/raistlin/teknikel_web/data-import/teknikel-demo-musteriler-30.csv"); }
  catch (error) { if (error.code!=="ENOENT") throw error; }
  if (demoCsv) {
    const demoDb=database("teknikel-demo-customers");open.push(demoDb.db);
    const demoDoc=await parseTransferFile("teknikel-demo-musteriler-30.csv",demoCsv,"customers");
    const demoPlan=plan(demoDb,"customers",demoDoc);
    assert.equal(demoPlan.preview.counts.new,30);
    assert.equal(demoPlan.preview.counts.error,0,JSON.stringify(demoPlan.preview.rows.filter(r=>r.status==="error")));
    const demoResult=await apply(demoDb,demoPlan);
    assert.equal(demoResult.added,30);
    assert.equal(demoDb.db.prepare("SELECT COUNT(*) n FROM customer_commercial_profiles WHERE dealer_status='active'").get().n,10);
    assert.equal(demoDb.db.prepare("SELECT COUNT(*) n FROM customer_commercial_profiles WHERE dealer_status='inactive'").get().n,10);
    assert.equal(demoDb.db.prepare("SELECT COUNT(*) n FROM customers c LEFT JOIN customer_commercial_profiles p ON p.customer_id=c.id WHERE p.customer_id IS NULL").get().n,10);
    assert.equal(listCustomersPage(demoDb.db,{search:"test sipariş ve arama"}).matched,10);
    assert.equal(plan(demoDb,"customers",demoDoc).preview.counts.skip,30);
    console.log("teknikel-demo-customers: 30 created, 10 retail, 10 inactive dealers, 10 active dealers, notes searchable, reimport skipped");
  }
  // Real pilot is optional on other machines, read-only when present.
  let pilot=null;try{if (process.argv.includes("--external-pilots")) pilot=JSON.parse(readFileSync("/home/raistlin/teknikel_catalog_prep/import-review-catalog.json","utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  if(pilot){const pilotDb=database("pilot");open.push(pilotDb.db);const assets={},assetManifest=[];for(const item of JSON.parse(readFileSync("/home/raistlin/teknikel_catalog_prep/image-manifest.json","utf8")).images){const bytes=readFileSync(`/home/raistlin/teknikel_catalog_prep/images-original/${item.archive_filename}`);assert.equal(transferHash(bytes),item.sha256);const path=`assets/${item.archive_filename}`;assets[path]=bytes;assetManifest.push({path,hash:item.sha256,format:imageMime(bytes),productId:"",sku:item.associated_skus[0]});}assert.equal(Object.keys(assets).length,68);
    const pilotRecords=pilot.products.map(p=>({name:p.name,sku:p.sku,category:p.category,brand:p.brand??"",salePrice:p.sale_price_gross_try??"",taxRate:p.tax_rate??"",trackInventory:"",purchasePrice:p.purchase_price??"",sourceId:p.idempotent_external_key,sourceProductUrl:p.source_url,image:p.image_files[0]?`assets/${p.image_files[0]}`:""}));
    const archive=await encodeTransferFile("zip","products",Object.keys(pilotRecords[0]),pilotRecords,assets,assetManifest);const decoded=await parseTransferFile("teknikel.zip",archive,"products");assert.equal(Object.keys(decoded.assets).length,68);
    const pilotPlan=plan(pilotDb,"products",decoded);assert.equal(pilotPlan.preview.counts.new,179);assert.equal(pilotPlan.preview.counts.error,0,JSON.stringify(pilotPlan.preview.rows.filter(r=>r.status==="error")));assert.equal((await apply(pilotDb,pilotPlan)).added,179);
    assert.equal(pilotDb.db.prepare("SELECT COUNT(*) n FROM catalog_products WHERE is_active=0").get().n,179);assert.equal(pilotDb.db.prepare("SELECT COUNT(*) n FROM catalog_products p JOIN catalog_categories c ON c.id=p.category_id WHERE c.name='Diğer'").get().n,151);assert.equal(pilotDb.db.prepare("SELECT COUNT(*) n FROM catalog_categories").get().n,25);assert.equal(pilotDb.db.prepare("SELECT COUNT(*) n FROM catalog_categories WHERE is_active=1").get().n,25,"Imported categories including Diğer must be selectable immediately");assert.equal(pilotDb.db.prepare("SELECT COUNT(*) n FROM commerce_product_publications WHERE is_published=1").get().n,0);assert.equal(pilotDb.db.prepare("SELECT COUNT(*) n FROM catalog_products WHERE image_asset_path<>''").get().n,35);
    assert.equal(plan(pilotDb,"products",decoded).preview.counts.skip,179);
    const out=await createTransferExport(pilotDb.path,{entity:"products",format:"zip",scope:"all",includeImages:true,includeIdentity:false},images,()=>{},()=>{});assert.equal(out.records,179);assert.equal(out.images,68);const again=await parseTransferFile("roundtrip.zip",out.bytes,"products");assert.equal(again.records.length,179);assert.equal(plan(pilotDb,"products",again).preview.counts.skip,179);
    console.log("teknikel-pilot: 179 drafts, 25 active categories, 151 Other, 68 input image files, 35 primary images with all 68 original images preserved; no user DB touched");
  }
  console.log("data-transfer-smoke-ok: 650 customers, full exports/roundtrips, matching, draft/publication gates, malformed files, archive limits");
}finally{for(const db of open)db.close();rmSync(root,{recursive:true,force:true});}

const nativeEnv={...process.env};delete nativeEnv.ELECTRON_RUN_AS_NODE;
const nodeCodec=process.argv.includes("--node-codec");
if(nodeCodec)nativeEnv.PRODUCT_PHOTO_NODE_CODEC="1";
const nativeArgs=nodeCodec?["--require","./scripts/test-helpers/product-photo-node-codec.cjs"]:["--no-sandbox"];
nativeArgs.push("apps/desktop-app/scripts/fixtures/data-transfer.cjs");
if(process.argv.includes("--external-pilots"))nativeArgs.push("--external-pilots");
const native=spawn(nodeCodec?process.execPath:getLocalElectronExecutable(),nativeArgs,{env:nativeEnv,stdio:"inherit"});
const nativeExit=await new Promise((resolve,reject)=>{native.once("error",reject);native.once("exit",resolve);});
assert.equal(nativeExit,0,"native data transfer fixture");
