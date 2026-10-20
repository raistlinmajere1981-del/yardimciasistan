import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync,readFileSync,rmSync,mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "vite";
import { chromium,expect } from "@playwright/test";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const require=createRequire(import.meta.url);
const {createTransferPlan,applyTransferPlan,collectTransferExport}=require("../apps/desktop-app/dist-electron/data-transfer-service.js");
const {parseTransferFile,suggestTransferMapping}=require("../apps/desktop-app/dist-electron/data-transfer-format.js");
const {listCustomersPage,getCustomer,getCustomers}=require("../apps/desktop-app/dist-electron/database/customer-store.js");
const {readBusinessCapabilitySnapshot}=require("../apps/desktop-app/dist-electron/business-capability-store.js");
const {setTimeout:delay}=await import("node:timers/promises");
const root=mkdtempSync(join(tmpdir(),"ya-transfer-ui-")),path=join(root,"fixture.sqlite"),db=new DatabaseSync(path);
db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));db.exec("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Test','Test','market','t','t')");
for(const c of ["core.customers","commerce.catalog","commerce.wholesale","channel.online_sales","commerce.inventory"])db.prepare("INSERT INTO business_capabilities(business_id,capability_id,is_enabled,created_at,updated_at) VALUES('b',?,1,'t','t')").run(c);
const insert=db.prepare("INSERT INTO customers(id,full_name,phone,created_at,updated_at) VALUES (?,?,?,'t','t')");db.exec("BEGIN");for(let n=1;n<=650;n++)insert.run(`customer-${n}`,`Müşteri ${String(n).padStart(3,"0")}`,`+90555${String(n).padStart(7,"0")}`);db.exec("COMMIT");
db.prepare("INSERT INTO customer_commercial_profiles(customer_id,business_id,company_name,dealer_status,created_at,updated_at) VALUES ('customer-650','b','Firma650','active','t','t')").run();
const dashboard={customers:getCustomers(db),customerRoomStays:[],reservations:[],hospitalityNotifications:[],rooms:[],requests:[],roomOperations:[],menu:{categories:[],items:[]},kbsOverview:{enabled:false,configured:false}};
const images={validate(){},async prepare(){throw new Error("fixture has no images");}};
const document=await parseTransferFile("pilot.csv",Buffer.from("name;sku;salePrice;taxRate;trackInventory;currency;unit\nYeni ürün;NEW;125,50;20;false;TRY;piece\nBozuk fiyat;ERR;abc;20;false;TRY;piece\n"),"products");
let plan=null,result=null,applyCalls=0,locked=false;
const server=await createServer({root:resolve("apps/desktop-app"),configFile:resolve("apps/desktop-app/vite.renderer.config.ts"),server:{port:0,strictPort:false}});await server.listen();
let browser;
try{
 browser=await launchChromiumForSmoke(chromium);const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(initial=>{
  window.__transferInitial=initial;const listeners=new Set();
  const call=async(method,...args)=>{const response=await fetch(`/transfer-api/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args)});const payload=await response.json();if(!payload.ok)throw new Error(payload.message);return payload.value;};
  window.yardimciDesktop={dataTransfer:{pick:entity=>call("pick",entity),upload:(...args)=>call("pick",args[0]),preview:(...args)=>call("preview",...args),apply:async(...args)=>{listeners.forEach(fn=>fn({stage:"Kayıtlar uygulanıyor",done:0,total:2}));return call("apply",...args);},rows:(...args)=>call("rows",...args),summary:(...args)=>call("summary",...args),export:(...args)=>call("export",...args),report:(...args)=>call("report",...args),release:()=>Promise.resolve(),onProgress:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}},listCustomers:query=>call("customers",query),getCustomer:id=>call("customer",id),getDashboardData:()=>Promise.resolve(initial.dashboard),getBusinessMessagingConfiguration:()=>Promise.resolve({sms:{enabled:false},whatsapp:{enabled:false}}),getBusinessMessagingStatus:()=>Promise.resolve({enabled:false}),getBusinessMessageConfiguration:()=>Promise.resolve({enabled:false}),commerce:{reorderCatalog:async()=>[],listProducts:async()=>[],listCategories:async()=>[]}};
 },{dashboard,snapshot:readBusinessCapabilitySnapshot(path)});
 await page.route("**/transfer-api/*",async route=>{try{const method=new URL(route.request().url()).pathname.split("/").at(-1),args=route.request().postDataJSON();let value;
 if(locked)throw new Error("Uygulama kilitli");
 if(method==="pick")value={token:"test",name:"pilot.csv",format:"csv",headers:document.headers,mapping:suggestTransferMapping(document.headers,"products"),total:document.records.length,warnings:[]};
 if(method==="preview"){plan=createTransferPlan(path,"products",document,args[1],args[2],images);value=plan.preview;}
 if(method==="rows")value=(result?.rows??plan.rows.map(r=>r.view)).filter(r=>args[1]==="all"||r.status===args[1]).slice(args[2],args[2]+50);
 if(method==="apply"){applyCalls++;await delay(1200);result=await applyTransferPlan(path,plan,images,()=>{if(locked)throw new Error("Uygulama kilitli");},()=>{});value=result;}
 if(method==="summary"){const collected=collectTransferExport(path,args[0]);value={records:collected.records.length,images:collected.images};}
 if(method==="export"||method==="report")value={token:"test",name:"fixture.zip",path:"/test/fixture.zip",records:method==="report"?2:1,images:0,warnings:[]};
 if(method==="customers")value=listCustomersPage(db,args[0]);if(method==="customer")value=getCustomer(db,args[0]);
 await route.fulfill({json:{ok:true,value}});
 }catch(error){await route.fulfill({json:{ok:false,message:error.message}});}});
 await page.route("**/transfer-ui",async route=>route.fulfill({contentType:"text/html",body:await server.transformIndexHtml("/transfer-ui",`<html><body><div id="root"></div><script type="module" src="/@fs/${resolve("scripts/fixtures/data-transfer.tsx")}"></script></body></html>`)}));
 await page.goto(`${server.resolvedUrls.local[0]}transfer-ui`);const launcher=page.getByRole("button",{name:"Ürün verilerini içe/dışa aktar"});await launcher.click();const dialog=page.getByRole("dialog",{name:"Ürün İçe/Dışa Aktar"});await expect(page.locator("dialog[open]")).toHaveCount(1);
 await dialog.getByRole("button",{name:"Dosya seç",exact:true}).click();await expect(dialog.getByText("pilot.csv · CSV · 2 kayıt")).toBeVisible();await expect(dialog.getByLabel("Yeni ürünleri aktif yap")).not.toBeChecked();await expect(dialog.getByLabel("Webde yayınla",{exact:true})).not.toBeChecked();await dialog.getByRole("button",{name:"Analiz et ve önizle"}).click();await expect(dialog.getByText("Yeni 1",{exact:true})).toBeVisible();await expect(dialog.getByText("Hatalı 1",{exact:true})).toBeVisible();await dialog.getByRole("button",{name:/2\. Yeni ürün/}).click();await expect(dialog.getByRole("columnheader",{name:"Eski değer"})).toBeVisible();
 mkdirSync("artifacts/screenshots/data-transfer",{recursive:true});await page.screenshot({path:"artifacts/screenshots/data-transfer/preview.png"});await dialog.getByRole("button",{name:"Onaya geç"}).click();await expect(dialog.getByText("Aktarımı onayla",{exact:true})).toBeVisible();await page.screenshot({path:"artifacts/screenshots/data-transfer/confirm.png"});await dialog.getByRole("button",{name:"Geri dön"}).click();await dialog.getByRole("button",{name:"Onaya geç"}).click();await dialog.getByRole("button",{name:"1 kaydı içe aktar"}).click();await expect(dialog.getByRole("button",{name:"Aktarım panelini kapat"})).toBeDisabled();await page.keyboard.press("Escape");await expect(dialog).toBeVisible();await expect(dialog.getByText("Eklenen: 1 · Güncellenen: 0 · Atlanan: 0 · Hata: 1")).toBeVisible();assert.equal(applyCalls,1);assert.equal(db.prepare("SELECT is_active FROM catalog_products WHERE sku='NEW'").get().is_active,0);await page.screenshot({path:"artifacts/screenshots/data-transfer/result.png"});await dialog.getByRole("button",{name:"Sonuç raporunu indir"}).click();await expect(dialog.getByText(/Sonuç raporu kaydedildi/)).toBeVisible();
 for(const width of [390,320]){await page.setViewportSize({width,height:800});await expect(dialog).toBeVisible();const box=await dialog.boundingBox();assert(box.width<=width);await page.screenshot({path:`artifacts/screenshots/data-transfer/result-${width}.png`});}
 await page.setViewportSize({width:1440,height:1000});await dialog.getByRole("button",{name:"Dışa Aktar",exact:true}).click();await expect(dialog.getByText("1 kayıt · 0 görsel kaynağı")).toBeVisible();await dialog.getByRole("button",{name:"Dosyayı dışa aktar"}).click();await expect(dialog.getByText("Kaydedildi: /test/fixture.zip")).toBeVisible();await dialog.getByRole("button",{name:"Şablon İndir",exact:true}).click();await dialog.getByRole("button",{name:"Şablonu kaydet"}).click();await expect(dialog.getByRole("button",{name:"Aktarım panelini kapat"})).toBeEnabled();await page.keyboard.press("Escape");await expect(launcher).toBeFocused();
 await page.getByRole("button",{name:"Müşteriler",exact:true}).click();await expect(page.getByRole("heading",{name:"50 / 650 kayıt"})).toBeVisible();await expect(page.locator(".customer-record-row")).toHaveCount(50);
 for(const n of [501,650]){await page.getByPlaceholder("Ad, telefon, firma, vergi no veya not").fill(`Müşteri ${n}`);await expect(page.getByRole("button",{name:`Müşteri ${n}`,exact:true})).toBeVisible();await page.getByRole("button",{name:`Müşteri ${n}`,exact:true}).click();const customer=page.getByRole("dialog",{name:`Müşteri ${n}`,exact:true});await expect(customer).toBeVisible();await expect(customer.getByLabel("Ad soyad",{exact:true})).toHaveValue(`Müşteri ${n}`);await page.keyboard.press("Escape");}
 await page.getByPlaceholder("Ad, telefon, firma, vergi no veya not").fill("");await page.getByRole("button",{name:"Bayiler",exact:true}).click();await expect(page.getByRole("button",{name:"Müşteri 650",exact:true})).toBeVisible();await expect(page.locator(".customer-record-row")).toHaveCount(1);
 await page.getByRole("button",{name:"Müşteri verilerini içe/dışa aktar"}).click();const customersDialog=page.getByRole("dialog",{name:"Müşteri İçe/Dışa Aktar"});await customersDialog.getByRole("button",{name:"Dışa Aktar",exact:true}).click();await expect(customersDialog.getByLabel("Kimlik, pasaport ve belge alanlarını bilinçli olarak dahil et")).not.toBeChecked();locked=true;await customersDialog.getByRole("button",{name:"Dosyayı dışa aktar"}).click();await expect(customersDialog.getByRole("alert")).toContainText("Uygulama kilitli");locked=false;await page.keyboard.press("Escape");
 assert.deepEqual(errors,[]);console.log("data-transfer-ui-smoke-ok: preview/confirm/result, one modal, busy/Escape/focus, 320/390px, 650 customer search/open/filter");
}finally{await browser?.close();await server.close();db.close();rmSync(root,{recursive:true,force:true});}
