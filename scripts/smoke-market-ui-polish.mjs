import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync,existsSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";

const require=createRequire(import.meta.url);
const cache=new Map();
function load(file) {
  if(cache.has(file))return cache.get(file);
  const exports={};
  cache.set(file,exports);
  const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX
  }}).outputText;
  runInNewContext(code,{exports,window:{yardimciDesktop:null},crypto:globalThis.crypto,
    require:name=>{
      if(!name.startsWith("."))return require(name);
      const stem=resolve(dirname(file),name);
      const path=[stem,stem+".ts",stem+".tsx"].find(existsSync);
      assert.ok(path, "Missing local module: "+name);
      return load(path);
    }
  });
  return exports;
}
const app=file=>load(resolve("apps/desktop-app/src",file));
const {BusinessProfileOptionEditor}=app("components/settings/BusinessCapabilitySettings.tsx");
const {WebAvailabilityProvider}=app("app/web-availability.tsx");
const {BUSINESS_CAPABILITIES:C}=require("@yardimci-asistan/shared");
const profileOptions=[C.INVENTORY,C.RETAIL_PURCHASING,C.RETAIL_SUPPLIERS];
function capabilitiesMarkup(options) {
  return renderToStaticMarkup(createElement(WebAvailabilityProvider,{available:false},
    createElement(BusinessProfileOptionEditor,{
      profileId:"market",selectedCapabilities:options,onChange:()=>{}
    })));
}
const locked=capabilitiesMarkup(profileOptions);
const stockInput=locked.match(/<input[^>]*aria-label="Stok takibi"[^>]*>/)?.[0] ?? "";
assert.match(stockInput,/checked/,"Required stock remains checked");
assert.match(stockInput,/disabled/,"Required stock is grey and not toggleable");
assert.match(locked,/settings-profile-option is-required/);
assert.doesNotMatch(locked,/Stok takibi kapatılırsa/,"Old explanatory paragraph removed");
const editable=capabilitiesMarkup([C.INVENTORY]);
assert.doesNotMatch(editable.match(/<input[^>]*aria-label="Stok takibi"[^>]*>/)?.[0]??"",/disabled/);

const {ProductFormFields}=app("components/market/ProductFormFields.tsx");
const {emptyProductForm}=app("app/product-model.ts");
const form=emptyProductForm(true);
const product=renderToStaticMarkup(createElement(ProductFormFields,{
  form:{...form,name:"Deneme Ürün",description:"Test açıklaması"},
  categories:[],inventoryEnabled:true,productDataEnabled:false,
  purchasingEnabled:true,retailFieldsEnabled:true,wholesaleEnabled:true,
  mode:"details",onChange:()=>{},onStateChange:()=>{}
}));
assert.match(product,/market-product-barcode-description/);
const barcodeSection=product.match(/<div class="market-product-barcode-description[^"]*">([\s\S]*?)<\/div>/)?.[1]??"";
assert.match(barcodeSection,/Barkod/);
assert.match(barcodeSection,/Açıklama/);
assert.equal((barcodeSection.match(/<textarea/g)??[]).length,0,"Description is a one-line input");
assert.match(barcodeSection,/Açıklama<input[^>]*value="Test açıklaması"/);
assert.ok(barcodeSection.indexOf("Açıklama") < barcodeSection.indexOf("Barkod"),"Description is under Brand, barcode under SKU");
assert.doesNotMatch(product,/detail-section-card__heading[^>]*><h3>Açıklama/,"No redundant description panel");
assert.ok(product.indexOf("Alış fiyatı")<product.indexOf("Perakende fiyat"),"Purchase price leads pricing row");
const noRetail=renderToStaticMarkup(createElement(ProductFormFields,{
  form,categories:[],inventoryEnabled:true,productDataEnabled:false,
  purchasingEnabled:false,retailFieldsEnabled:false,wholesaleEnabled:false,
  mode:"details",onChange:()=>{},onStateChange:()=>{}
}));
assert.match(noRetail,/Açıklama/,"Description remains for non-retail products");
assert.doesNotMatch(noRetail,/Alış fiyatı/,"Purchase field follows purchasing capability");

const css=readFileSync("apps/desktop-app/src/styles/pages/market.css","utf8");
for(const selector of [".market-sale-product-thumb",".market-list-product-thumb",".market-product-image-card.has-image"]) {
  const match=css.match(new RegExp(selector.replaceAll(".","\\.")+" \\{([^}]+)\\}"));
  assert.ok(match,selector+" present");
  assert.match(match[1],/background:\s*var\(--color-product-image-mat\)/,
    "Product photo uses the shared neutral mat token");
}
const semanticTokens=readFileSync("apps/desktop-app/src/styles/tokens/semantic.css","utf8");
assert.match(semanticTokens,/--color-product-image-mat:\s*#f7f7f5;/,
  "Neutral product photo surface retains its intentional fixed color");
assert.match(semanticTokens,/--color-product-image-edge:\s*#d6dade;/,
  "Neutral product photo edge is owned by the same token palette");
assert.match(css,/@container \(max-width: 43rem\)[\s\S]*?market-product-barcode-description/);

const customer=readFileSync("apps/desktop-app/src/components/customers/CustomerFormFields.tsx","utf8");
const frame=readFileSync("apps/desktop-app/src/components/app/DesktopAppFrame.tsx","utf8");
assert.match(customer,/\{birthdayMessagingEnabled && <label className="form-check customer-birthday-toggle">/);
assert.match(frame,/birthdayMessagingEnabled:\s*whatsappEnabled && setupData\.servicePreferences\.whatsapp\s*&& setupData\.birthdaySettings\.enabled/,
  "Birthday messaging requires WhatsApp capability, enabled service and birthday setting");
console.log("market-ui-polish-smoke-ok: stock dependency, birthday visibility, product positions, neutral images");
