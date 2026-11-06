import { contextBridge, ipcRenderer } from "electron";
import type { AdminBridge } from "../shared/contracts";

const bridge: AdminBridge = {
  listEffectProjects: () => ipcRenderer.invoke("admin:effects-projects"),
  loadEffectScene: (id) => ipcRenderer.invoke("admin:effects-load", id),
  saveEffectScene: (id, scene, sourceHash) => ipcRenderer.invoke("admin:effects-save", id, scene, sourceHash),
  publishEffectScene: (id) => ipcRenderer.invoke("admin:effects-publish", id),
  prepareEffectScene: (id) => ipcRenderer.invoke("admin:effects-prepare", id),
  preflightBirdesengorEffect: (id) => ipcRenderer.invoke("admin:effects-birdesengor-preflight", id),
  cancelBirdesengorEffect: () => ipcRenderer.invoke("admin:effects-birdesengor-cancel"),
  deployBirdesengorEffect: (id, token) => ipcRenderer.invoke("admin:effects-birdesengor-deploy", id, token),
  getOverview: () => ipcRenderer.invoke("admin:get-overview"),
  getInstallationCredentials: (installationId) => ipcRenderer.invoke("admin:get-installation-credentials", installationId),
  syncInstallationCredential: (installationId) => ipcRenderer.invoke("admin:sync-installation-credential", installationId),
  saveInstallationCredential: (installationId, field, value) =>
    ipcRenderer.invoke("admin:save-installation-credential", installationId, field, value),
  copyInstallationCredential: (installationId, field) =>
    ipcRenderer.invoke("admin:copy-installation-credential", installationId, field),
  checkDependencyUpdates: () => ipcRenderer.invoke("admin:check-dependency-updates"),
  getVerificationRunState: () => ipcRenderer.invoke("admin:get-verification-run-state"),
  getVerificationHistory: (limit) => ipcRenderer.invoke("admin:get-verification-history", limit),
  getVerificationCheckOutput: (checkId) => ipcRenderer.invoke("admin:get-verification-check-output", checkId),
  copyVerificationCheckOutput: (checkId) => ipcRenderer.invoke("admin:copy-verification-check-output", checkId),
  startVerification: (request) => ipcRenderer.invoke("admin:start-verification", request),
  cancelVerification: () => ipcRenderer.invoke("admin:cancel-verification"),
  onVerificationRunState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on("admin:verification-run-state", handler);
    return () => ipcRenderer.removeListener("admin:verification-run-state", handler);
  },
  getDeploymentTargets: () => ipcRenderer.invoke("admin:get-deployment-targets"),
  getDeploymentRunState: () => ipcRenderer.invoke("admin:get-deployment-run-state"),
  startDeployment: (request) => ipcRenderer.invoke("admin:start-deployment", request),
  cancelDeployment: () => ipcRenderer.invoke("admin:cancel-deployment"),
  onDeploymentRunState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on("admin:deployment-run-state", handler);
    return () => ipcRenderer.removeListener("admin:deployment-run-state", handler);
  },
  getReleaseOperationState: () => ipcRenderer.invoke("admin:get-release-operation-state"),
  startReleaseOperation: (request) => ipcRenderer.invoke("admin:start-release-operation", request),
  cancelReleaseOperation: () => ipcRenderer.invoke("admin:cancel-release-operation"),
  onReleaseOperationState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
    ipcRenderer.on("admin:release-operation-state", handler);
    return () => ipcRenderer.removeListener("admin:release-operation-state", handler);
  },
  getSystemEnvironment: () => ipcRenderer.invoke("admin:get-system-environment"),
  listSupportReports: (limit) => ipcRenderer.invoke("admin:list-support-reports", limit),
  getSupportReportDetail: (reportId) => ipcRenderer.invoke("admin:get-support-report-detail", reportId),
  updateSupportReportStatus: (reportId, status, resolvedInVersion, resolutionNote) =>
    ipcRenderer.invoke(
      "admin:update-support-report-status",
      reportId,
      status,
      resolvedInVersion,
      resolutionNote
    ),
  deleteSupportReport: (reportId) => ipcRenderer.invoke("admin:delete-support-report", reportId),
  openExternal: (url) => ipcRenderer.invoke("admin:open-external", url)
};

contextBridge.exposeInMainWorld("adminControlCenter", bridge);
