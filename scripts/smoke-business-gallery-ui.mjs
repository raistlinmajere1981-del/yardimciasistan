import { verifySettingsStyleParity, verifySettingsAppearanceParity } from "./test-helpers/settings-style-parity.mjs";
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
    const entry=(id,sortOrder)=>{
      const w=sortOrder%2 ? 80 : 240, h=sortOrder%2 ? 160 : 80;
      return {id,kind:"photo",originalName:id+".jpg",mimeType:"image/jpeg",title:id,sortOrder,sizeBytes:2000,
        updatedAt:"2026-10-18",remoteUrl:"",previewDataUrl:"data:image/svg+xml,"+encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="blue"/></svg>`)};
    };
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
  const emptyHeight = await dialog.evaluate(node => node.getBoundingClientRect().height);
  await expect(dialog.getByRole("button",{name:"Kapak Yap"})).toHaveCount(0);
  await dialog.getByRole("button",{name:"Fotoğraf Ekle"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(1);
  expect(await dialog.evaluate(node => node.getBoundingClientRect().height)).toBe(emptyHeight);
  await expect(dialog.locator(".settings-gallery-tools p")).toHaveText("1 fotoğraf");
  await expect(dialog).not.toContainText("sürükleme yerine");
  await expect(dialog.locator(".settings-gallery-preview")).toHaveCount(1);
  await expect(dialog.locator(".settings-gallery-preview img")).toHaveCount(1);
  // Media-list geometry: compact window, narrow description, no nested card outline.
  const layout = await dialog.evaluate(surface => {
    const item=surface.querySelector(".settings-gallery-item");
    const preview=item.querySelector(".settings-gallery-preview").getBoundingClientRect();
    const description=item.querySelector(".form-field").getBoundingClientRect();
    const actions=item.querySelector(".settings-gallery-item-actions").getBoundingClientRect();
    const row=item.getBoundingClientRect();
    const panel=surface.getBoundingClientRect();
    const style=getComputedStyle(item);
    return {
      width:panel.width,height:panel.height,descriptionWidth:description.width,
      rightGap:actions.left-description.right,
      noCardOutline:parseFloat(style.borderLeftWidth)===0 && parseFloat(style.borderTopWidth)===0,
      sameRow:Math.abs((preview.top+preview.bottom)/2-(actions.top+actions.bottom)/2)<12,
      enoughSpace:description.right<=actions.left && actions.right<=row.right+1,
      imageFits:preview.left>=row.left && preview.right<=row.right
    };
  });
  expect(layout.width).toBeGreaterThanOrEqual(570);
  expect(layout.width).toBeLessThanOrEqual(610);
  expect(layout.height).toBeLessThanOrEqual(630);
  expect(layout.descriptionWidth).toBeGreaterThanOrEqual(245);
  expect(layout.descriptionWidth).toBeLessThanOrEqual(355);
  expect(layout.rightGap).toBeLessThanOrEqual(20);
  expect(layout.noCardOutline && layout.sameRow && layout.enoughSpace && layout.imageFits).toBe(true);
  const imageRatio = await dialog.locator(".settings-gallery-preview img").evaluate(async img => {
    if(!img.complete) await new Promise(resolve => { img.addEventListener("load",resolve,{once:true}); });
    const image=img.getBoundingClientRect(),frame=img.parentElement.getBoundingClientRect();
    return { naturalRatio:img.naturalWidth/img.naturalHeight,displayRatio:image.width/image.height,
      framed:image.width<=frame.width && image.height<=frame.height,
      fit:getComputedStyle(img).objectFit };
  });
  expect(imageRatio.framed).toBe(true);
  expect(imageRatio.fit).toBe("contain");
  expect(Math.abs(imageRatio.naturalRatio-imageRatio.displayRatio)).toBeLessThan(.01);
  await verifySettingsStyleParity(page, "gallery-loaded");
  const close = dialog.getByRole("button",{name:"Galeriyi kapat"});
  await expect(close).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(6,6);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Kaydedilmemiş değişiklikler")).toHaveCount(0);
  await expect(dialog.getByRole("button",{name:"Kaydet ve geç"})).toHaveCount(0);
  await page.setViewportSize({ width:420, height:600 });
  expect(await dialog.evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
  await verifySettingsAppearanceParity(page, "gallery-narrow");
  await page.setViewportSize({ width:1440, height:900 });
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(close).toBeEnabled();
  await dialog.getByRole("button",{name:"Galeriyi kapat"}).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#settings-gallery-button").click();
  await expect(page.locator(".settings-gallery-item")).toHaveCount(1);
  await dialog.locator(".settings-gallery-item input").fill("Gün batımı");
  await expect(dialog.getByRole("button",{name:"Galeriyi kapat"})).toBeDisabled();
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Galeriyi kapat"})).toBeEnabled();
  assert.equal(await page.evaluate(()=>window.galleryFixture.getSaved()[0].title),"Gün batımı");
  await dialog.getByRole("button",{name:"Fotoğraf Ekle"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(2);
  await expect(dialog.getByRole("button",{name:"Galeriyi kapat"})).toBeDisabled();
  await dialog.getByRole("button",{name:"Değişiklikleri Geri Al"}).click();
  await expect(dialog.getByRole("button",{name:"Galeriyi kapat"})).toBeEnabled();
  await dialog.getByRole("button",{name:"Galeriyi kapat"}).click();
  await expect(dialog).toHaveCount(0);
  await page.locator("#settings-gallery-button").click();
  for (let i=0; i<13; i++) await dialog.getByRole("button",{name:"Fotoğraf Ekle"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(12);
  await expect(dialog).toContainText("1 / 2");
  expect(await dialog.evaluate(node => node.getBoundingClientRect().height)).toBe(emptyHeight);
  const scrolling = await dialog.evaluate(node => {
    const content = node.querySelector('.settings-gallery-content');
    const footer = node.querySelector('footer').getBoundingClientRect();
    const toolbar = node.querySelector('.settings-gallery-tools').getBoundingClientRect();
    const tiles=[...content.querySelectorAll('.settings-gallery-item')].map(el=>el.getBoundingClientRect());
    content.scrollTop = content.scrollHeight;
    return { scrollable: content.scrollHeight > content.clientHeight,
      footerAnchored: footer.bottom <= node.getBoundingClientRect().bottom,
      toolbarAnchored: toolbar.top === node.querySelector('.settings-gallery-tools').getBoundingClientRect().top,
      singleColumn: tiles.every((tile,i)=>i===0 || tile.top>=tiles[i-1].bottom) };
  });
  expect(scrolling).toEqual({ scrollable: true, footerAnchored: true, toolbarAnchored: true, singleColumn:true });
  await page.setViewportSize({ width: 600, height: 650 });
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth && node.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  await page.setViewportSize({ width: 420, height: 600 });
  const compact = await dialog.evaluate(node => ({
    fits:node.scrollWidth<=node.clientWidth && node.getBoundingClientRect().bottom<=innerHeight,
    itemsFit:[...node.querySelectorAll(".settings-gallery-item")].every(item=>item.scrollWidth<=item.clientWidth+1),
    ratio:getComputedStyle(node.querySelector(".settings-gallery-preview img")).objectFit
  }));
  expect(compact).toEqual({fits:true,itemsFit:true,ratio:"contain"});
  await page.setViewportSize({ width: 1440, height: 900 });
  await dialog.getByRole("button",{name:"Sonraki"}).click();
  await expect(dialog.locator(".settings-gallery-item")).toHaveCount(2);
  await expect(dialog).toContainText("2 / 2");
  await expect(dialog.getByRole("button",{name:"Galeriyi kapat"})).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Değişiklikleri Geri Al"}).click();
  await expect(dialog.getByRole("button",{name:"Galeriyi kapat"})).toBeEnabled();
  await dialog.getByRole("button",{name:"Galeriyi kapat"}).click();
  await expect(dialog).toHaveCount(0);
  const calls=await page.evaluate(()=>window.galleryFixture.calls);
  assert.deepEqual(calls.slice(0,5),["add","save","save","add","discard"]);
  assert.equal(calls.filter(x=>x==="add").length,15);
  assert.equal(calls.filter(x=>x==="discard").length,2);
  console.log("business-gallery-overlay-ui-smoke-ok");
} finally {await browser?.close(); await server.close();}
