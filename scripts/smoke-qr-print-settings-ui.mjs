import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
const server=await createServer({root:resolve("apps/desktop-app"),configFile:resolve("apps/desktop-app/vite.renderer.config.ts"),server:{port:0,strictPort:false}});
let browser;
try {
  await server.listen();
  browser=await launchChromiumForSmoke(chromium);
  const page=await browser.newPage({viewport:{width:1350,height:850}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/qr-print-settings-test*",async route=>route.fulfill({contentType:"text/html",
    body:await server.transformIndexHtml("/qr-print-settings-test",
      '<html><body><div id="root"></div><script type="module" src="/@fs/'+resolve("scripts/fixtures/print-management.tsx")+'"></script></body></html>')}));
  const caps=["document.printing","channel.qr_menu","food_service.menu","customer.requests","core.customers",
    "accommodation.rooms","accommodation.stays","accommodation.folio","food_service.tables","food_service.orders"];
  await page.goto(server.resolvedUrls.local[0]+"qr-print-settings-test?caps="+encodeURIComponent(caps.join(",")));
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  const dialog=page.getByRole("dialog",{name:"Baskı Yönetimi"});
  for(const title of ["QR Menü kodu","Masa QR kodları","Oda QR kodları"]) {
    await expect(dialog.getByRole("button",{name:new RegExp(title)})).toBeVisible();
  }
  await dialog.getByRole("button",{name:/Oda QR kodları/}).click();
  await expect(dialog.getByRole("option",{name:"Misafir giriş yaptığında"})).toHaveCount(1);
  await expect(dialog.getByRole("button",{name:"Düzenle"})).toHaveCount(0);
  const trigger=dialog.getByLabel("Uygulanacak olay");
  const mode=dialog.getByLabel("Yazdırma politikası");
  await expect(trigger.locator("option")).toHaveCount(2);
  await expect(mode.locator("option")).toHaveCount(2);
  await trigger.selectOption("stay_checked_in");
  await expect(mode.locator("option")).toHaveCount(3);
  await mode.selectOption("AUTOMATIC");
  await dialog.getByLabel("Bu cihazın yazıcısı").selectOption("fixture-desk");
  await expect(dialog.getByRole("button",{name:"Kaydet",exact:true})).toBeEnabled();
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(dialog).toContainText("Ayarlar kaydedildi.");
  const saved=await page.evaluate(()=>window.printFixture.saved());
  assert.ok(saved.some(rule=>rule.documentKind==="qr_room"&&rule.trigger==="stay_checked_in"&&rule.mode==="AUTOMATIC"));
  await trigger.selectOption("manual");
  await expect(mode.locator("option")).toHaveCount(2);
  await mode.selectOption("ASK_CONFIRMATION");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Kaydet",exact:true})).toBeDisabled();
  const bound=await page.evaluate(()=>window.printFixture.bindings());
  assert.ok(bound.some(([key,value])=>key==="sample:qr_room"&&value==="fixture-desk"));
  await dialog.getByRole("button",{name:/QR Menü kodu/}).click();
  await expect(mode.locator("option")).toHaveCount(2);
  await expect(trigger.locator("option")).toHaveCount(1);
  assert.deepEqual(errors,[]);
  console.log("qr-print-settings-ui-ok: three document types, editable printer binding, check-in automatic/manual policy, manual-only QR menu");
}finally{await browser?.close();await server.close();}
