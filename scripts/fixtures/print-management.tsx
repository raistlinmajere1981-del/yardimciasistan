import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BUSINESS_CAPABILITIES as C, expandBusinessCapabilities, type BusinessCapability, type DocumentKind, type DocumentPrinter, type DocumentPrinterSettings, type DocumentOutputRuleInput, type DocumentOutputManagementBridge, type DocumentOutputSettings, type DocumentOutputManagementResult, type DocumentOutputTemplateReadResult } from "@yardimci-asistan/shared";
import { BusinessCapabilityRuntimeProvider } from "../../apps/desktop-app/src/app/business-capability-context";
import { PrintManagementWorkspace } from "../../apps/desktop-app/src/components/settings/PrintManagementWorkspace";
import { defaultDocumentLayout } from "../../apps/desktop-app/src/components/settings/DocumentTemplateCanvas";
import { WorkspaceScaleContext } from "../../apps/desktop-app/src/components/workspace/WorkspaceFrame";
import "../../apps/desktop-app/src/styles/index.css";

const query = new URLSearchParams(location.search);
const initialCapabilities = expandBusinessCapabilities((query.get("caps") ?? "").split(",").filter(Boolean) as BusinessCapability[]);
let printers: DocumentPrinter[] = [{ name: "fixture-desk", displayName: "Masa yazıcısı", isDefault: true }, { name: "fixture-kitchen", displayName: "Mutfak yazıcısı" }];
const printerBindings = new Map<string, string>();
const printerSettings = (documentKind: DocumentKind): DocumentPrinterSettings => {
  const printerRef = printerBindings.get(`${currentBusiness}:${documentKind}`) ?? null;
  return { documentKind, printers: structuredClone(printers), printerRef, missing: printerRef !== null && !printers.some(printer => printer.name === printerRef) };
};
const templates = new Map<string, DocumentOutputTemplateReadResult>();
if (query.has("legacyTemplate")) templates.set("sample:sale_receipt", {documentKind:"sale_receipt",revision:2,layout:{...defaultDocumentLayout("sale_receipt"),lineBlock:null}});
const rules = new Map<string, DocumentOutputRuleInput>();
let failSave = false;
let delayed = false;
const pending: Array<() => void> = [];
const calls: DocumentOutputRuleInput[] = [];
let currentBusiness = "sample";
let setBusinessRuntime: (id: string) => void;
let setRuntime: (caps: BusinessCapability[] | null) => void;
let setScale: (scale: number) => void;
const key = (rule: DocumentOutputRuleInput) => `${rule.documentKind}:${rule.trigger}:${rule.channel}`;
let imageSequence = 0;
let cancelImage = false;
// Asymmetric generated quadrants make browser decode/rotation assertions meaningful.
const imageCanvas = document.createElement("canvas"); imageCanvas.width = 120; imageCanvas.height = 80;
const imageContext = imageCanvas.getContext("2d")!;
for (const [x, y, color] of [[0,0,"#ff0000"],[60,0,"#00ff00"],[60,40,"#0000ff"],[0,40,"#ffff00"]] as const) {
  imageContext.fillStyle = color; imageContext.fillRect(x,y,60,40);
}
const imageData = imageCanvas.toDataURL("image/png");
let failProcessed = false;
let delayProcessed = false;
const processedCalls: Array<{ originalImageRef: string; imageRef: string; dataUrl: string }> = [];
const images = new Map<string, string>();
const mock: DocumentOutputManagementBridge = {
  saveProcessedFormImage: async ({documentKind,originalImageRef,pngBase64}) => {
    if (failProcessed) return {ok:false,code:"DOCUMENT_IMAGE_FAILED",message:"Görsel kaydedilemedi."};
    const scope = `${currentBusiness}:${documentKind}`;
    if (!images.has(`${scope}:${originalImageRef}`) || !pngBase64.startsWith("iVBOR")) return {ok:false,code:"DOCUMENT_IMAGE_FAILED",message:"Asıl görsel bulunamadı."};
    const imageRef = `00000000-0000-4000-8000-${String(++imageSequence).padStart(12,"0")}`;
    const dataUrl = `data:image/png;base64,${pngBase64}`;
    images.set(`${scope}:${imageRef}`,dataUrl);
    processedCalls.push({originalImageRef,imageRef,dataUrl});
    if (delayProcessed) await new Promise<void>(resolve => pending.push(resolve));
    return {ok:true,value:{imageRef,dataUrl}};
  },
  pickFormImage: async ({documentKind}) => {
    if (cancelImage) return {ok:true,value:null};
    const imageRef = `00000000-0000-4000-8000-${String(++imageSequence).padStart(12,"0")}`;
    images.set(`${currentBusiness}:${documentKind}:${imageRef}`,imageData);
    return {ok:true,value:{imageRef,dataUrl:imageData}};
  },
  readFormImage: async ({documentKind,imageRef}) => {
    const dataUrl = images.get(`${currentBusiness}:${documentKind}:${imageRef}`);
    return dataUrl ? {ok:true,value:{imageRef,dataUrl}} : {ok:false,code:"DOCUMENT_IMAGE_FAILED",message:"Görsel okunamadı."};
  },
  getDocumentPrinters: async ({documentKind}) => {
    const value = printerSettings(documentKind);
    if (delayed) return new Promise(resolve => pending.push(() => resolve({ok:true,value})));
    return {ok:true,value};
  },
  readPrinterBinding: async ({documentKind}) => ({ok:true,value:printerSettings(documentKind)}),
  savePrinterBinding: async ({documentKind,printerRef}) => {
    if (failSave) return {ok:false,code:"TEST_FAILED",message:"Yazıcı ayarı kaydedilemedi."};
    if (printerRef !== null && !printers.some(printer => printer.name === printerRef)) return {ok:false,code:"DOCUMENT_PRINTER_INVALID",message:"Yazıcı bulunamıyor."};
    const key = `${currentBusiness}:${documentKind}`;
    if (printerRef === null) printerBindings.delete(key); else printerBindings.set(key,printerRef);
    return {ok:true,value:printerSettings(documentKind)};
  },
  readDocumentOutputTemplate: async ({documentKind}) => {
    const value = templates.get(`${currentBusiness}:${documentKind}`) ?? { documentKind, revision: null, layout: null };
    if (delayed) return new Promise(resolve => pending.push(() => resolve({ok:true,value})));
    return {ok:true,value};
  },
  saveDocumentOutputTemplate: async input => {
    if (failSave) return {ok:false,code:"TEST_FAILED",message:"Şablon kaydedilemedi."};
    const key = `${currentBusiness}:${input.documentKind}`;
    const previous = templates.get(key);
    if ((previous?.revision ?? null) !== input.expectedRevision) return {ok:false,code:"DOCUMENT_TEMPLATE_CONFLICT",message:"Şablon değişti."};
    const value = { documentKind: input.documentKind, revision: (previous?.revision ?? 0) + 1, layout: structuredClone(input.layout) };
    templates.set(key,value); return {ok:true,value};
  },
  getDocumentOutputSettings: async input => {
    const result: DocumentOutputManagementResult<DocumentOutputSettings> = { ok: true, value: { documentKind: input.documentKind,
      rules: (currentBusiness === "sample" ? [...rules.values()] : []).filter(rule => rule.documentKind === input.documentKind), whatsappEnabled: initialCapabilities.includes(C.WHATSAPP) } };
    if (delayed) return new Promise(resolve => pending.push(() => resolve(result)));
    return result;
  },
  saveDocumentOutputRule: async rule => {
    if (failSave) return { ok: false, code: "TEST_FAILED", message: "Test kayıt hatası" };
    calls.push(rule); rules.set(key(rule), rule);
    return { ok: true, value: rule };
  }
};
Object.assign(window, { yardimciDesktop: mock, printFixture: {
  business: (id: string) => { currentBusiness = id; setBusinessRuntime(id); },
  scale: (value: number) => { document.documentElement.style.zoom = String(value); setScale(value); },
  revoke: () => setRuntime([]), lock: () => setRuntime(null),
  restore: () => setRuntime(initialCapabilities),
  failSave: (value: boolean) => { failSave = value; },
  delayReads: (value: boolean) => { delayed = value; },
  releaseReads: () => { for (const release of pending.splice(0)) release(); },
  setPrinters: (value: DocumentPrinter[]) => { printers = value; },
  failProcessed: (value: boolean) => { failProcessed = value; },
  delayProcessed: (value: boolean) => { delayProcessed = value; },
  processedCalls: () => structuredClone(processedCalls),
  image: (kind: DocumentKind, ref: string) => images.get(`${currentBusiness}:${kind}:${ref}`),
  cancelImage: (value: boolean) => { cancelImage = value; },
  bindings: () => [...printerBindings.entries()],
  templates: () => [...templates.values()],
  saved: () => [...rules.values()], calls: () => calls
} });
function Fixture() {
  const [open, setOpen] = useState(false);
  const [scale, setUiScale] = useState(1); setScale = setUiScale;
  const [enabledCapabilities, setCapabilities] = useState<BusinessCapability[] | null>(query.has("locked") ? null : initialCapabilities);
  const [businessId, setBusinessId] = useState("sample");
  setRuntime = setCapabilities; setBusinessRuntime = setBusinessId;
  const snapshot = enabledCapabilities === null ? null : {
    businessId, profileId: "market", enabledCapabilities,
    capabilities: enabledCapabilities.map(capability => ({ capability, enabled: true, source: "profile" as const, updatedAt: "2026-10-28" }))
  };
  return <WorkspaceScaleContext.Provider value={scale}><BusinessCapabilityRuntimeProvider value={{ snapshot }}>
    <button onClick={() => setOpen(true)}>Önizlemeyi aç</button>
    {open && <PrintManagementWorkspace initialized={!query.has("uninitialized")}
      whatsappEnabled={enabledCapabilities?.includes(C.WHATSAPP) ?? false} onClose={() => setOpen(false)} />}
  </BusinessCapabilityRuntimeProvider></WorkspaceScaleContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
