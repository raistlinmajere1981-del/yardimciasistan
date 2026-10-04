import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
const compiled = new URL('../apps/desktop-app/dist-electron/data-maintenance.js', import.meta.url), require = createRequire(compiled);
const { DesktopDatabase } = require('./database.js');
for (const kind of ['reset', 'restore', 'remote_failure', 'drain_failure', 'declined']) {
  const root = mkdtempSync(join(tmpdir(), 'campaign-maintenance-'));
  const db = new DesktopDatabase({ appPath: resolve('apps/desktop-app'), userDataPath: root }); db.initialize();
  const handlers = new Map(), exports = {}, events = []; let scheduled = false, resume = 0, release, enter;
  const entered = new Promise((done) => { enter = done; });
  const gate = new Promise((done) => { release = done; });
  runInNewContext(readFileSync(compiled, 'utf8'), { exports, Buffer, Error, process, setTimeout: () => { scheduled = true; return { unref() {} }; }, clearTimeout,
    require: (name) => name === 'electron' ? {
      app: { isPackaged: true, getAppPath: () => resolve('apps/desktop-app'), getVersion: () => 'fixture', relaunch() {}, quit() {} },
      ipcMain: { removeHandler() {}, handle: (name, action) => handlers.set(name, action) },
      session: { defaultSession: { clearStorageData: async () => { events.push('storage'); } } }, shell: {}
    } : name === './desktop-logger' ? { desktopLog: { info() {}, warn() {}, error() {} } }
      : name === './data-maintenance-confirmation' ? { requestDataMaintenanceConfirmation: async () => kind !== 'declined' } : require(name) });
  try {
    exports.registerDataMaintenanceIpcHandlers(() => root, {
      beforeMaintenance: async () => { events.push('drain'); enter(); await gate; if (kind === 'drain_failure') throw new Error('fixture drain failure'); },
      afterMaintenanceAbort: () => { resume++; events.push('resume'); },
      resetConnectedWebRuntime: async () => { events.push('remote'); return { ok: kind !== 'remote_failure', skipped: true, message: 'fixture' }; }
    });
    let backup;
    if (kind === 'restore') { backup = handlers.get('dataMaintenance:createBackup')(); assert.equal(backup.ok, true, backup.message); }
    const resultPromise = kind === 'restore' ? handlers.get('dataMaintenance:restoreBackup')({ sender: {} }, backup.backup.id)
      : handlers.get('dataMaintenance:resetLocalData')({ sender: {} });
    if (kind === 'declined') await resultPromise; else await entered;
    assert.equal(scheduled, false, 'no relaunch while an in-flight submission is draining');
    if (kind !== 'declined') assert.deepEqual(events, ['drain']);
    release(); const result = await resultPromise;
    if (['reset', 'restore'].includes(kind)) {
      assert.equal(result.ok, true, result.message); assert.equal(result.restartScheduled, true); assert.equal(scheduled, true); assert.equal(resume, 0);
      assert.equal(existsSync(join(root, 'maintenance', 'pending-data-maintenance.json')), true);
    } else {
      assert.equal(result.ok, false); assert.equal(scheduled, false); assert.equal(resume, kind === 'declined' ? 0 : 1);
      assert.equal(existsSync(join(root, 'maintenance', 'pending-data-maintenance.json')), false);
    }
    console.log(`PASS maintenance ${kind}: confirmed operation drains before backup/reset/restore; abort resumes`);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
}
// Composition wiring has Electron process-wide state; its behavior is exercised through the worker/maintenance contracts above.
const entry = readFileSync('apps/desktop-app/electron/main-entry.ts', 'utf8');
assert.ok(!entry.includes('mutableApp.quit ='), 'development relaunch must preserve normal before-quit drain');
assert.match(entry, /app\.on\("will-quit", \(event\) =>/);
console.log('Campaign shutdown/maintenance lifecycle contracts passed.');
