import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const server = await createServer({root:resolve("apps/desktop-app"),configFile:resolve("apps/desktop-app/vite.renderer.config.ts"),server:{port:0,strictPort:false}});
await server.listen();
let browser;
try {
  browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1440,height:900},locale:"tr-TR"});
  page.setDefaultTimeout(10000);
  page.on("pageerror",e=>{throw e;});
  await page.route("**/gallery-ui-test*",async route=>route.fulfill({contentType:"text/html",body:await server.transformIndexHtml("/gallery-ui-test",
    '<html><body><div id="root"></div><script type="module" src="/@fs/'+resolve("scripts/fixtures/settings-platform.tsx")+'"></script></body></html>')}));
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//,route=>route.abort());
  await page.goto(server.resolvedUrls.local[0]+"gallery-ui-test");
  await expect(page.locator("#settings-gallery-button")).toBeVisible();
  await expect(page.getByText("Konum",{exact:true})).toHaveCount(0);
  const adjacent=await page.evaluate(()=>{
    const name=document.querySelector('label:has(input[placeholder="İşletme adı"])')?.getBoundingClientRect();
    const button=document.querySelector("#settings-gallery-button")?.getBoundingClientRect();
    return {sameRow:Math.abs(name.y-button.y)<40,toRight:button.left>name.left+name.width*0.5};
  });
  assert.deepEqual(adjacent,{sameRow:true,toRight:true});
  await page.evaluate(()=>{
    let saved=[],draft=null;
    const entry=(id,sortOrder)=>({id,kind:"photo",originalName:id+".jpg",mimeType:"image/jpeg",title:id,sortOrder,sizeBytes:2000,updatedAt:"2026-10-18",remoteUrl:"",previewDataUrl:""});
    window.galleryFixture={calls:[],getSaved:()=>saved};
    Object.assign(window.yardimciDesktop,{
      listBusinessGallery:async()=>structuredClone(draft??saved),
      getBusinessGalleryDraftState:async()=>({dirty:draft!==null}),
      addBusinessGalleryPhoto:async()=>{
        draft=[...(draft??saved),entry("photo"+((draft??saved).length+1), (draft??saved).length+1)];
        window.galleryFixture.calls.push("add");
        return {ok:true,message:"Fotoğraf eklendi.",media:structuredClone(draft),dirty:true};
      },
      updateBusinessGalleryPhoto:async({id,kind,title})=>{
        draft=structuredClone(draft??saved);
        if(kind==="cover")draft.forEach(e=>{if(e.kind==="cover")e.kind="photo";});
        draft.find(e=>e.id===id).kind=kind;
        draft.find(e=>e.id===id).title=title;
        return {ok:true,message:"Güncellendi",media:structuredClone(draft),dirty:true};
      },
      moveBusinessGalleryPhoto:async({id,direction})=>{
        draft=structuredClone(draft??saved);
        const ix=draft.findIndex(e=>e.id===id),to=direction==="up"?ix-1:ix+1;
        [draft[ix],draft[to]]=[draft[to],draft[ix]];
        draft.forEach((e,i)=>e.sortOrder=i+1);
        return {ok:true,message:"Sıra değişti",media:structuredClone(draft),dirty:true};
      },
      deleteBusinessGalleryPhoto:async id=>{
        draft=(draft??saved).filter(e=>e.id!==id);
        return {ok:true,message:"Silindi",media:structuredClone(draft),dirty:true};
      },
      commitBusinessGallery:async()=>{
        saved=structuredClone(draft??saved);draft=null;window.galleryFixture.calls.push("save");
        return {ok:true,message:"Kaydedildi",dirty:false,changed:true};
      },
      discardBusinessGallery:async()=>{
        draft=null;window.galleryFixture.calls.push("discard");
        return {ok:true,message:"Geri alındı",dirty:false,changed:true};
      }
    });
  });
  await page.locator("#settings-gallery-button").click();
  const dialog=page.getByRole("dialog",{name:"Galeri Yönetimi"});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Henüz fotoğraf yok");
  await expect(dialog.getByRole("button",{name:"Kapak Yap"})).toHaveCount(0);
  await dialog.getByRole("button",{name:"Fotoğraf Ekle"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(1);
  await dialog.getByRole("button",{name:"Kapat"}).click();
  await expect(dialog).toContainText("Galeri değişiklikleri bekliyor");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await dialog.getByRole("button",{name:"Burada kal"}).click();
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await dialog.getByRole("button",{name:"Kapat"}).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#settings-gallery-button").click();
  await expect(page.locator(".settings-gallery-item")).toHaveCount(1);
  await dialog.locator(".settings-gallery-item input").fill("Gün batımı");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  assert.equal(await page.evaluate(()=>window.galleryFixture.getSaved()[0].title),"Gün batımı");
  await dialog.getByRole("button",{name:"Fotoğraf Ekle"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(2);
  await dialog.getByRole("button",{name:"Kapat"}).click();
  await dialog.getByRole("button",{name:"Geri al ve kapat"}).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#settings-gallery-button").click();
  for (let i=0; i<13; i++) await dialog.getByRole("button",{name:"Fotoğraf Ekle"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(12);
  await expect(dialog).toContainText("1 / 2");
  await dialog.getByRole("button",{name:"Sonraki"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(2);
  await expect(dialog).toContainText("2 / 2");
  await dialog.getByRole("button",{name:"Kapat"}).click();
  await dialog.getByRole("button",{name:"Geri al ve kapat"}).click();
  const calls=await page.evaluate(()=>window.galleryFixture.calls);
  assert.deepEqual(calls.slice(0,5),["add","save","save","add","discard"]);
  assert.equal(calls.filter(x=>x==="add").length,15);
  assert.equal(calls.filter(x=>x==="discard").length,2);
  console.log("business-gallery-overlay-ui-smoke-ok");
} finally {await browser?.close(); await server.close();}
