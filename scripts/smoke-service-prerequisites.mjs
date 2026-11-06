import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(path, overrides = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require: id => overrides[id] ?? require(id), ...globals });
  return exports;
}
const { aiServiceBlockedReason: ai, translationBlockedReason: translation, dictationBlockedReason: stt,
  whatsappBlockedReason: whatsapp, whatsappBusinessConfigured: business } = load("apps/desktop-app/src/components/settings/service-prerequisites.ts");
const form = { aiEnabled: true, aiModel: "gpt-4.1", aiSttModel: "whisper-1", aiApiKey: "", aiGoogleCurl: "", aiStoredApiKeyConfigured: true,
  clearAiApiKey: false, aiProvider: "openai_compatible", aiService: "openai", aiBaseUrl: "https://api.openai.com/v1", aiTimeoutSeconds: 30 };
assert.equal(ai(form, true), undefined);
assert.equal(ai(form, false), "AI Yardımcı kapalı");
assert.equal(ai({ ...form, aiEnabled: false }, true), "AI Yardımcı kapalı");
for (const patch of [{ aiModel: " " }, { aiStoredApiKeyConfigured: false, aiApiKey: "  " }, { clearAiApiKey: true }]) {
  assert.equal(ai({ ...form, ...patch }, true), "AI modeli/bağlantısı eksik");
}
assert.equal(ai({ ...form, aiStoredApiKeyConfigured: false, aiApiKey: "fixture-key" }, true), undefined);
assert.equal(ai({ ...form, aiStoredApiKeyConfigured: false, aiGoogleCurl: "fixture-curl" }, true), undefined);
assert.equal(translation(form, { ...form, aiEnabled: false }, true), "AI ayarlarını kaydedin");
assert.equal(translation({ ...form, aiEnabled: false }, form, true), "AI Yardımcı kapalı");
const testable = { ready: false, canTest: true };
assert.equal(stt(form, form, true, testable), undefined, "unknown verification must allow opening the test");
assert.equal(stt(form, form, true, { ready: true, canTest: false }), undefined);
assert.equal(stt(form, form, true, null), "AI durumu bekleniyor");
assert.equal(stt(form, form, true, { ready: false, canTest: false }), "AI modeli/bağlantısı eksik");
assert.equal(stt({ ...form, aiSttModel: " " }, form, true, testable), "AI modeli/bağlantısı eksik");
assert.equal(stt({ ...form, aiSttModel: "new-model" }, form, true, testable), "AI konuşma ayarlarını kaydedin");
assert.equal(stt({ ...form, aiApiKey: "unsaved-key" }, form, true, testable), "AI konuşma ayarlarını kaydedin");
assert.equal(stt({ ...form, aiModel: "different-chat-model" }, form, true, testable), undefined);
for (const phone of ["", "   ", "+ ()"]) assert.equal(whatsapp(phone), "WhatsApp numarası eksik");
for (const phone of ["+90 555 123 45 67", "+44 20 1234 5678", "123"]) assert.equal(whatsapp(phone), undefined);
assert.equal(whatsapp("+44 20 1234 5678", ""), "WhatsApp numarasını kaydedin");
const cloud = { wabaId: "1", phoneNumberId: "2", accessToken: "", hasSecret: true, clearAccessToken: false };
assert.equal(business(cloud), true);
for (const patch of [{ wabaId: " " }, { phoneNumberId: "" }, { hasSecret: false, accessToken: " " }, { clearAccessToken: true }]) assert.equal(business({ ...cloud, ...patch }), false);
assert.equal(business({ ...cloud, hasSecret: false, accessToken: "fixture-token" }), true);

const { nexaBackdropClip } = load("apps/desktop-app/src/components/ui/nexa-backdrop.ts");
const artwork = { left: 48, top: 300, width: 112, height: 112 };
const speech = { left: 20, top: 240, width: 168, height: 32 };
const empty = nexaBackdropClip(null, null);
assert.ok(empty.startsWith("polygon(evenodd"));
assert.equal(empty.split("0 var(--backdrop-cutout-top)").length - 1, 2);
const both = nexaBackdropClip(artwork, speech, 1, 8, 6);
assert.equal(both.split("0 var(--backdrop-cutout-top)").length - 1, 4, "two independent closed holes with retraced bridges");
assert.ok(both.includes("104.00px 278.00px"), "bubble tail follows its own rounded hole");
assert.ok(!both.includes("48.00px 300.00px"), "ellipse excludes bounding rectangle corners");
const scaled = Object.fromEntries(Object.entries(artwork).map(([key, value]) => [key, value * 1.25]));
assert.equal(nexaBackdropClip(scaled, null, 1.25), nexaBackdropClip(artwork, null), "physical rects convert back to CSS zoom units");

// Real React server rendering checks semantics; isolated hooks let us invoke the
// production handlers without a browser or a second implementation of the gate.
const owner = { dirty: false, savedEnabled: false, save: () => ({ ok: true }), discard() {} };
const opens = [], changes = [];
const host = { active: null, owner: () => owner, open: id => opens.push(id) };
const dependencies = {
  '../../app/runtime-state': { reportAppStatus() {} },
  '../ui/ActionButton': load('apps/desktop-app/src/components/ui/ActionButton.tsx'),
  '../ui/FormDialog': { FormDialog: 'form-dialog-fixture' },
  '../ui/StatusBadge': { StatusBadge: 'status-badge-fixture' },
  './SettingsUnsavedChangesDialog': { SettingsUnsavedChangesDialog: 'unsaved-fixture' }
};
const file = 'apps/desktop-app/src/components/settings/ServiceSettingsCard.tsx';
const rendered = load(file, dependencies);
const markup = (props, state = owner) => renderToStaticMarkup(React.createElement(rendered.ServiceSettingsContext.Provider,
  { value: { ...host, owner: () => state } }, React.createElement(rendered.ServiceSettingsCard,
    { id: 'fixture-service', title: 'Örnek Servis', enabled: false, children: 'Alanlar', ...props })));
assert.match(markup({}), /<button[^>]+aria-haspopup="dialog"/);
assert.match(markup({}), /data-state="inactive"/);
assert.match(markup({}, { ...owner, savedEnabled: true }), /data-state="active"/);
assert.match(markup({ enabled: true }, { ...owner, dirty: true }), /Kapalı · Bekliyor/);
assert.match(markup({ blockedReason: 'AI Yardımcı kapalı' }), /disabled=""/);
assert.match(markup({ blockedReason: 'AI Yardımcı kapalı' }), /data-state="blocked"/);
assert.equal((markup({}).match(/<button/g) ?? []).length, 1, 'one native button, no nested controls');
assert.ok(!markup({}).includes('settings-service-prerequisite'), 'notes appear only when blocked');
const handlers = load(file, { ...dependencies,
  'react': { ...React, useContext: () => host, useRef: value => ({ current: value }),
    useState: value => [value, () => {}], useEffect() {} },
  'react-dom': { createPortal: element => element }
}, { document: { body: {} } });
const props = { id: 'fixture-service', title: 'Örnek Servis', enabled: false, children: 'Alanlar', onEnabledChange: value => changes.push(value) };
const blocked = handlers.ServiceSettingsCard({ ...props, blockedReason: 'AI Yardımcı kapalı' });
blocked.props.children[0].props.onClick();
assert.deepEqual(opens, [], 'blocked production handler cannot open');
handlers.ServiceSettingsCard(props).props.children[0].props.onClick();
assert.deepEqual(opens, ['fixture-service']);
assert.deepEqual(changes, [], 'tile click never toggles');
host.active = 'fixture-service';
assert.equal(handlers.ServiceSettingsCard({ ...props, blockedReason: 'AI Yardımcı kapalı' }).props.children[1], false, 'host/search entry cannot bypass prerequisite');
const detail = handlers.ServiceSettingsCard({ ...props, toggleDisabled: true }).props.children[1];
const toggle = detail.props.children.props.children[1].props.children[0];
assert.equal(toggle.props.disabled, true);
toggle.props.onChange({ target: { checked: true } });
assert.deepEqual(changes, [], 'enable handler defends the prerequisite');
const onDetail = handlers.ServiceSettingsCard({ ...props, enabled: true, toggleDisabled: true }).props.children[1];
const onToggle = onDetail.props.children.props.children[1].props.children[0];
assert.equal(onToggle.props.disabled, false, 'an existing preference can still be disabled');
onToggle.props.onChange({ target: { checked: false } });
assert.deepEqual(changes, [false]);

// Exercise the real modal geometry effect and its cleanup with measured DOM
// doubles. Native paint and layout remain covered by smoke-service-tiles-ui.
class MeasuredElement {
  constructor(rect) { this.rect = rect; this.values = new Map(); }
  style = { setProperty: (key, value) => this.values.set(key, value), removeProperty: key => this.values.delete(key) };
  classList = { contains: () => false };
  getBoundingClientRect() { return this.rect; }
  getClientRects() { return this.rect?.width ? [this.rect] : []; }
  getAnimations() { return []; }
  addEventListener() {}
  removeEventListener() {}
}
const root = new MeasuredElement(), sidebar = new MeasuredElement(), habitat = new MeasuredElement(artwork);
const character = new MeasuredElement(artwork), bubble = new MeasuredElement(speech), nativeDialog = new MeasuredElement();
let bubbleVisible = false, zoom = 1, frameCallback = null, resizeCallback, disconnected = 0;
const sidebarListeners = new Map();
let closed = false, focused = false;
const listeners = new Set(), effects = [], closeReasons = [];
sidebar.children = [habitat];
sidebar.querySelector = () => habitat;
sidebar.addEventListener = (event, callback) => sidebarListeners.set(event, callback);
sidebar.removeEventListener = (event, callback) => { if (sidebarListeners.get(event) === callback) sidebarListeners.delete(event); };
habitat.querySelector = selector => selector === '.nexa-scene-back' ? character : bubbleVisible ? bubble : null;
nativeDialog.showModal = () => {};
nativeDialog.close = () => { closed = true; };
nativeDialog.focus = () => {};
nativeDialog.querySelector = () => null;
const trigger = Object.assign(new MeasuredElement(), { isConnected: true, closest: () => null, focus: () => { focused = true; } });
const document = { documentElement: root, activeElement: trigger, querySelector: selector => selector === '#desktop-sidebar' ? sidebar : null };
const { ModalSurface } = load('apps/desktop-app/src/components/ui/ModalSurface.tsx', {
  'react': { ...React, useContext: () => false, useRef: () => ({ current: nativeDialog }), useLayoutEffect: effect => effects.push(effect) },
  './nexa-backdrop': { nexaBackdropClip }
}, {
  document, HTMLElement: MeasuredElement,
  window: { addEventListener: name => listeners.add(name), removeEventListener: name => listeners.delete(name) },
  requestAnimationFrame: callback => { frameCallback = callback; return 1; }, cancelAnimationFrame: () => { frameCallback = null; },
  getComputedStyle: (node, pseudo) => ({ zoom: String(zoom), visibility: 'visible', opacity: '1', borderTopLeftRadius: '8px',
    content: pseudo ? '""' : 'none', bottom: '-4px', width: '8px' }),
  ResizeObserver: class { constructor(callback) { resizeCallback = callback; } observe() {} unobserve() {} disconnect() { disconnected++; } }
});
assert.doesNotMatch(readFileSync('apps/desktop-app/src/components/ui/ModalSurface.tsx', 'utf8'), /\bMutationObserver\b/,
  'Modal geometry must not reintroduce DOM mutation observation');
const modalElement = ModalSurface({ labelledBy: 'title', onClose: reason => closeReasons.push(reason), children: 'Modal' }).props.children;
const nativeElement = modalElement.type(modalElement.props);
const cleanup = effects.map(effect => effect());
const clip = () => nativeDialog.values.get('--nexa-backdrop-clip');
assert.equal(clip(), nexaBackdropClip(artwork, null, 1, 0, 0, true), 'initial measured crystal habitat');
bubbleVisible = true;
sidebarListeners.get('nexa:geometry-change')();
frameCallback();
assert.equal(clip(), nexaBackdropClip(artwork, speech, 1, 8, 4 + (Math.SQRT2 - 1) * 4, true));
bubbleVisible = false;
sidebarListeners.get('nexa:geometry-change')();
frameCallback();
assert.equal(clip(), nexaBackdropClip(artwork, null, 1, 0, 0, true), 'removed bubble removes only its hole');
character.rect = { left: 24, top: 250, width: 40, height: 40 };
resizeCallback(); frameCallback();
assert.equal(clip(), nexaBackdropClip(character.rect, null, 1, 0, 0, true), 'compact/collapsed measurement');
zoom = 1.25;
resizeCallback(); frameCallback();
assert.equal(clip(), nexaBackdropClip(character.rect, null, zoom, 0, 0, true), 'appearance zoom measurement');
character.rect = { left: 0, top: 0, width: 0, height: 0 };
resizeCallback(); frameCallback();
assert.equal(clip(), nexaBackdropClip(null, null), 'hidden avatar has no cutout');
nativeElement.props.onCancel({ preventDefault() {} });
assert.deepEqual(closeReasons, ['escape']);
cleanup.filter(Boolean).forEach(dispose => dispose());
assert.equal(nativeDialog.values.has('--nexa-backdrop-clip'), false, 'close cleans dialog variable');
assert.equal(root.values.size, 0, 'no shared root variables leak between modals');
assert.equal(disconnected, 1, 'only the production ResizeObserver is disconnected');
assert.equal(sidebarListeners.size, 0, 'React geometry and animation listeners are removed');
assert.equal(listeners.size, 0);
assert.equal(frameCallback, null);
assert.ok(closed && focused, 'native dialog closes and restores focus');
console.log("service-prerequisites-ok: dependencies, React tile states/handlers, toggle defense; measured modal holes, bubble lifecycle, resize/zoom, Escape/focus and cleanup");
