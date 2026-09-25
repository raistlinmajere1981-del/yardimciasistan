import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const ipcMain = new EventEmitter();
  const sender = new EventEmitter();
  sender.mainFrame = {};
  sender.isDestroyed = () => false;
  let sent;
  sender.send = (...args) => { sent = args; };
  const exports = {};
  const source = ts.transpileModule(readFileSync('apps/desktop-app/electron/data-maintenance-confirmation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(source, {
    exports,
    require: name => name === 'electron' ? { ipcMain } : { randomUUID: () => 'request-1' }
  });
  const request = { title: 'Reset', description: 'Reset local data', details: 'Safety backup first', confirmLabel: 'Reset' };
  return { ipcMain, sender, request, confirm: exports.requestDataMaintenanceConfirmation,
    sent: () => sent };
}

test('maintenance confirmation accepts only its request, sender and main frame, then removes listeners', async () => {
  const f = fixture();
  let settled = false;
  const result = f.confirm(f.sender, f.request).then(value => { settled = true; return value; });
  assert.deepEqual(f.sent(), ['dataMaintenance:confirmationRequested', 'request-1', f.request]);
  for (const [event, id] of [
    [{ sender: {}, senderFrame: f.sender.mainFrame }, 'request-1'],
    [{ sender: f.sender, senderFrame: {} }, 'request-1'],
    [{ sender: f.sender, senderFrame: f.sender.mainFrame }, 'wrong-request']
  ]) f.ipcMain.emit('dataMaintenance:confirmationResponse', event, id, true);
  await Promise.resolve();
  assert.equal(settled, false);
  f.ipcMain.emit('dataMaintenance:confirmationResponse', { sender: f.sender, senderFrame: f.sender.mainFrame }, 'request-1', true);
  assert.equal(await result, true);
  assert.equal(f.ipcMain.listenerCount('dataMaintenance:confirmationResponse'), 0);
  assert.equal(f.sender.listenerCount('destroyed'), 0);
  assert.equal(f.sender.listenerCount('did-start-navigation'), 0);
});

for (const reason of ['destroyed', 'did-start-navigation', 'reject', 'invalid-response']) {
  test(`maintenance confirmation cancels safely on ${reason}`, async () => {
    const f = fixture();
    const result = f.confirm(f.sender, f.request);
    if (reason === 'reject' || reason === 'invalid-response') f.ipcMain.emit('dataMaintenance:confirmationResponse',
      { sender: f.sender, senderFrame: f.sender.mainFrame }, 'request-1', reason === 'reject' ? false : 'true');
    else f.sender.emit(reason);
    assert.equal(await result, false);
    assert.equal(f.ipcMain.listenerCount('dataMaintenance:confirmationResponse'), 0);
  });
}
