#!/usr/bin/env node
// Retained registry name: consumer devices are managed through HTTPS QR, never ADB repair.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';

const repo = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { BUSINESS_CAPABILITIES: C } = require('@yardimci-asistan/shared');
const capabilities = [C.ANDROID, C.FOOD_ORDERS, C.FOOD_TABLES];
const device = {
  deviceId: 'android-device-test123', deviceName: 'Test Phone', role: 'staff',
  isActive: true, revokedAt: '', permissionGroups: { service_orders: true },
  lastSeenAt: '', appVersion: 'fixture', permissions: []
};
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
} }).outputText;

// Run the actual IPC/preload with no hosting dependency, network, phone or database writes.
const handlers = new Map(), gates = [], mutations = [];
let locked = false, allowed = true, bridge;
const electron = {
  ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
  ipcRenderer: { invoke: async name => name },
  contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }
};
const ipc = {};
runInNewContext(compile(join(repo, 'apps/desktop-app/electron/ipc/android-device-ipc.ts')), {
  exports: ipc, require: name => name === 'electron' ? electron : require(name)
});
ipc.registerAndroidDeviceIpcHandlers({
  assertUnlocked: () => { gates.push('lock'); if (locked) throw new Error('locked'); },
  assertCapability: capability => { gates.push(capability); if (!allowed) throw new Error('disabled'); },
  getDatabase: () => ({
    getSetupData: () => ({ localNetworkEnabled: true, webModuleUrl: '', syncSecret: '' }),
    setAndroidDeviceRole: (...args) => { mutations.push(args); return { ok: true, devices: [device] }; }
  }),
  isTrustedRendererUrl: url => url === 'file:///desktop/index.html',
  prepareLocalPairing: async () => {},
  getLocalPairingEndpoint: () => 'https://192.168.1.2:47831',
  getLocalPairingSpkiSha256: () => 'A'.repeat(43),
  getLocalPairingService: () => ({ cancel() {}, begin: () => ({ desktopId: 'fixture', credential: 'fixture-only' }) }),
  finalizeDeviceMutation: value => value
});
runInNewContext(compile(join(repo, 'apps/desktop-app/electron/preload.ts')), {
  exports: {}, require: name => name === 'electron' ? electron : require(name)
});
for (const name of ['androidDevice:listInstallDevices', 'androidDevice:install', 'androidDevice:provision']) {
  assert.equal(handlers.has(name), false, `Retired IPC must be absent: ${name}`);
}
for (const name of ['listAndroidInstallDevices', 'installAndroidApp', 'provisionAndroidApp']) {
  assert.equal(name in bridge, false, `Retired preload API must be absent: ${name}`);
}
assert.equal(await bridge.pushAndroidSnapshot(), 'sync:pushAndroidSnapshot', 'Ordinary Web publication remains available');
const frame = { url: 'file:///desktop/index.html' }, event = { senderFrame: frame, sender: { mainFrame: frame } };
assert.equal((await handlers.get('androidDevice:beginLocalPairing')(event)).endpoint, 'https://192.168.1.2:47831', 'QR pairing works with Web unconfigured');
gates.length = 0;
handlers.get('androidDevice:setRole')({}, device.deviceId, 'admin');
assert.deepEqual(gates, ['lock', C.ANDROID], 'Management lock/capability order remains authoritative');
assert.deepEqual(mutations, [[device.deviceId, 'admin']]);
locked = true;
assert.throws(() => handlers.get('androidDevice:setRole')({}, device.deviceId, 'admin'), /locked/);
locked = false; allowed = false;
assert.throws(() => handlers.get('androidDevice:setRole')({}, device.deviceId, 'admin'), /disabled/);
assert.equal(mutations.length, 1, 'Denied management cannot mutate');

// Render the real components without a browser so sandbox restrictions do not hide the UI contract.
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  runInNewContext(compile(file), { exports, require: name => {
    if (!name.startsWith('.')) return require(name);
    const stem = resolve(dirname(file), name);
    const target = [stem, `${stem}.ts`, `${stem}.tsx`].find(path => existsSync(path));
    assert.ok(target, `Missing renderer dependency: ${name}`);
    return load(target);
  } });
  return exports;
}
const { AndroidDevicesSection } = load(join(repo, 'apps/desktop-app/src/components/settings/AndroidDevicesSection.tsx'));
const { LocalCompanionPairingPanel } = load(join(repo, 'apps/desktop-app/src/components/settings/LocalCompanionPairingPanel.tsx'));
const props = { devices: [device], enabledCapabilities: capabilities, state: 'idle', onRefresh() {} };
for (const devices of [[device], [{ ...device, isActive: false }], [{ ...device, revokedAt: '2026-10-28T10:00:00Z' }], [],
  [device, { ...device, deviceId: 'second-phone' }]]) {
  const html = renderToStaticMarkup(createElement(AndroidDevicesSection, { ...props, devices }));
  assert.doesNotMatch(html, /USB hata ayıklaması|Uygulamayı Kur|Kurulumu Tamamla|Yeniden eşleştirme gerekli|Yeniden Eşleştir/);
  assert.match(html, /Bilinmeyen uygulamaları yükle/);
  assert.match(html, /Web bağlantısı isteğe bağlıdır/);
  assert.equal((html.match(/class="android-device-card/g) ?? []).length, devices.filter(d => !d.revokedAt).length,
    'Exactly one row per canonical registered device, even with identical names');
}
const html = renderToStaticMarkup(createElement(AndroidDevicesSection, props));
for (const text of ['Görev alanları', 'Yönetici Yap', 'Aktif', 'Pasifleştir', 'Kaldır', 'Yenile']) assert.ok(html.includes(text), text);
assert.match(renderToStaticMarkup(createElement(LocalCompanionPairingPanel, { disabled: false })), /Telefon eşleştir · QR göster/);
console.log('android-auto-repair-contracts: PASS (retired ADB, Web-optional QR, canonical devices, management gates)');
if (process.argv.includes('--contracts-only')) process.exit(0);

const source = `
import React from '${repo}/node_modules/react/index.js';
import {createRoot} from '${repo}/node_modules/react-dom/client.js';
import {AndroidDevicesSection} from '${repo}/apps/desktop-app/src/components/settings/AndroidDevicesSection.tsx';
import {LocalCompanionPairingPanel} from '${repo}/apps/desktop-app/src/components/settings/LocalCompanionPairingPanel.tsx';
import {useDeviceController} from '${repo}/apps/desktop-app/src/app/use-device-controller.ts';
window.legacyCalls=[]; window.refreshCalls=0; window.managementCalls=[];
window.yardimciDesktop={};
for(const name of ['listAndroidInstallDevices','installAndroidApp','provisionAndroidApp']) {
  Object.defineProperty(window.yardimciDesktop,name,{get(){window.legacyCalls.push(name);throw Error('Retired ADB bridge');}});
}
function Fixture({devices,operationsEnabled}) {
  useDeviceController({setDashboardData:()=>{},androidEnabled:operationsEnabled});
  return React.createElement(React.Fragment,null,
    React.createElement(LocalCompanionPairingPanel,{disabled:!operationsEnabled}),
    React.createElement(AndroidDevicesSection,{
      devices,operationsEnabled,enabledCapabilities:${JSON.stringify(capabilities)},state:'idle',
      onRefresh:()=>window.refreshCalls++,onSetRole:(...args)=>window.managementCalls.push(args),
      onPermissionGroupsChange:(...args)=>window.managementCalls.push(args),onSetActive:(...args)=>window.managementCalls.push(args)
    }));
}
const root=createRoot(document.querySelector('#app'));
window.renderCase=(devices,operationsEnabled=true)=>root.render(React.createElement(Fixture,{devices,operationsEnabled}));
`;
const temporary = mkdtempSync(join(tmpdir(), 'ya-android-repair-'));
let browser;
try {
  const entry = join(temporary, 'entry.tsx');
  writeFileSync(entry, source, 'utf8');
  await build({
    configFile: false, root: repo, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    build: { outDir: temporary, emptyOutDir: false, minify: false,
      lib: { entry, formats: ['iife'], name: 'AndroidRepairSmoke', fileName: 'bundle.js' } }
  });
  browser = await launchChromiumForSmoke(chromium);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setContent('<html><div id="app"></div></html>');
  const bundled = readdirSync(temporary).find(name => name.endsWith('.js'));
  assert.ok(bundled, 'Vite must create an IIFE script');
  await page.addScriptTag({ content: readFileSync(join(temporary, bundled), 'utf8') });
  await page.evaluate(value => window.renderCase([value]), device);
  await expect(page.getByText('Test Phone', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Telefon eşleştir · QR göster' })).toBeEnabled();
  await page.getByRole('button', { name: 'Yönetici Yap' }).click();
  // The fixture records the change without updating its controlled value.
  await page.getByRole('checkbox', { name: /Servis \/ Sipariş/ }).click();
  await page.getByRole('button', { name: 'Pasifleştir' }).click();
  assert.equal((await page.evaluate(() => window.managementCalls)).length, 3);
  await page.getByRole('button', { name: 'Yenile', exact: true }).click();
  assert.equal(await page.evaluate(() => window.refreshCalls), 1, 'Refresh remains explicit');
  for (const devices of [[device], [{ ...device, isActive: false }], [{ ...device, revokedAt: '2026-10-28T10:00:00Z' }], [],
    [device, { ...device, deviceId: 'second-phone' }]]) {
    await page.evaluate(value => window.renderCase(value), devices);
    await expect(page.locator('.android-device-card')).toHaveCount(devices.filter(d => !d.revokedAt).length);
    await expect(page.getByText(/USB hata ayıklaması|Uygulamayı Kur|Kurulumu Tamamla|Yeniden eşleştirme gerekli|Yeniden Eşleştir/)).toHaveCount(0);
  }
  await page.evaluate(value => window.renderCase([value], false), device);
  await expect(page.getByRole('button', { name: 'Yönetici Yap' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Telefon eşleştir · QR göster' })).toBeDisabled();
  // Give mount effects time to run; re-renders must never access a retired bridge.
  await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(() => window.legacyCalls), []);
  assert.equal(await page.evaluate(() => window.refreshCalls), 1, 'No automatic refresh effect');
  assert.deepEqual(errors, []);
  console.log('android-auto-repair-ui: PASS (no consumer ADB; QR, roles, permissions, refresh retained)');
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
}
