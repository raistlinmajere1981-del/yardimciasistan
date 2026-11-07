// Isolated real Electron transport, canonical IPC/preload and disposable DB.
const { app, BrowserWindow, ipcMain } = require('electron');
const { resolve } = require('node:path');
app.setPath('userData', process.env.YA_CHECKOUT_TEST_PROFILE);
global.__checkoutTest = { locked: false, loseResponse: false };
app.whenReady().then(async () => {
  ipcMain.handle('appLock:getStatus', () => ({ locked: global.__checkoutTest.locked }));
  require(resolve('apps/desktop-app/dist-electron/commerce-ipc.js')).registerCommerceIpcHandlers({
    databasePath: () => process.env.YA_CHECKOUT_TEST_DATABASE,
    assertUnlocked() { if (global.__checkoutTest.locked) throw new Error('fixture locked'); },
    onMutation() {
      if (global.__checkoutTest.loseResponse) {
        global.__checkoutTest.loseResponse = false;
        throw new Error('simulated post-commit lost response');
      }
    }
  });
  const window = new BrowserWindow({ width: 1440, height: 1000, show: false,
    webPreferences: { preload: resolve('apps/desktop-app/dist-electron/preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  await window.loadURL('about:blank');
});
app.on('window-all-closed', () => app.quit());
