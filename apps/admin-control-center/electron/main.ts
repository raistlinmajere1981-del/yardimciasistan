import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join, resolve } from "node:path";
import { checkDependencyUpdates } from "./services/dependency-update-service";
import { DeploymentRunner, getDeploymentTargets } from "./services/deployment-runner";
import { getOverviewSnapshot } from "./services/overview-service";
import { ReleaseRunner } from "./services/release-runner";
import {
  getSupportReportDetail,
  listSupportReports,
  updateSupportReportStatus
} from "./services/support-service";
import { getSystemEnvironment } from "./services/system-environment-service";
import { listVerificationHistory, VerificationRunner } from "./services/verification-runner";

const APP_ROOT = resolve(__dirname, "../..");
const REPO_ROOT = process.env.YARDIMCI_REPO_ROOT
  ? resolve(process.env.YARDIMCI_REPO_ROOT)
  : resolve(APP_ROOT, "../..");
const verificationRunner = new VerificationRunner(REPO_ROOT);
const deploymentRunner = new DeploymentRunner(REPO_ROOT);
const releaseRunner = new ReleaseRunner(REPO_ROOT);

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

releaseRunner.subscribe((state) => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("admin:release-operation-state", state);
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
function busyOperationMessage(exclude: "verification" | "deployment" | "release") {
  const active = [
    exclude !== "verification" && verificationRunner.getState().running ? "doğrulama" : "",
    exclude !== "deployment" && deploymentRunner.getState().running ? "deploy" : "",
    exclude !== "release" && releaseRunner.getState().running ? "release" : ""
  ].find(Boolean);

  return active ? `Önce çalışan ${active} işlemini tamamlayın veya iptal edin.` : "";
}

ipcMain.handle("admin:get-verification-run-state", () => verificationRunner.getState());
ipcMain.handle("admin:get-verification-history", (_event, limit) => listVerificationHistory(REPO_ROOT, limit));
ipcMain.handle("admin:start-verification", (_event, request) => {
  const busy = busyOperationMessage("verification");
  return busy ? { accepted: false, message: busy } : verificationRunner.start(request);
});
ipcMain.handle("admin:cancel-verification", () => verificationRunner.cancel());
ipcMain.handle("admin:get-deployment-targets", () => getDeploymentTargets(REPO_ROOT));
ipcMain.handle("admin:get-deployment-run-state", () => deploymentRunner.getState());
ipcMain.handle("admin:start-deployment", (_event, request) => {
  const busy = busyOperationMessage("deployment");
  return busy ? { accepted: false, message: busy } : deploymentRunner.start(request);
});
ipcMain.handle("admin:cancel-deployment", () => deploymentRunner.cancel());
ipcMain.handle("admin:get-release-operation-state", () => releaseRunner.getState());
ipcMain.handle("admin:start-release-operation", (_event, request) => {
  const busy = busyOperationMessage("release");
  return busy ? { accepted: false, message: busy } : releaseRunner.start(request);
});
ipcMain.handle("admin:cancel-release-operation", () => releaseRunner.cancel());
ipcMain.handle("admin:get-system-environment", () => getSystemEnvironment(REPO_ROOT));
ipcMain.handle("admin:list-support-reports", (_event, limit) => listSupportReports(REPO_ROOT, limit));
ipcMain.handle("admin:get-support-report-detail", (_event, reportId) => getSupportReportDetail(REPO_ROOT, reportId));
ipcMain.handle(
  "admin:update-support-report-status",
  (_event, reportId, status, resolvedInVersion, resolutionNote) =>
    updateSupportReportStatus(REPO_ROOT, reportId, status, resolvedInVersion, resolutionNote)
);
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
}, (error) => {
  console.error("Admin uygulaması hazır hale gelemedi:", error);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
