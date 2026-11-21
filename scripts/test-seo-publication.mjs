import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import ts from "typescript";
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const jobs=[];
const sync={queueSyncJob:(db,job)=>jobs.push(job)};
const shared={
  SEO_FIELDS:["title","description","og_title","og_description"],
  SEO_PAGE_KEYS:["home","about","rooms","restaurant","menu","catalog","gallery","announcements","reviews","contact"],
  PUBLIC_TRANSLATION_KINDS:["business","room","table","menu_category","menu_product","catalog_category","catalog_product","gallery","marketing","site_text","seo"],
  PUBLIC_LANGUAGES:[
    {code:"tr",locale:"tr-TR"},{code:"en",locale:"en"},{code:"de",locale:"de"}
  ]
};
function load(path,extra={}){
  const source=ts.transpileModule(readFileSync(path,"utf8"),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const module={exports:{}};
  new Function("module","exports","require",source)(module,module.exports,key=>{
    if(key==="@yardimci-asistan/shared")return shared;
    if(key==="./sync-runtime-store.js"||key==="./sync-runtime-store")return sync;
    if(key==="../public-site-catalog")return {validateSiteCatalog:x=>x};
    if(key in extra)return extra[key];
    if(key.startsWith("node:"))return require(key);
    throw Error("Unmocked SEO dependency: "+key);
  });
  return module.exports;
}
const seo=load("apps/desktop-app/electron/database/seo-page-store.ts");
const {PublicTranslationStore}=load("apps/desktop-app/electron/database/public-translation-store.ts");
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),"ya-seo-"));
  const db=new DatabaseSync(join(dir,"db.sqlite"));
  db.exec(readFileSync("apps/desktop-app/db/schema.sql","utf8"));
  db.prepare("INSERT INTO business(id,name,display_name,profile_id,created_at,updated_at) VALUES('b','Pansiyon','Pansiyon','pension','t','t')").run();
  db.prepare("INSERT INTO public_translation_settings(business_id,enabled,target_languages_json,updated_at) VALUES('b',1,'[\"en\",\"de\"]','t')").run();
  const translations=new PublicTranslationStore(db);
  return {db,translations,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
function source(){
  return {title:"Oda Rezervasyonu",description:"Konaklama ve odalar hakkında bilgiler.",
    og_title:"Pansiyon Odaları",og_description:"Odalarımızı inceleyin."};
}
test("SEO active languages mirror the one translation setting; storage rejects unsafe and unknown keys",()=>{
  const f=fixture();
  try {
    assert.deepEqual(seo.readSeoPages(f.db).languages,["tr","en","de"]);
    assert.equal(seo.readSeoPages(f.db).pages.length,10);
    assert.throws(()=>seo.saveSeoSource(f.db,"unknown",source(),""),/SEO sayfası/);
    assert.throws(()=>seo.saveSeoSource(f.db,"rooms",{...source(),title:"<script>"}, ""),/SEO alanı/);
    assert.equal(f.db.prepare("SELECT count(*) n FROM seo_page_sources").get().n,0);
    seo.saveSeoSource(f.db,"rooms",source(),"");
    assert.equal(f.db.prepare("SELECT count(*) n FROM seo_page_sources").get().n,1);
    assert.equal(seo.publicSeoPages(f.db).pages.rooms?.title,"Oda Rezervasyonu");
    assert.ok(jobs.includes("business_context_publish"));
    assert.throws(()=>seo.saveSeoSource(f.db,"rooms",source(),""),/Yeniden yükleyin/);
    f.db.prepare("UPDATE public_translation_settings SET enabled=0 WHERE business_id='b'").run();
    assert.deepEqual(seo.readSeoPages(f.db).languages,["tr"]);
    assert.equal(seo.publicSeoPages(f.db).pages.rooms?.title,"Oda Rezervasyonu");
  }finally{f.close();}
});
test("SEO follows canonical translation records: AI never replaces manual; stale text never publishes",()=>{
  const f=fixture();try {
    seo.saveSeoSource(f.db,"rooms",source(),"");
    const before=f.translations.get({kind:"seo",id:"rooms"},"en");
    assert.equal(before.fields.length,4);
    const titleField=before.fields.find(field=>field.field==="title");
    assert.ok(titleField);
    f.translations.saveManual({kind:"seo",id:"rooms",language:"en",fields:[
      {field:"title",sourceHash:titleField.sourceHash,text:"Guesthouse Rooms"}
    ]});
    const manual=f.translations.get({kind:"seo",id:"rooms"},"en").fields.find(field=>field.field==="title");
    assert.equal(manual.origin,"manual");
    assert.equal(manual.state,"ready");
    assert.equal(f.translations.acceptAi({kind:"seo",id:"rooms"},"en",manual,"AI Overwrite"),false);
    const pub=f.translations.localization([{kind:"seo",id:"rooms",fields:source()}]);
    assert.equal(pub.translations.seo.rooms.en.title,"Guesthouse Rooms");
    const row=seo.readSeoPages(f.db).pages.find(p=>p.page==="rooms");
    assert.ok(row);
    seo.saveSeoSource(f.db,"rooms",{...source(),title:"Yeni Oda Başlığı"},row.updatedAt);
    const stale=f.translations.get({kind:"seo",id:"rooms"},"en").fields.find(field=>field.field==="title");
    assert.equal(stale.state,"stale");
    assert.equal(stale.origin,"manual");
    assert.equal(f.translations.acceptAi({kind:"seo",id:"rooms"},"en",stale,"AI Replaced"),false);
    const published=f.translations.localization([{
      kind:"seo",id:"rooms",fields:{...source(),title:"Yeni Oda Başlığı"}
    }]);
    assert.equal(published.translations.seo?.rooms?.en?.title,undefined);
    f.translations.saveManual({kind:"seo",id:"rooms",language:"en",fields:[
      {field:"title",sourceHash:createHash("sha256").update("Yeni Oda Başlığı").digest("hex"),text:"New Rooms"}
    ]});
    const latest=f.translations.localization([{kind:"seo",id:"rooms",fields:{...source(),title:"Yeni Oda Başlığı"}}]);
    assert.equal(latest.translations.seo.rooms.en.title,"New Rooms");
  }finally{f.close();}
});
