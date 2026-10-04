import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, resolve } from "node:path";
import { checkDependencyUpdates } from "./services/dependency-update-service";
import { DeploymentRunner, getDeploymentTargets } from "./services/deployment-runner";
import { getOverviewSnapshot } from "./services/overview-service";
import { VerificationRunner } from "./services/verification-runner";

const APP_ROOT = resolve(__dirname, "../..");
const REPO_ROOT = process.env.YARDIMCI_REPO_ROOT
  ? resolve(process.env.YARDIMCI_REPO_ROOT)
  : resolve(APP_ROOT, "../..");
const verificationRunner = new VerificationRunner(REPO_ROOT);
const deploymentRunner = new DeploymentRunner(REPO_ROOT);

verificationRunner.subscribe((state) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("admin:verification-run-state", state);
  }
});

deploymentRunner.subscribe((state) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("admin:deployment-run-state", state);
  }
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#eef6ff",
    title: "Yardımcı Asistan Admin",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.setMenuBarVisibility(false);
  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) void window.loadURL(devServer);
  else void window.loadFile(join(APP_ROOT, "dist-renderer", "index.html"));
}

ipcMain.handle("admin:get-overview", () => getOverviewSnapshot(REPO_ROOT));
ipcMain.handle("admin:check-dependency-updates", () => checkDependencyUpdates(REPO_ROOT));
ipcMain.handle("admin:get-verification-run-state", () => verificationRunner.getState());
ipcMain.handle("admin:start-verification", (_event, request) => verificationRunner.start(request));
ipcMain.handle("admin:cancel-verification", () => verificationRunner.cancel());
ipcMain.handle("admin:get-deployment-targets", () => getDeploymentTargets(REPO_ROOT));
ipcMain.handle("admin:get-deployment-run-state", () => deploymentRunner.getState());
ipcMain.handle("admin:start-deployment", (_event, request) => deploymentRunner.start(request));
ipcMain.handle("admin:cancel-deployment", () => deploymentRunner.cancel());
ipcMain.handle("admin:open-external", async (_event, value: unknown) => {
  const url = typeof value === "string" ? value.trim() : "";
  if (!/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
