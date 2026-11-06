import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { launchChromiumForSmoke } from "./test-helpers/playwright-browser.mjs";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const domOnly = process.argv.includes("--dom-only");
const screenshots = process.argv.includes("--screenshots");
const server = await createServer({ root: resolve("apps/desktop-app"), configFile: resolve("apps/desktop-app/vite.renderer.config.ts"), server: domOnly ? { middlewareMode: true, hmr: false, ws: false } : { port: 0, strictPort: false } });
let browser;
try {
  if (domOnly) {
    const { PrintManagementWorkspace } = await server.ssrLoadModule("/src/components/settings/PrintManagementWorkspace.tsx");
    const { BusinessCapabilityRuntimeProvider } = await server.ssrLoadModule("/src/app/business-capability-context.tsx");
    const { BUSINESS_CAPABILITIES: C, expandBusinessCapabilities } = await server.ssrLoadModule("/@fs/" + resolve("packages/shared/index.ts"));
    const { DocumentTemplateCanvas, defaultDocumentLayout, saleReceiptLineBlock } = await server.ssrLoadModule("/src/components/settings/DocumentTemplateCanvas.tsx");
    const { validateDocumentTemplate } = await server.ssrLoadModule("/@fs/" + resolve("packages/shared/types/document-output.ts"));
    const { searchSettings } = await server.ssrLoadModule("/src/app/settings-registry.ts");
    const render = (caps, { initialized = true, locked = false, whatsappEnabled = false } = {}) => {
      const snapshot = locked ? null : { enabledCapabilities: expandBusinessCapabilities(caps) };
      return renderToStaticMarkup(createElement(BusinessCapabilityRuntimeProvider, { value: { snapshot } },
        createElement(PrintManagementWorkspace, { initialized, whatsappEnabled, onClose() {} })));
    };
    for (const html of [render([]), render([C.PRINTING], { initialized: false }), render([C.PRINTING], { locked: true })]) {
      assert.match(html, /kayıtlı olarak etkin/);
      assert.doesNotMatch(html, /aria-label="Belge türleri"/);
    }
    assert.match(render([C.PRINTING]), /önizlenebilir belge bulunmuyor/);
    const pension = render([C.PRINTING, C.ACCOMMODATION_STAYS]);
    assert.match(pension, /Konaklama dökümü/);
    assert.doesNotMatch(pension, /Ürün etiketi|Adisyon/);
    const market = render([C.PRINTING, C.SALES, C.RETAIL_LABELS]);
    assert.match(market, /Ürün etiketi/);
    assert.doesNotMatch(market, /Adisyon|Kargo etiketi/);
    const combined = render([C.PRINTING, C.SALES, C.RETAIL_LABELS, C.CUSTOMER_CREDIT, C.ORDERS, C.FOOD_ORDERS, C.ACCOMMODATION_STAYS, C.WHATSAPP], { whatsappEnabled: true });
    for (const title of ["Satış fişi", "Adisyon", "Konaklama dökümü", "Ürün etiketi", "Borç dökümü", "Kargo etiketi", "Mutfak siparişi"]) assert.ok(combined.includes(title));
    assert.equal((combined.match(/aria-controls="print-document-preview"/g) ?? []).length, 7);
    assert.match(combined, /workspace-frame--centered/);
    assert.equal((combined.match(/>Kaydet<\/button>/g) ?? []).length, 1);
    assert.equal((combined.match(/>Değişiklikleri geri al<\/button>/g) ?? []).length, 1);
    assert.match(combined, /MALİ BELGE DEĞİLDİR/);
    assert.match(combined, /Yazdırma politikası/);
    assert.match(combined, /Bu cihazın yazıcısı/);
    assert.doesNotMatch(combined, /Politikalar yalnız|Yazıcı seçimi bu cihaza|Şablon revizyonu/);
    assert.doesNotMatch(combined, /aria-label="Bu cihazın yazıcısı"/);
    assert.doesNotMatch(combined, />Yazdır<|>Gönder<|Fatura/);
    assert.doesNotMatch(combined, /aria-label="WhatsApp politikası"/); // SSR cannot claim backend activation.
    assert.doesNotMatch(render([C.PRINTING, C.SALES, C.WHATSAPP]), /<strong>WhatsApp<\/strong>/);
    assert.doesNotMatch(render([C.PRINTING, C.SALES], { whatsappEnabled: true }), /<strong>WhatsApp<\/strong>/);
    assert.equal(searchSettings("baskı", [C.PRINTING], true, null).length, 0);
    assert.equal(searchSettings("baskı", [], false, { enabledCapabilities: [C.PRINTING] }).length, 0);
    assert.equal(searchSettings("baskı", [], true, { enabledCapabilities: [C.PRINTING] }).length, 1);
    for (const kind of ["sale_receipt","table_bill","stay_statement","credit_statement","shipping_label","kitchen_ticket","product_label"]) {
      const layout=defaultDocumentLayout(kind); validateDocumentTemplate(layout);
      const html=renderToStaticMarkup(createElement(DocumentTemplateCanvas,{layout,editing:true,enabled:true,onChange(){},onPreset(){}}));
      assert.match(html,/aria-label="X \(mm\)"/); assert.match(html,/step="0.1"/);
      assert.match(html,/Alan ekle/); assert.match(html,/İşletme adı/); assert.doesNotMatch(html.replace(/<[^>]*>/g,""),/business.name/);
      assert.match(html,new RegExp(`aspect-ratio:${layout.pageWidth} / ${layout.pageHeight}`));
      const readonly=renderToStaticMarkup(createElement(DocumentTemplateCanvas,{layout,editing:true,enabled:false,onChange(){},onPreset(){}}));
      assert.doesNotMatch(readonly,/<(?:input|select|button)(?![^>]*disabled)[^>]*>/);
      const preview=renderToStaticMarkup(createElement(DocumentTemplateCanvas,{layout,editing:false,enabled:true,onChange(){},onPreset(){}}));
      assert.doesNotMatch(preview,/<input|<select/);
      const inherited={...layout,pageWidth:200,pageHeight:200,lineBlock:{y:50,rowHeight:10,maxRows:2,fields:[]},scan:{originalImageRef:"original",processedImageRef:null,foreground:false}};
      const reset=defaultDocumentLayout(kind,inherited);validateDocumentTemplate(reset);
      assert.deepEqual(reset.lineBlock,inherited.lineBlock);assert.deepEqual(reset.scan,inherited.scan);
    }
    const receipt = defaultDocumentLayout("sale_receipt");
    assert.deepEqual(receipt.lineBlock.fields.map(field => field.binding), ["line.description","line.quantity","line.total"]);
    assert.ok(receipt.lineBlock.y >= Math.max(...receipt.fields.map(field => field.y + field.height)));
    assert.ok(receipt.lineBlock.y + receipt.lineBlock.rowHeight * receipt.lineBlock.maxRows <= receipt.pageHeight - 80);
    const legacyReceipt = {...receipt,lineBlock:null,scan:{originalImageRef:"original",processedImageRef:"processed",foreground:true}};
    const beforeRepair = JSON.stringify(legacyReceipt);
    const repairedReceipt = {...legacyReceipt,lineBlock:saleReceiptLineBlock(legacyReceipt)};
    validateDocumentTemplate(repairedReceipt);
    assert.equal(JSON.stringify(legacyReceipt),beforeRepair);
    assert.deepEqual(repairedReceipt.fields,legacyReceipt.fields);assert.deepEqual(repairedReceipt.scan,legacyReceipt.scan);
    assert.equal(repairedReceipt.pageWidth,800);assert.equal(repairedReceipt.pageHeight,1600);
    assert.ok(defaultDocumentLayout("sale_receipt",legacyReceipt).lineBlock);
    const missingHtml=renderToStaticMarkup(createElement(DocumentTemplateCanvas,{documentKind:"sale_receipt",layout:legacyReceipt,editing:true,enabled:true,onChange(){},onPreset(){}}));
    assert.match(missingHtml,/Ürün satırlarını ekle/);assert.match(missingHtml,/Bu şablonda ürün satırları yok/);assert.match(missingHtml,/Kaydet/);
    const rowHtml=renderToStaticMarkup(createElement(DocumentTemplateCanvas,{documentKind:"sale_receipt",layout:receipt,editing:false,enabled:true,onChange(){},onPreset(){}}));
    assert.match(rowHtml,/print-management__row-field/);assert.match(rowHtml,/Örnek ürün/);assert.doesNotMatch(rowHtml,/Seçili alan türü/);
    assert.equal(saleReceiptLineBlock({...receipt,fields:[{binding:"totals.total",x:0,y:1500,width:100,height:60}]}),null);
    const { FormImagePreparation } = await server.ssrLoadModule("/src/components/settings/FormImagePreparation.tsx");
    const preparationProps={documentKind:"sale_receipt",originalRef:"original",pageWidth:800,pageHeight:1600,enabled:true,onApply:async()=>false,onBack(){}};
    const prepHtml=renderToStaticMarkup(createElement(FormImagePreparation,preparationProps));
    assert.match(prepHtml,/Görsel hazırlama/);assert.match(prepHtml,/Köşe X \(%\)/);assert.match(prepHtml,/Köşe Y \(%\)/);
    assert.match(prepHtml,/Gri ton/);assert.match(prepHtml,/Siyah\/Beyaz/);assert.match(prepHtml,/>Önizle</);assert.match(prepHtml,/>Uygula</);
    assert.doesNotMatch(prepHtml,/<dialog|role="dialog"|<canvas/);
    const readonlyPrep=renderToStaticMarkup(createElement(FormImagePreparation,{...preparationProps,enabled:false}));
    assert.doesNotMatch(readonlyPrep,/<(?:input|select)(?![^>]*disabled)[^>]*>/);
    assert.match(readonlyPrep,/<button[^>]*disabled[^>]*>Uygula<\/button>/);
    const scanHtml=renderToStaticMarkup(createElement(DocumentTemplateCanvas,{layout:{...defaultDocumentLayout("sale_receipt"),scan:{originalImageRef:"original",processedImageRef:"processed",foreground:false}},editing:true,enabled:true,onChange(){},onPreset(){},onPickImage(){},onApplyImage:async()=>false}));
    assert.match(scanHtml,/Görseli hazırla/);assert.match(scanHtml,/Orijinali göster/);
    console.log("Print management DOM: inactive/locked/setup/empty, seven capability filters, independent channels, template presets/geometry/readonly markup, preserved line/scan references, preparation controls/readonly markup and persisted search gate passed. Browser interaction/layout not exercised.");
  } else {
  await server.listen();
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [routeName, fixture] of [["print-settings-test", "settings-platform"], ["print-shell-test", "print-management"]]) {
    await page.route(`**/${routeName}*`, async route => route.fulfill({ contentType: "text/html", body: await server.transformIndexHtml(`/${routeName}`, `<html><body><div id="root"></div><script type="module" src="/@fs/${resolve(`scripts/fixtures/${fixture}.tsx`)}"></script></body></html>`) }));
  }
  await page.route(/^https:\/\/(?:[^/]+\.)?tile\.openstreetmap\.org\//, route => route.abort());
  const base = server.resolvedUrls.local[0];
  const launcher = page.getByRole("button", { name: "Baskı Yönetimi", exact: true });
  const dialog = page.getByRole("dialog", { name: "Baskı Yönetimi", exact: true });
  const openTools = async () => {
    const menu = dialog.locator(".print-management__tools-menu");
    if (!await menu.evaluate(node => node.open)) await menu.locator("summary").click();
  };
  await page.goto(`${base}print-settings-test?profile=market`);
  await expect(page.getByLabel("Firma adı", { exact: true })).toBeVisible();
  await expect(launcher).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "İşletme Yapısı ve Özellikler", exact: true })).toBeVisible();
  await page.getByLabel("Baskı ve Belge Paylaşımı", { exact: true }).check();
  await expect(launcher).toHaveCount(0); // Unsaved form is never runtime authority.
  await page.evaluate(() => window.refreshSettings({ profileOptions: ["document.printing", "retail.labels"] }));
  await expect(launcher).toBeVisible();
  await page.evaluate(() => {
    window.yardimciDesktop.getDocumentPrinters = async input => ({ok:true,value:{documentKind:input.documentKind,printers:[],printerRef:null,missing:false}});
    window.yardimciDesktop.readPrinterBinding = window.yardimciDesktop.getDocumentPrinters;
    window.yardimciDesktop.savePrinterBinding = async input => ({ok:true,value:{documentKind:input.documentKind,printers:[],printerRef:input.printerRef,missing:false}});
    window.yardimciDesktop.getDocumentOutputSettings = async input => ({ ok: true, value: { documentKind: input.documentKind, rules: [], whatsappEnabled: false } });
    window.yardimciDesktop.saveDocumentOutputRule = async input => ({ ok: true, value: input });
    window.yardimciDesktop.readDocumentOutputTemplate = async input => ({ok:true,value:{documentKind:input.documentKind,revision:null,layout:null}});
    window.yardimciDesktop.saveDocumentOutputTemplate = async input => ({ok:true,value:{documentKind:input.documentKind,revision:1,layout:input.layout}});
    window.yardimciDesktop.listReadyDocuments = async input => ({ok:true,value:input.documentKind === "sale_receipt" ? [{jobId:"a".repeat(64),createdAt:"2026-10-28"}] : []});
    window.yardimciDesktop.previewReadyDocument = input => new Promise(resolve => { window.previewInput = input; window.finishPreview = () => resolve({ok:false,code:"TEST",message:"Önizleme açılamadı."}); });
  });
  await launcher.click();
  await expect(dialog).toBeVisible();
  const ready = dialog.getByRole("region", {name:"Hazır belgeler"});
  await expect(ready.getByRole("button",{name:"Önizle",exact:true})).toBeVisible();
  await ready.getByRole("button",{name:"Önizle",exact:true}).click();
  await expect(ready.getByRole("button",{name:"Yazdır",exact:true})).toBeDisabled();
  expect(await page.evaluate(() => window.previewInput)).toEqual({documentKind:"sale_receipt",jobId:"a".repeat(64)});
  await page.evaluate(() => window.finishPreview());
  await expect(dialog.getByText("Önizleme açılamadı.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Ürün etiketi/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Adisyon|Kargo etiketi/ })).toHaveCount(0);
  await dialog.getByLabel("Yazdırma politikası", { exact: true }).selectOption("ASK_CONFIRMATION");
  expect(await page.evaluate(() => window.requestSettingsPageLeave())).toBe(false);
  expect(await page.evaluate(() => window.settingsPageLeaveCompleted)).toBe(false);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Değişiklikleri geri al", exact: true }).click();
  await dialog.getByRole("button", {name:"Düzenle",exact:true}).click();
  await dialog.getByLabel("X (mm)",{exact:true}).fill("4.2");
  expect(await page.evaluate(() => window.requestSettingsPageLeave())).toBe(false);
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Değişiklikleri geri al",exact:true}).click();
  await page.keyboard.press("Escape");
  await expect(launcher).toBeFocused();
  await page.getByRole("searchbox", { name: "Ayarlarda ara" }).fill("baskı");
  await page.locator(".settings-search-results").getByRole("button", { name: "Baskı Yönetimi", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.evaluate(() => window.refreshSettings({ profileOptions: [] }));
  await expect(dialog.getByRole("status")).toContainText("kayıtlı olarak etkin");
  await expect(dialog.getByRole("navigation")).toHaveCount(0);

  for (const suffix of ["?missingRuntime", "?firstRun=on"]) {
    await page.goto(`${base}print-settings-test${suffix}`);
    await expect(page.getByRole("searchbox", { name: "Ayarlarda ara" })).toBeVisible();
    await page.getByRole("searchbox").fill("baskı");
    await expect(launcher).toHaveCount(0);
  }
  const visit = async query => {
    await page.goto(`${base}print-shell-test?${query}`);
    await page.getByRole("button", { name: "Önizlemeyi aç" }).click();
    await expect(dialog).toBeVisible();
  };
  for (const query of ["caps=", "caps=document.printing&locked", "caps=document.printing&uninitialized"]) {
    await visit(query);
    await expect(dialog.getByRole("status")).toContainText("kayıtlı olarak etkin");
    await expect(dialog.getByRole("navigation")).toHaveCount(0);
  }
  await visit("caps=document.printing");
  await expect(dialog.getByRole("status")).toContainText("önizlenebilir belge bulunmuyor");
  await visit("caps=document.printing,accommodation.stays");
  await expect(dialog.getByRole("navigation").getByRole("button")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /Konaklama dökümü/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Ürün etiketi|Adisyon/ })).toHaveCount(0);
  await visit("caps=document.printing,retail.labels,commerce.sales,commerce.customer_credit,commerce.orders,food_service.orders,accommodation.stays,service.whatsapp");
  const documentButtons = dialog.getByRole("navigation").getByRole("button");
  await expect(documentButtons).toHaveCount(7);
  const originalBounds = await dialog.locator(".print-management__preview").boundingBox();
  const documentRatios = [.5, .5, 210/297, 210/297, 100/150, .5, 60/40];
  for (const [index,button] of (await documentButtons.all()).entries()) {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator(".print-management__paper")).toContainText("MALİ BELGE DEĞİLDİR");
    const bounds = await dialog.locator(".print-management__preview").boundingBox();
    expect(Math.abs(bounds.width - originalBounds.width)).toBeLessThan(2);
    expect(Math.abs(bounds.height - originalBounds.height)).toBeLessThan(2);
    expect(Math.abs(bounds.x - originalBounds.x)).toBeLessThan(5);
    await expect.poll(async()=>{ const paper=await dialog.locator(".print-management__paper").boundingBox();return paper.width/paper.height; }).toBeCloseTo(documentRatios[index],2);
  }
  await expect(dialog.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /Yazdır|Gönder|Fatura/ })).toHaveCount(0);
  await expect(dialog.getByLabel("Yazdırma politikası", { exact: true })).toBeEnabled();
  await expect(dialog.locator("input,textarea,[contenteditable=true]")).toHaveCount(0);
  await expect(dialog.locator(".print-management__channel")).toHaveCount(2);
  await expect(dialog).toContainText("Gönderim kullanıcı onayı gerektirir");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  const editTemplate = dialog.getByRole("button", {name:"Düzenle",exact:true});
  const saveTemplate = dialog.getByRole("button", {name:"Kaydet",exact:true});
  const discardTemplate = dialog.getByRole("button", {name:"Değişiklikleri geri al",exact:true});
  await dialog.getByRole("button", { name: /Satış fişi/ }).click();
  await editTemplate.click();
  await expect(dialog.getByLabel("Alan seç",{exact:true}).locator("option")).toHaveCount(4);
  await dialog.getByLabel("Genişlik (mm)",{exact:true}).fill("60");
  await dialog.getByLabel("X (mm)",{exact:true}).fill("7.3");
  await dialog.getByLabel("Y (mm)",{exact:true}).fill("");
  await expect(dialog.getByLabel("Y (mm)",{exact:true})).toHaveValue("");
  await dialog.getByLabel("Y (mm)",{exact:true}).fill("9.1");
  await expect(saveTemplate).toBeVisible();
  await dialog.getByLabel("Yazdırma politikası",{exact:true}).selectOption("ASK_CONFIRMATION");
  await expect(dialog.getByRole("button",{name:"Kaydet",exact:true})).toBeVisible();
  await expect(dialog.locator(".workspace-frame__footer button")).toHaveCount(2);
  await expect(saveTemplate).toBeEnabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await dialog.getByLabel("Alan seç", {exact:true}).selectOption("1");
  await dialog.getByRole("button", {name:/Adisyon/}).click();
  await expect(dialog.getByLabel("Alan seç", {exact:true})).toHaveValue("0");
  await dialog.getByLabel("X (mm)",{exact:true}).fill("5.5");
  await dialog.getByRole("button", {name:/Satış fişi/}).click();
  await expect(dialog.getByLabel("Alan seç", {exact:true})).toHaveValue("0");
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toHaveValue("7.3");
  await saveTemplate.click();
  await expect(saveTemplate).toBeDisabled();
  await expect(dialog).toContainText("Ayarlar kaydedildi.");
  expect((await page.evaluate(() => window.printFixture.templates())).map(value=>value.revision)).toEqual([1,1]);
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await editTemplate.click();
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toHaveValue("7.3");
  const xInput = dialog.getByLabel("X (mm)", { exact: true });
  const yInput = dialog.getByLabel("Y (mm)", { exact: true });
  const fieldSelector = dialog.getByLabel("Alan seç", { exact: true });
  const field = dialog.getByRole("button", { name: "İşletme adı alanı 1", exact: true });
  await field.scrollIntoViewIfNeeded();
  // Selected field stays on top so even overlapping document fields remain draggable.
  expect(await field.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.getAttribute("aria-label");
  })).toBe("İşletme adı alanı 1");
  let pointerEvents = [];
  await page.exposeFunction("recordTemplatePointer", data => pointerEvents.push(data));
  const dragFirstField = async () => {
    await field.scrollIntoViewIfNeeded();
    // The saved first field overlaps field 2. Its center hits field 2 (3 + 2 = 5mm).
    // Find an exposed point and verify the actual hit target before pressing.
    const start = await field.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      for (const fy of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        for (const fx of [0.5, 0.1, 0.9]) {
          const x = bounds.left + bounds.width * fx, y = bounds.top + bounds.height * fy;
          if (document.elementFromPoint(x, y) === node) return { x, y };
        }
      }
      throw Error("First template field has no exposed drag point: " + JSON.stringify({bounds: bounds.toJSON(), paper:node.closest(".print-management__paper")?.getBoundingClientRect().toJSON(), parent:node.closest(".print-management__canvas")?.getBoundingClientRect().toJSON(), atCenter:document.elementFromPoint(bounds.left + bounds.width/2,bounds.top + bounds.height/2)?.outerHTML?.slice(0,200)}));
    });
    const before = { x: await xInput.inputValue(), y: await yInput.inputValue(), selected: await fieldSelector.inputValue() };
    const paperBounds = await dialog.locator(".print-management__paper").boundingBox();
    const fieldBounds = await field.boundingBox();
    pointerEvents = [];
    await page.evaluate(() => {
      window.templatePointerListener ??= event => window.recordTemplatePointer({ type: event.type, x: event.clientX, y: event.clientY, target: event.target.getAttribute("aria-label"), selected: document.querySelector('[aria-label="Alan seç"]')?.value });
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) document.addEventListener(type, window.templatePointerListener, true);
    });
    try {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await expect(fieldSelector).toHaveValue("0");
      await page.mouse.move(start.x + paperBounds.width * 0.025, start.y + paperBounds.height * 0.02, { steps: 5 });
      await page.mouse.up();
      await expect(fieldSelector).toHaveValue("0");
      await expect.poll(async () => Number(await xInput.inputValue())).toBeCloseTo(9.3, 1);
      await expect.poll(async () => Number(await yInput.inputValue())).toBeCloseTo(12.3, 1);
    } catch (error) {
      console.error("Template drag failure", { before, after: { x: await xInput.inputValue(), y: await yInput.inputValue(), selected: await fieldSelector.inputValue() }, start, paperBounds, fieldBounds, afterPaper: await dialog.locator(".print-management__paper").boundingBox(), fields: await dialog.locator(".print-management__field").evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute("aria-label"), selected: node.getAttribute("aria-pressed"), x: node.style.left, y: node.style.top }))), events: pointerEvents });
      throw error;
    } finally {
      await page.evaluate(() => {
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) document.removeEventListener(type, window.templatePointerListener, true);
      });
    }
  };
  await dragFirstField();
  await discardTemplate.click();
  await expect(xInput).toHaveValue("7.3");
  // Focused partial input is normalized on blur; selecting another field cannot reuse its text.
  await xInput.fill("");
  await fieldSelector.selectOption("1");
  await expect(xInput).toHaveValue("3");
  await fieldSelector.selectOption("0");
  await expect(xInput).toHaveValue("0");
  await xInput.fill("7.3");
  await xInput.press("Tab");
  await expect(discardTemplate).toBeDisabled();
  // Keep keyboard editing available independently of pointer dragging.
  await dialog.getByRole("button", { name: "Sağa", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(xInput).toHaveValue("8.3");
  await discardTemplate.click();
  // Exercise current bounding rectangles at narrow width and a scaled UI.
  await page.setViewportSize({ width: 390, height: 900 });
  for (const zoom of ["1", "1.25"]) {
    await page.evaluate(value => window.printFixture.scale(Number(value)), zoom);
    // In a compact scaled canvas pointer targets can be clipped; the exact
    // millimetre field editor remains the accessible small-screen fallback.
    await xInput.fill("8.3");
    await expect(xInput).toHaveValue("8.3");
    try {
      await expect(discardTemplate).toBeInViewport({ ratio: 1 });
      await discardTemplate.click();
    } catch (error) {
      console.error("Template footer viewport failure", await dialog.evaluate(node => {
        const rect = element => element?.getBoundingClientRect().toJSON();
        const style = getComputedStyle(node);
        return {
          viewport: { width: innerWidth, height: innerHeight, zoom: getComputedStyle(document.documentElement).zoom },
          dialog: rect(node), footer: rect(node.querySelector(".workspace-frame__footer")),
          buttons: Array.from(node.querySelectorAll(".workspace-frame__footer button"), button => ({ label: button.textContent, bounds: rect(button) })),
          canvas: Object.fromEntries(["left", "top", "width", "height"].map(key => [key, style.getPropertyValue(`--workspace-canvas-${key}`)]))
        };
      }));
      throw error;
    }
  }
  await page.evaluate(() => window.printFixture.scale(1));
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(xInput).toHaveValue("7.3");
  await dialog.getByLabel("Eklenecek alan",{exact:true}).selectOption("customer.name");
  await dialog.getByRole("button",{name:"Alan ekle",exact:true}).click();
  await expect(dialog.getByLabel("Alan seç",{exact:true}).locator("option")).toHaveCount(5);
  await dialog.getByRole("button",{name:"Alanı kaldır",exact:true}).click();
  await expect(discardTemplate).toBeDisabled();
  await dialog.getByLabel("X (mm)",{exact:true}).fill("12");
  await page.evaluate(()=>window.printFixture.failSave(true));
  await saveTemplate.click(); await expect(dialog.getByRole("alert")).toContainText("Şablon kaydedilemedi");
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toHaveValue("12");
  await page.evaluate(()=>window.printFixture.lock());
  await expect(saveTemplate).toBeDisabled();
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toHaveCount(0);
  await discardTemplate.click(); await page.keyboard.press("Escape");
  await page.evaluate(()=>{window.printFixture.restore();window.printFixture.failSave(false);});
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await editTemplate.click();
  await dialog.getByLabel("X (mm)",{exact:true}).fill("15");
  await page.evaluate(()=>window.printFixture.revoke());
  await expect(saveTemplate).toBeDisabled(); await discardTemplate.click();
  await page.evaluate(()=>window.printFixture.restore());
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toBeEnabled();
  await dialog.getByLabel("X (mm)",{exact:true}).fill("14");
  await page.evaluate(()=>window.printFixture.business("template-other-business"));
  await expect(saveTemplate).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("İşletme değişti");
  await discardTemplate.click();
  await page.evaluate(()=>window.printFixture.business("sample"));
  await dialog.getByRole("button",{name:"Önizlemeye dön",exact:true}).click();
  // P2a uses the existing editor and revision save/discard boundary only.
  const pickImage = dialog.getByRole("button",{name:"Boş form görseli seç",exact:true});
  const originalImage = dialog.getByRole("img",{name:"Boş form asıl görseli",exact:true});
  await expect(pickImage).toHaveCount(0);
  await editTemplate.click();
  await page.evaluate(()=>window.printFixture.cancelImage(true));
  await openTools(); await pickImage.click();
  await expect(saveTemplate).toBeDisabled();
  await page.evaluate(()=>window.printFixture.cancelImage(false));
  await openTools(); await pickImage.click();
  await expect(originalImage).toBeVisible();
  await expect(originalImage).toHaveJSProperty("naturalWidth",120);
  await expect(saveTemplate).toBeVisible();
  await page.keyboard.press("Escape");await expect(dialog).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await discardTemplate.click();
  await expect(originalImage).toHaveCount(0);
  await openTools(); await pickImage.click();await saveTemplate.click();
  const savedScan = await page.evaluate(()=>window.printFixture.templates().find(value=>value.documentKind==="sale_receipt").layout.scan);
  expect(savedScan.foreground).toBe(false);expect(savedScan.processedImageRef).toBeNull();
  await openTools(); await pickImage.click();
  await discardTemplate.click();
  await expect(originalImage).toBeVisible();
  expect(await page.evaluate(()=>window.printFixture.templates().find(value=>value.documentKind==="sale_receipt").layout.scan)).toEqual(savedScan);
  await openTools(); await dialog.getByRole("button",{name:"Görseli kaldır",exact:true}).click();
  await expect(originalImage).toHaveCount(0);
  await discardTemplate.click();await expect(originalImage).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await expect(originalImage).toBeVisible();
  await expect(pickImage).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  // P2b-2: real browser codec + worker; immutable assets and explicit template save.
  await editTemplate.click();
  const prepare = dialog.getByRole("button", {name:"Görseli hazırla",exact:true});
  const preparation = dialog.getByLabel("Görsel hazırlama", {exact:true});
  const preparedImage = dialog.getByRole("img", {name:"Boş form hazırlanmış görseli",exact:true});
  const processedBefore = savedScan.processedImageRef;
  await openTools(); await prepare.click();
  await expect(preparation).toBeVisible();
  await expect(dialog.getByLabel("Alan seç",{exact:true})).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  const cornerX = dialog.getByLabel("Köşe X (%)",{exact:true});
  const cornerY = dialog.getByLabel("Köşe Y (%)",{exact:true});
  await cornerX.fill("4"); await cornerY.fill("5");
  await expect(dialog.getByRole("button",{name:"Sol üst köşesi",exact:true})).toHaveCSS("left", /.+px/);
  const handle = dialog.getByRole("button",{name:"Sol üst köşesi",exact:true});
  await handle.scrollIntoViewIfNeeded();
  const handleBounds = await handle.boundingBox();
  const imageBounds = await preparation.locator(".print-management__corners").boundingBox();
  await page.mouse.move(handleBounds.x+handleBounds.width/2,handleBounds.y+handleBounds.height/2);
  await page.mouse.down();
  await page.mouse.move(imageBounds.x+imageBounds.width*.08,imageBounds.y+imageBounds.height*.09,{steps:4});
  await page.mouse.up();
  await expect.poll(async()=>Number(await cornerX.inputValue())).toBeCloseTo(8,0);
  await expect.poll(async()=>Number(await cornerY.inputValue())).toBeCloseTo(9,0);
  await handle.focus(); await page.keyboard.press("ArrowRight");
  await expect.poll(async()=>Number(await cornerX.inputValue())).toBeCloseTo(8.5,0);
  await dialog.getByRole("button",{name:/90° döndür/}).click();
  await dialog.getByRole("button",{name:"Önizle",exact:true}).click();
  await expect(dialog.getByRole("img",{name:"Hazırlanan form önizlemesi",exact:true})).toBeVisible();
  expect((await page.evaluate(()=>window.printFixture.processedCalls())).length).toBe(0);
  await page.evaluate(()=>window.printFixture.failProcessed(true));
  await dialog.getByRole("button",{name:"Uygula",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("Hazırlanan görsel kaydedilemedi");
  await expect(preparation).toBeVisible();
  expect(await page.evaluate(()=>window.printFixture.templates().find(value=>value.documentKind==="sale_receipt").layout.scan)).toEqual(savedScan);
  await page.evaluate(()=>window.printFixture.failProcessed(false));
  await dialog.getByRole("button",{name:"Uygula",exact:true}).click();
  await expect(preparation).toHaveCount(0);
  await expect(preparedImage).toBeVisible();
  await expect(saveTemplate).toBeVisible();
  // Asset creation alone never changes the persisted template.
  expect(await page.evaluate(()=>window.printFixture.templates().find(value=>value.documentKind==="sale_receipt").layout.scan.processedImageRef)).toBe(processedBefore);
  const firstProcessed = (await page.evaluate(()=>window.printFixture.processedCalls())).at(-1);
  expect(firstProcessed.originalImageRef).toBe(savedScan.originalImageRef);
  expect(firstProcessed.imageRef).not.toBe(savedScan.originalImageRef);
  const pixelEvidence = await page.evaluate(async dataUrl => {
    const image = new Image(); image.src=dataUrl; await image.decode();
    const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);
    const rgb=(x,y)=>Array.from(ctx.getImageData(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1).data);
    return {width:canvas.width,height:canvas.height,corners:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]].map(([x,y])=>rgb(x,y))};
  }, firstProcessed.dataUrl);
  expect(pixelEvidence.width).toBeLessThanOrEqual(2200);expect(pixelEvidence.height).toBeLessThanOrEqual(2200);
  expect(pixelEvidence.width*pixelEvidence.height).toBeLessThanOrEqual(4_000_000);
  // Browser canvas PNG round-trips can quantize a channel by 1; verify the actual
  // oriented quadrants without requiring bit-exact RGB across OS codecs.
  const expectedCorners=[[255,255,0,255],[255,0,0,255],[0,255,0,255],[0,0,255,255]];
  for (let corner=0;corner<4;corner++) for (let channel=0;channel<4;channel++)
    expect(Math.abs(pixelEvidence.corners[corner][channel]-expectedCorners[corner][channel])).toBeLessThanOrEqual(1);
  await discardTemplate.click(); await expect(originalImage).toBeVisible();
  await expect(preparedImage).toHaveCount(0);
  // Numeric fallback and footer stay reachable at narrow width and 125% zoom.
  await openTools(); await prepare.click();
  await page.setViewportSize({width:390,height:900});
  await page.evaluate(()=>window.printFixture.scale(1.25));
  await cornerX.fill("3");await cornerY.fill("3");
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await dialog.getByRole("button",{name:"Uygula",exact:true}).click();
  await expect(preparedImage).toBeVisible();
  await expect(saveTemplate).toBeInViewport({ratio:1});
  await saveTemplate.click();
  const processedScan=await page.evaluate(()=>window.printFixture.templates().find(value=>value.documentKind==="sale_receipt").layout.scan);
  expect(processedScan.originalImageRef).toBe(savedScan.originalImageRef);
  expect(processedScan.processedImageRef).not.toBe(savedScan.originalImageRef);
  expect(processedScan.foreground).toBe(false);
  await page.evaluate(()=>window.printFixture.scale(1));
  await page.setViewportSize({width:1440,height:900});
  await page.keyboard.press("Escape");await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await expect(preparedImage).toBeVisible();await expect(prepare).toHaveCount(0);
  await editTemplate.click();
  await openTools(); await dialog.getByRole("button",{name:"Orijinali göster",exact:true}).click();
  await expect(originalImage).toBeVisible();
  await discardTemplate.click();await expect(preparedImage).toBeVisible();
  // Invalid geometry remains in preparation and never creates an asset.
  await openTools(); await prepare.click();await cornerX.fill("100");
  const callsBeforeInvalid=(await page.evaluate(()=>window.printFixture.processedCalls())).length;
  await dialog.getByRole("button",{name:"Önizle",exact:true}).click();
  await expect(preparation.getByRole("alert")).toContainText("Köşeleri");
  expect((await page.evaluate(()=>window.printFixture.processedCalls())).length).toBe(callsBeforeInvalid);
  await dialog.getByRole("button",{name:"Yerleşime dön",exact:true}).click();
  // Cleanup is explicit: grayscale/threshold never run the worker on slider changes.
  await openTools(); await prepare.click();
  await dialog.getByLabel("Gri ton",{exact:true}).check();
  await dialog.getByLabel("Siyah/Beyaz",{exact:true}).check();
  await dialog.getByLabel("Eşik",{exact:true}).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByLabel("Eşik",{exact:true})).toHaveValue("127");
  await expect(dialog.getByRole("img",{name:"Hazırlanan form önizlemesi",exact:true})).toHaveCount(0);
  await dialog.getByRole("button",{name:"Önizle",exact:true}).click();
  const monochrome=await dialog.getByRole("img",{name:"Hazırlanan form önizlemesi",exact:true}).evaluate(async image=>{
    await image.decode();const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    // PNG encoder/decoder colour-space rounding may shift black/white by one
    // level; still require every pixel to be near true neutral black or white.
    for(let i=0;i<data.length;i+=4) {
      const dark=data[i]<=1 && data[i+1]<=1 && data[i+2]<=1;
      const light=data[i]>=254 && data[i+1]>=254 && data[i+2]>=254;
      if((!dark && !light) || data[i+3]!==255) return false;
    }
    return true;
  });
  expect(monochrome).toBe(true);
  await dialog.getByRole("button",{name:"Yerleşime dön",exact:true}).click();
  // A delayed Apply cannot stage after lock/revoke, even if the same authority returns.
  await openTools(); await prepare.click();
  await page.evaluate(()=>window.printFixture.delayProcessed(true));
  const callsBeforeDelayed=(await page.evaluate(()=>window.printFixture.processedCalls())).length;
  await dialog.getByRole("button",{name:"Uygula",exact:true}).click();
  await expect.poll(async()=>(await page.evaluate(()=>window.printFixture.processedCalls())).length).toBe(callsBeforeDelayed+1);
  await expect(dialog.getByRole("button",{name:"Uygula",exact:true})).toBeDisabled();
  await page.keyboard.press("Escape");await expect(dialog).toBeVisible();
  await page.evaluate(()=>window.printFixture.lock());
  await expect(preparation).toHaveCount(0);
  await page.evaluate(()=>window.printFixture.restore());
  await openTools(); await expect(prepare).toBeVisible();
  await page.evaluate(()=>{window.printFixture.releaseReads();window.printFixture.delayProcessed(false);});
  await openTools(); await expect(prepare).toBeEnabled();await expect(saveTemplate).toBeDisabled();
  await dialog.locator(".print-management__tools-menu summary").click();
  await expect(preparedImage).toBeVisible();
  expect(await page.evaluate(()=>window.printFixture.templates().find(value=>value.documentKind==="sale_receipt").layout.scan)).toEqual(processedScan);
  // Tenant changes while a processed asset is pending also reject late staging.
  await openTools(); await prepare.click();await page.evaluate(()=>window.printFixture.delayProcessed(true));
  const callsBeforeTenant=(await page.evaluate(()=>window.printFixture.processedCalls())).length;
  await dialog.getByRole("button",{name:"Uygula",exact:true}).click();
  await expect.poll(async()=>(await page.evaluate(()=>window.printFixture.processedCalls())).length).toBe(callsBeforeTenant+1);
  await page.evaluate(()=>window.printFixture.business("preparation-other-business"));
  await expect(preparation).toHaveCount(0);
  await page.evaluate(()=>{window.printFixture.releaseReads();window.printFixture.delayProcessed(false);});
  await expect(saveTemplate).toBeDisabled();
  await page.evaluate(()=>window.printFixture.business("sample"));
  await expect(preparedImage).toBeVisible();await expect(saveTemplate).toBeDisabled();
  await dialog.getByRole("button",{name:"Önizlemeye dön",exact:true}).click();
  const policy = dialog.getByLabel("Yazdırma politikası", { exact: true });
  const event = dialog.getByLabel("Uygulanacak olay", { exact: true });
  const save = dialog.getByRole("button", { name: "Kaydet", exact: true });
  const discard = dialog.getByRole("button", { name: "Değişiklikleri geri al", exact: true });
  await dialog.getByRole("button", { name: /Satış fişi/ }).click();
  await expect(policy).toHaveValue("ASK_CONFIRMATION");
  await event.selectOption("sale_completed");
  await policy.selectOption("AUTOMATIC");
  await expect(save).toBeVisible(); // Dirty state must reach React before close guard is exercised.
  await expect(dialog.getByRole("button",{name:"Çalışma alanını kapat",exact:true})).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Kaydedilmemiş değişiklikler");
  await dialog.getByRole("button", { name: /Adisyon/ }).click();
  await expect(policy).toHaveValue("OFF");
  await policy.selectOption("ASK_CONFIRMATION");
  await dialog.getByRole("button", { name: /Satış fişi/ }).click();
  await event.selectOption("sale_completed");
  await expect(policy).toHaveValue("AUTOMATIC");
  await discard.click();
  await expect(policy).toHaveValue("OFF");
  await expect(save).toBeDisabled();
  await policy.selectOption("AUTOMATIC");
  await save.click();
  await expect(dialog).toContainText("Ayarlar kaydedildi.");
  expect((await page.evaluate(() => window.printFixture.saved())).filter(rule => rule.trigger === "sale_completed")).toEqual([{ documentKind: "sale_receipt", trigger: "sale_completed", channel: "print", mode: "AUTOMATIC", adapter: "native_print" }]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Önizlemeyi aç" }).click();
  await event.selectOption("sale_completed");
  await expect(policy).toHaveValue("AUTOMATIC");
  await policy.selectOption("ASK_CONFIRMATION");
  await page.evaluate(() => window.printFixture.failSave(true));
  await save.click();
  await expect(dialog.getByRole("alert")).toContainText("Test kayıt hatası");
  await expect(policy).toHaveValue("ASK_CONFIRMATION");
  await expect(save).toBeEnabled();
  await page.evaluate(() => window.printFixture.revoke());
  await expect(dialog.getByRole("navigation")).toHaveCount(0);
  await expect(save).toBeDisabled();
  await expect(discard).toBeEnabled();
  await discard.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => { window.printFixture.restore(); window.printFixture.failSave(false); });
  await page.getByRole("button", { name: "Önizlemeyi aç" }).click();
  await expect(policy).toBeEnabled();
  const whatsapp = dialog.getByLabel("WhatsApp politikası", { exact: true });
  await expect(whatsapp.locator("option")).toHaveCount(2);
  await page.evaluate(() => window.printFixture.lock());
  await expect(policy).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window.printFixture.delayReads(true); window.printFixture.restore(); });
  await page.getByRole("button", { name: "Önizlemeyi aç" }).click();
  await expect(policy).toBeDisabled();
  await page.evaluate(() => { window.printFixture.revoke(); window.printFixture.releaseReads(); });
  await expect(policy).toHaveCount(0); // Late response cannot restore revoked controls.
  await page.evaluate(() => { window.printFixture.delayReads(false); window.printFixture.restore(); });
  await expect(policy).toBeEnabled();
  const baselineMode = await policy.inputValue();
  await policy.selectOption(baselineMode === "OFF" ? "ASK_CONFIRMATION" : "OFF");
  await expect(save).toBeEnabled();
  const callsBeforeBusinessChange = await page.evaluate(() => window.printFixture.calls().length);
  await page.evaluate(() => window.printFixture.business("other-business"));
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole("alert")).toContainText("İşletme değişti");
  expect(await page.evaluate(() => window.printFixture.calls().length)).toBe(callsBeforeBusinessChange);
  await discard.click();
  await expect(policy).toBeEnabled();
  await expect(policy).toHaveValue("OFF");
  await editTemplate.click();
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.evaluate(scheme => { document.documentElement.dataset.colorScheme = scheme; }, scheme);
    for (const width of [1440, 900, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await dialog.locator(".print-management__configuration").scrollIntoViewIfNeeded();
      await expect(dialog.locator(".print-management__configuration")).toBeVisible();
    }
  }
  // A fresh real React fixture exercises only device printer settings in the same overlay.
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${base}print-shell-test?caps=document.printing,commerce.sales,food_service.orders`);
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  const printerSelect=dialog.getByLabel("Bu cihazın yazıcısı",{exact:true});
  const savePrinter=dialog.getByRole("button",{name:"Kaydet",exact:true});
  const discardPrinter=dialog.getByRole("button",{name:"Değişiklikleri geri al",exact:true});
  const refreshPrinters=dialog.getByRole("button",{name:"Yazıcıları yenile",exact:true});
  await expect(printerSelect).toBeEnabled();
  await expect(printerSelect).toHaveValue(""); // Default OS printer is never silently selected.
  await printerSelect.selectOption("fixture-desk");
  await page.keyboard.press("Escape");await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:/Adisyon/}).click();
  await expect(printerSelect).toHaveValue("");
  await printerSelect.selectOption("fixture-kitchen");
  await dialog.getByRole("button",{name:/Satış fişi/}).click();
  await expect(printerSelect).toHaveValue("fixture-desk");
  await dialog.getByLabel("Yazdırma politikası",{exact:true}).selectOption("ASK_CONFIRMATION");
  await dialog.getByRole("button",{name:"Kaydet",exact:true}).click();
  await expect(savePrinter).toBeDisabled();
  expect((await page.evaluate(()=>window.printFixture.bindings())).length).toBe(2);
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await expect(printerSelect).toHaveValue("fixture-desk");
  await printerSelect.selectOption("fixture-kitchen");
  await page.evaluate(()=>window.printFixture.failSave(true));
  await savePrinter.click();await expect(dialog.getByRole("alert")).toContainText("Yazıcı ayarı kaydedilemedi");
  await expect(printerSelect).toHaveValue("fixture-kitchen");await expect(savePrinter).toBeEnabled();
  await discardPrinter.click();await expect(printerSelect).toHaveValue("fixture-desk");
  await page.evaluate(()=>{window.printFixture.failSave(false);window.printFixture.setPrinters([]);});
  await refreshPrinters.click();
  await expect(printerSelect).toHaveValue("fixture-desk");
  await expect(printerSelect.locator('option[value="fixture-desk"]')).toHaveAttribute("disabled", "");
  await expect(dialog).toContainText("Kayıtlı yazıcı bulunamıyor");
  await printerSelect.selectOption("");await savePrinter.click();
  await expect(printerSelect).toHaveCount(0);await expect(dialog).toContainText("Sistem yazıcısı bulunamadı");
  await page.evaluate(()=>window.printFixture.setPrinters([{name:"fixture-desk"}]));
  await refreshPrinters.click();await expect(printerSelect).toBeEnabled();
  await printerSelect.selectOption("fixture-desk");
  await page.evaluate(()=>window.printFixture.revoke());
  await expect(printerSelect).toHaveCount(0);await expect(dialog).toBeVisible();
  await expect(savePrinter).toBeDisabled();
  await expect(discardPrinter).toBeEnabled();await discardPrinter.click();
  await page.evaluate(()=>window.printFixture.restore());
  await page.evaluate(()=>window.printFixture.business("printer-other"));
  await expect(printerSelect).toHaveValue("");
  await printerSelect.selectOption("fixture-desk");
  await page.evaluate(()=>window.printFixture.business("sample"));
  await expect(savePrinter).toBeDisabled();await discardPrinter.click();
  await page.keyboard.press("Escape");
  await page.evaluate(()=>window.printFixture.delayReads(true));
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await expect(printerSelect).toHaveCount(0);
  await page.evaluate(()=>{window.printFixture.revoke();window.printFixture.releaseReads();});
  await expect(printerSelect).toHaveCount(0);
  await page.evaluate(()=>{window.printFixture.delayReads(false);window.printFixture.restore();});
  await expect(printerSelect).toBeEnabled();
  expect(await page.getByRole("dialog").count()).toBe(1);
  // Existing saved revision stays untouched until the explicit repair is saved.
  await page.goto(`${base}print-shell-test?caps=document.printing,commerce.sales&legacyTemplate=1`);
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await expect(dialog).toContainText("Bu şablonda ürün satırları yok");
  const legacy = await page.evaluate(()=>window.printFixture.templates()[0]);
  expect(legacy.revision).toBe(2);expect(legacy.layout.lineBlock).toBeNull();
  await editTemplate.click();
  await openTools(); await dialog.getByRole("button",{name:"Ürün satırlarını ekle",exact:true}).click();
  await expect(dialog.locator(".print-management__row-field")).toHaveCount(9);
  expect((await page.evaluate(()=>window.printFixture.templates()[0])).revision).toBe(2);
  await discardTemplate.click();
  await expect(dialog).toContainText("Bu şablonda ürün satırları yok");
  await openTools(); await dialog.getByRole("button",{name:"Ürün satırlarını ekle",exact:true}).click();
  await saveTemplate.click();
  await expect(saveTemplate).toBeDisabled();
  const repaired = await page.evaluate(()=>window.printFixture.templates()[0]);
  expect(repaired.revision).toBe(3);expect(repaired.layout.lineBlock.fields.map(field=>field.binding)).toEqual(["line.description","line.quantity","line.total"]);
  expect({...repaired.layout,lineBlock:null}).toEqual(legacy.layout);
  // Unified footer: all three owners participate, failure retains only the
  // unacknowledged drafts, and a retry cannot create duplicate template revisions.
  await page.goto(`${base}print-shell-test?caps=document.printing,commerce.sales,service.whatsapp&readyJob=1`);
  await page.getByRole("button", {name:"Önizlemeyi aç"}).click();
  const footer = dialog.locator(".workspace-frame__footer");
  const commonSave = footer.getByRole("button", {name:"Kaydet",exact:true});
  const commonDiscard = footer.getByRole("button", {name:"Değişiklikleri geri al",exact:true});
  const close = dialog.getByRole("button", {name:"Çalışma alanını kapat",exact:true});
  await expect(footer.locator("button")).toHaveCount(2);
  await expect(commonSave).toBeDisabled();
  await expect(commonDiscard).toBeDisabled();
  await expect(close).toBeEnabled();
  await editTemplate.click();
  await dialog.getByLabel("X (mm)",{exact:true}).fill("6");
  await policy.selectOption("ASK_CONFIRMATION");
  await printerSelect.selectOption("fixture-desk");
  await expect(commonSave).toBeEnabled();
  await expect(close).toBeDisabled();
  expect(await page.evaluate(()=>window.printFixture.mutations())).toEqual([]);
  await commonDiscard.click();
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toHaveValue("3");
  await expect(policy).toHaveValue("OFF");
  await expect(printerSelect).toHaveValue("");
  await expect(close).toBeEnabled();
  expect(await page.evaluate(()=>window.printFixture.mutations())).toEqual([]);
  await dialog.getByLabel("X (mm)",{exact:true}).fill("6");
  await policy.selectOption("ASK_CONFIRMATION");
  await printerSelect.selectOption("fixture-desk");
  await page.evaluate(()=>window.printFixture.failOwner("printer"));
  await commonSave.click();
  await expect(footer.getByRole("alert")).toContainText("Yazıcı ayarı kaydedilemedi");
  await expect(footer).toContainText("kalan taslakları kontrol edin");
  await expect(commonSave).toBeEnabled();
  await expect(close).toBeDisabled();
  expect((await page.evaluate(()=>window.printFixture.templates()))[0].revision).toBe(1);
  expect(await page.evaluate(()=>window.printFixture.saved())).toHaveLength(1);
  expect(await page.evaluate(()=>window.printFixture.bindings())).toEqual([]);
  await expect(printerSelect).toHaveValue("fixture-desk");
  await page.evaluate(()=>window.printFixture.failOwner(null));
  await commonSave.click();
  await expect(commonSave).toBeDisabled();
  await expect(commonDiscard).toBeDisabled();
  await expect(close).toBeEnabled();
  expect((await page.evaluate(()=>window.printFixture.templates()))[0].revision).toBe(1);
  expect(await page.evaluate(()=>window.printFixture.mutations())).toEqual(["template","rule","printer","printer"]);
  expect(await page.evaluate(()=>window.printFixture.outputCalls())).toEqual({printCalls:0,previewCalls:0});
  // Busy guards and duplicate click: only one awaited request per owner.
  await dialog.getByLabel("Alan seç",{exact:true}).selectOption("0");
  // First field already spans the page width, so its X coordinate is
  // correctly clamped. Move Y instead to stage a real layout change.
  const yBeforeQueuedSave = Number(await dialog.getByLabel("Y (mm)",{exact:true}).inputValue());
  const targetY = yBeforeQueuedSave === 8 ? 9 : 8;
  await dialog.getByLabel("Y (mm)",{exact:true}).fill(String(targetY));
  await expect.poll(async()=>dialog.locator(".print-management__field").first().evaluate(node=>parseFloat(node.style.top))).toBeCloseTo(targetY / 160 * 100,1);
  await policy.selectOption("AUTOMATIC");
  await printerSelect.selectOption("fixture-kitchen");
  await page.evaluate(()=>window.printFixture.delayWrites(true));
  await commonSave.click();
  await expect(footer.locator('button[aria-busy="true"]')).toBeDisabled();
  await expect(commonDiscard).toBeDisabled();
  await expect(close).toBeDisabled();
  await expect(policy).toBeDisabled();
  await expect(dialog.getByLabel("X (mm)",{exact:true})).toBeDisabled();
  await page.keyboard.press("Escape");await expect(dialog).toBeVisible();
  await footer.locator('button[aria-busy="true"]').evaluate(node=>node.click());
  for (const count of [6,7]) {
    await page.evaluate(()=>window.printFixture.releaseWrite());
    await expect.poll(async()=>(await page.evaluate(()=>window.printFixture.mutations())).length).toBe(count);
  }
  await page.evaluate(()=>{window.printFixture.delayWrites(false);window.printFixture.releaseWrite();});
  await expect(commonSave).toBeDisabled();
  await expect(close).toBeEnabled();
  expect((await page.evaluate(()=>window.printFixture.templates()))[0].revision).toBe(2);
  expect(await page.evaluate(()=>window.printFixture.mutations())).toEqual(["template","rule","printer","printer","template","rule","printer"]);
  // Save remains configuration-only; only an explicit ready-job action prints.
  const jobs = dialog.getByRole("region", {name:"Hazır belgeler"});
  await jobs.getByRole("button",{name:"Önizle",exact:true}).click();
  expect(await page.evaluate(()=>window.printFixture.outputCalls())).toEqual({printCalls:0,previewCalls:1});
  await jobs.getByRole("button",{name:"Yazdır",exact:true}).click();
  await expect(dialog).toContainText("yazdırma kuyruğuna alındı");
  await expect(jobs).toHaveCount(0);
  expect(await page.evaluate(()=>window.printFixture.outputCalls())).toEqual({printCalls:1,previewCalls:1});
  await dialog.getByRole("button",{name:"Önizlemeye dön",exact:true}).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Önizlemeyi aç"}).click();
  await expect(policy).toHaveValue("AUTOMATIC");
  await expect(printerSelect).toHaveValue("fixture-kitchen");
  await expect(dialog.locator(".print-management__preview input, .print-management__preview select")).toHaveCount(0);
  // Measured layout/fit and footer reachability at desktop, laptop, mobile and UI zoom.
  for (const [width,height,zoom] of [[1920,1080,1],[1366,768,1],[1366,768,1.25],[768,768,1],[390,768,1],[390,768,1.25]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(value=>window.printFixture.scale(value),zoom);
    await expect(dialog).toHaveClass(/workspace-frame--centered/);
    await expect(commonSave).toBeInViewport({ratio:1});
    await expect(commonDiscard).toBeInViewport({ratio:1});
    await expect.poll(async()=>dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x+bounds.width).toBeLessThanOrEqual(width+1);
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(height+1);
    if (zoom === 1 && width >= 1366) {
      expect(bounds.width).toBeGreaterThanOrEqual(1200);
      expect(bounds.width).toBeLessThanOrEqual(1300);
      const [list,preview,config] = await Promise.all(["documents","preview","configuration"].map(part=>dialog.locator(`.print-management__${part}`).boundingBox()));
      expect(Math.abs(list.y-preview.y)).toBeLessThan(2);
      expect(Math.abs(config.y-preview.y)).toBeLessThan(2);
      expect(list.x+list.width).toBeLessThanOrEqual(preview.x+1);
      expect(preview.x+preview.width).toBeLessThanOrEqual(config.x+1);
    }
    for (const editing of [false,true]) {
      if (editing) await editTemplate.click();
      await dialog.getByRole("button",{name:"Sığdır",exact:true}).click();
      await expect.poll(async()=>dialog.locator(".print-management__editor-body > .print-management__canvas").evaluate(node=>node.scrollHeight<=node.clientHeight+2 && node.scrollWidth<=node.clientWidth+2)).toBe(true);
      const paper = await dialog.locator(".print-management__paper").boundingBox();
      expect(paper.width/paper.height).toBeCloseTo(.5,2);
      if (editing) {
        // For overlapping fields, the inspector selects the intended layer
        // before its document target is brought forward for direct interaction.
        await dialog.getByLabel("Alan seç",{exact:true}).selectOption("1");
        const second=dialog.getByRole("button",{name:"Belge numarası alanı 2",exact:true});
        await second.click();
        await expect(dialog.getByLabel("Seçili alan türü",{exact:true})).toHaveValue("document.number");
        await expect(dialog.getByLabel("Alan seç",{exact:true})).toHaveValue("1");
      }
      if (screenshots) {
        const directory=resolve("artifacts/print-management");await mkdir(directory,{recursive:true});
        await page.screenshot({path:resolve(directory,`${width}x${height}-${zoom}-${editing?"edit":"preview"}.png`)});
      }
      if (editing) await dialog.getByRole("button",{name:"Önizlemeye dön",exact:true}).click();
    }
  }
  await expect(dialog).not.toContainText("Politikalar yalnız gelecekteki");
  await expect(dialog).not.toContainText("Yazıcı seçimi bu cihaza kaydedilir");
  expect(errors).toEqual([]);
  console.log("Print management UI: Settings/search/focus, capabilities, selected geometry/pointer/mm buffer, scans/worker, unified draft save/discard/partial failure/retry/busy guard, explicit print queue, centered three panels, fit and responsive zoom passed.");
  }
} finally {
  await browser?.close();
  await server.close();
}
