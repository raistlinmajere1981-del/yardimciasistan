import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const server=await createServer({root:resolve("apps/desktop-app"),configFile:resolve("apps/desktop-app/vite.renderer.config.ts"),
  server:{port:0,strictPort:false}});
let browser;
try {
  await server.listen();
  browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1350,height:850},locale:"tr-TR"});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/qr-manager-test",async route=>route.fulfill({contentType:"text/html",
    body:await server.transformIndexHtml("/qr-manager-test",
      '<html><body><div id="root"></div><script type="module" src="/@fs/'
      +resolve("scripts/fixtures/qr-menu-workspace.tsx")+'"></script></body></html>')}));
  await page.goto(server.resolvedUrls.local[0]+"qr-manager-test");
  const panel=page.getByRole("region",{name:"QR Menü",exact:true});
  await expect(panel.getByRole("button",{name:"QR Kod"})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Oda QR Yazdır"})).toBeVisible();
  await panel.getByRole("button",{name:"QR Kod"}).click();
  const dialog=page.getByRole("dialog",{name:"QR Menü Kodları"});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".qr-menu-workspace__code svg")).toHaveCount(1);
  await dialog.getByRole("button",{name:/Odalar 130/}).click();
  await expect(dialog.locator(".qr-menu-workspace__record")).toHaveCount(25);
  await expect(dialog.locator(".qr-menu-workspace__code svg")).toHaveCount(1);
  await dialog.getByRole("button",{name:"Bu sayfayı seç"}).click();
  await expect(dialog.getByText("25 seçili")).toBeVisible();
  await dialog.getByRole("button",{name:"Sonraki"}).click();
  await expect(dialog.getByText("25 seçili")).toBeVisible();
  await dialog.getByRole("checkbox",{name:/Oda \d+ seç/}).first().check();
  await expect(dialog.getByText("26 seçili")).toBeVisible();
  await dialog.getByRole("button",{name:"Seçilenleri Yazdır (26)"}).click();
  const first=(await page.evaluate(()=>window.qrUiFixture.prints()))[0];
  assert.equal(first.kind,"qr_room");
  assert.equal(first.ids.length,26);
  await dialog.getByLabel("QR kodlarında ara").fill("Oda 129");
  await expect(dialog.locator(".qr-menu-workspace__record")).toHaveCount(1);
  await expect(dialog.getByText("26 seçili")).toBeVisible();
  await dialog.getByLabel("QR kodlarında ara").fill("");
  await dialog.getByRole("button",{name:/Masalar 65/}).click();
  await expect(dialog.locator(".qr-menu-workspace__record")).toHaveCount(25);
  await dialog.getByRole("button",{name:"Genel Menü"}).click();
  await expect(dialog.getByText("Genel QR Menü")).toBeVisible();
  await dialog.getByRole("button",{name:"Yazdır",exact:true}).click();
  assert.deepEqual((await page.evaluate(()=>window.qrUiFixture.prints()))[1],{kind:"qr_menu"});
  await dialog.getByRole("button",{name:"QR Menü araçlarını kapat"}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:"Oda QR Yazdır"}).click();
  assert.deepEqual((await page.evaluate(()=>window.qrUiFixture.prints()))[2],{kind:"qr_room",ids:["room_1"]});
  await page.setViewportSize({width:390,height:820});
  await panel.getByRole("button",{name:"QR Kod"}).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:/Odalar 130/}).click();
  const viewport=await dialog.evaluate(node=>{const bounds=node.getBoundingClientRect();
    return {left:bounds.left,right:bounds.right,width:innerWidth,scroll:node.querySelector(".qr-menu-workspace__records").scrollHeight>node.querySelector(".qr-menu-workspace__records").clientHeight};});
  assert.ok(viewport.left>=-2 && viewport.right<=viewport.width+2);
  assert.equal(viewport.scroll,true);
  assert.deepEqual(errors,[]);
  console.log("qr-menu-workspace-ui-ok: 130 rooms, 65 tables, one SVG at a time, selection, batch+single print, room toolbar, mobile");
} finally {await browser?.close();await server.close();}
