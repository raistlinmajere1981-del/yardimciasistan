#!/usr/bin/env node
// UI contract for automatic re-pair on the exact known USB Android device.
// Uses a mocked snapshot; never touches a real phone, token or database.
import { build } from 'vite';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { launchChromiumForSmoke } from './test-helpers/playwright-browser.mjs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const repo = resolve(import.meta.dirname, '..');
const source = `
import React from '${repo}/node_modules/react/index.js';
import {createRoot} from '${repo}/node_modules/react-dom/client.js';
import {AndroidDevicesSection} from '${repo}/apps/desktop-app/src/components/settings/AndroidDevicesSection.tsx';
const root=createRoot(document.querySelector('#app'));
window.autoCalls=[];
window.renderCase=(cred, actualId='android-device-test123', active=true, operationsEnabled=true)=>{
  root.render(React.createElement(AndroidDevicesSection,{
    devices: [{deviceId:'android-device-test123',deviceName:'Test Phone',role:'admin',isActive:active,revokedAt:'',permissionGroups:{}}],
    operationsEnabled, enabledCapabilities:[], state:'idle', installState:'success',
    installSnapshot:{ok:true,adbAvailable:true,apkAvailable:true,devices:[{
      serial:'testserial',deviceId:actualId,model:'Test Phone',state:'device',
      appInstalled:true,credentialState:cred,action:'current',installedVersionName:'2.0.8-debug',
      installedVersionCode:8,bundledVersionCode:8,bundledVersionName:'2.0.8-debug',message:'Installed'
    }]},
    onProvisionApp:(serial)=>window.autoCalls.push(serial),
    onRefreshInstallDevices:()=>{}
  }));
};
`;
const temporary = mkdtempSync(join(tmpdir(),'ya-android-repair-'));
const entry = join(temporary,'entry.tsx');
writeFileSync(entry,source,'utf8');
await build({
  configFile:false,root:repo,logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},
  build:{outDir:temporary,emptyOutDir:false,minify:false,
    lib:{entry,formats:['iife'],name:'AndroidRepairSmoke',fileName:'bundle.js'}}
});
const browser=await launchChromiumForSmoke(chromium);
try {
  const page=await browser.newPage();
  page.on('pageerror',error=>console.log('BROWSER_ERROR',String(error).slice(0,400)));
  await page.setContent('<html><div id="app"></div></html>');
  const bundled = readdirSync(temporary).find(name=>name.endsWith('.js'));
  assert.ok(bundled,'Vite must create an IIFE script');
  await page.addScriptTag({content:readFileSync(join(temporary,bundled),'utf8')});
  const check=async (state,id,active,expected,label)=>{
    await page.evaluate(([s,i,a])=>window.renderCase(s,i,a),[state,id,active]);
    await page.waitForTimeout(130);
    const calls=await page.evaluate(()=>window.autoCalls.length);
    assert.equal(calls,expected,label);
  };
  await page.evaluate(() => window.renderCase('missing', 'android-device-test123', true, false));
  await page.waitForTimeout(130);
  assert.equal(await page.evaluate(() => window.autoCalls.length), 0, 'pending activation never auto-provisions');
  assert.ok(await page.getByRole('button', { name: 'Yeniden Eşleştir' }).isDisabled(), 'pending activation disables explicit pairing');
  await check('missing','android-device-test123',true,1,'first clean install auto-provisions');
  await check('missing','android-device-test123',true,1,'rerender never duplicates a provisioning attempt');
  await check('present','android-device-test123',true,1,'healthy connection never rekeys');
  await check('missing','android-device-test123',true,2,'later reinstall can retry');
  await check('pending','android-device-test123',true,2,'pending claim is not interrupted');
  await check('unknown','android-device-test123',true,2,'opaque production credential is not guessed missing');
  await check('missing','android-device-different',true,2,'same phone model with another identity is never auto-paired');
  await check('missing','android-device-test123',false,2,'inactive device is never auto-paired');
  console.log('android-auto-repair-ui: 9/9 PASS');
} finally {
  await browser.close();
  rmSync(temporary,{recursive:true,force:true});
}
