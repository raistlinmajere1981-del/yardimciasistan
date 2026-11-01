import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Run the actual renderer projection and option editor without a localhost server.
export function verifyWebAvailabilityContract() {
  const require = createRequire(import.meta.url), cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
    } }).outputText;
    runInNewContext(code, { exports, require: name => {
      if (!name.startsWith(".")) return require(name);
      const stem = resolve(dirname(file), name);
      const target = [stem, `${stem}.ts`, `${stem}.tsx`].find(path => existsSync(path));
      assert.ok(target, `Missing renderer dependency: ${name}`);
      return load(target);
    } });
    return exports;
  }
  const app = file => load(resolve("apps/desktop-app/src", file));
  const { BUSINESS_CAPABILITIES: C, getBusinessProfile, expandBusinessCapabilities } = require("@yardimci-asistan/shared");
  const { isWebAvailable, WebAvailabilityProvider } = app("app/web-availability.tsx");
  const { projectDesktopWorkspaceFeatures } = app("app/desktop-workspace-features.ts");
  const { searchSettings, isSettingsSectionVisible, dealerPortalDefinition, onlineSalesDeliveryDefinition } = app("app/settings-registry.ts");
  const { BusinessProfileOptionEditor } = app("components/settings/BusinessCapabilitySettings.tsx");
  const { ResourceManagementWorkspace } = app("components/settings/ResourceManagementWorkspace.tsx");
  const roots = [C.REQUESTS, C.QR_MENU, C.ONLINE_SALES, C.WHOLESALE, C.FOOD_MENU, C.FOOD_ORDERS,
    C.FOOD_RESERVATIONS, C.ACCOMMODATION_RESERVATIONS, C.ACCOMMODATION_ROOMS, C.MARKETING_STUDIO, C.AI, C.ANDROID];
  const snapshot = { enabledCapabilities: expandBusinessCapabilities(roots) };
  const before = JSON.stringify(snapshot);
  const connected = { webModuleUrl: " https://fixture.test/module ", syncSecret: " saved-secret ", autoSyncEnabled: false };
  assert.equal(isWebAvailable(connected), true, "autoSync off still allows manual web publication");
  for (const setup of [{webModuleUrl: "", syncSecret: ""}, {webModuleUrl: " \t", syncSecret: "secret"},
    {webModuleUrl: connected.webModuleUrl, syncSecret: " "}]) assert.equal(isWebAvailable(setup), false);
  for (const available of [false, true, false, true]) {
    for (const [term, id] of [["harita", "settings-public-details"], ["sosyal medya", "settings-social-links"], ["galeri", "settings-gallery-button"], ["google yorumları", "settings-google-reviews"]]) {
      assert.equal(searchSettings(term, snapshot.enabledCapabilities, true, snapshot, available).some(section => section.id === id), available);
    }
    for (const term of ["fotoğraf", "video", "panorama", "kahvaltı", "google maps"]) {
      if (!available) assert.equal(searchSettings(term, snapshot.enabledCapabilities, true, snapshot, available).length, 0, `hidden Web search: ${term}`);
    }
    assert.ok(searchSettings("telefon", snapshot.enabledCapabilities, true, snapshot, available).some(section => section.id === "settings-public-profile"));
    let mediaRenders = 0;
    function SiteMedia() { mediaRenders++; return createElement("span", null, "site-media"); }
    const resource = renderToStaticMarkup(createElement(WebAvailabilityProvider, {available},
      createElement(ResourceManagementWorkspace, {
        id: "fixture-resource", title: "Yerel kayıtlar", subtitle: "Kapasite ve fiyat", publishChecked: true,
        publishAriaLabel: "Web yayını", onPublishChange: () => assert.fail("visibility must not mutate publication"),
        actions: createElement("button", null, "Kayıt ekle"), media: createElement(SiteMedia)
      }, createElement("input", {"aria-label": "Yerel kapasite", defaultValue: "4"}))));
    assert.equal(resource.includes("resource-management-publication-toggle"), available);
    assert.equal(resource.includes("resource-management-media-pane"), available);
    assert.equal(resource.includes("is-local-only"), !available);
    assert.equal(mediaRenders, available ? 1 : 0, "hidden media never mounts or loads");
    assert.match(resource, /Yerel kapasite/);
    assert.match(resource, /Kayıt ekle/);
    const features = projectDesktopWorkspaceFeatures(snapshot, available);
    assert.equal(features.requests, available);
    assert.equal(features.qrMenu, available);
    for (const value of [features.customers, features.food.menu, features.food.orders, features.food.reservations,
      features.accommodation.reservations, features.wholesale, features.ai, features.android]) assert.equal(value, true, "local workflow preserved");
    for (const section of [dealerPortalDefinition, onlineSalesDeliveryDefinition]) {
      assert.equal(isSettingsSectionVisible(section, snapshot.enabledCapabilities, true, snapshot, available), available);
      assert.equal(searchSettings(section.title, snapshot.enabledCapabilities, true, snapshot, available).some(s => s.id === section.id), available);
    }
    for (const term of ["qr", "talepler", "online satış"]) {
      assert.equal(searchSettings(term, snapshot.enabledCapabilities, true, snapshot, available).some(s => s.id === "settings-options"), available);
    }
    for (const term of ["oda", "masa", "bayi", "stok"]) {
      assert.ok(searchSettings(term, snapshot.enabledCapabilities, true, snapshot, available).some(s => s.id === "settings-options"));
    }
    for (const profileId of ["restaurant", "market", "pension"]) {
      const selected = [...getBusinessProfile(profileId).optionalCapabilities];
      const selectedBefore = JSON.stringify(selected);
      const html = renderToStaticMarkup(createElement(WebAvailabilityProvider, {available},
        createElement(BusinessProfileOptionEditor, {profileId, selectedCapabilities: selected, onChange: () => assert.fail("projection must not mutate selections")})));
      for (const [capability, label] of [[C.REQUESTS, "Talepler"], [C.QR_MENU, "QR Menü"], [C.ONLINE_SALES, "Online Satış"]]) {
        if (selected.includes(capability)) assert.equal(html.includes(`aria-label="${label}"`), available, `${profileId}: ${label}`);
      }
      assert.equal(JSON.stringify(selected), selectedBefore, "hidden checked selections remain intact");
      if (profileId === "market") assert.match(html, /aria-label="Bayi \/ Toptan Satış"[^>]*checked/, "wholesale remains checked");
    }
  }
  assert.equal(JSON.stringify(snapshot), before, "presentation never rewrites persisted capabilities");
  console.log("web-availability-contract-ok: saved connection, manual sync, options/search/services, public profile/gallery search, resource publication/media visibility, local controls, selection preservation");
}
