export type StatusKind = "ready" | "warning" | "error" | "unknown" | "unconfigured";

export type RepoSnapshot = {
  branch: string;
  head: string;
  dirtyCount: number;
  ahead: number | null;
  behind: number | null;
};

export type ProductSnapshot = {
  version: string;
  androidVersionCode: number;
  webModuleVersion: string;
};

export type CredentialStatus = "configured" | "unconfigured" | "unreadable";

export type HealthCheckSnapshot = {
  id: string;
  label: string;
  status: StatusKind;
  detail: string;
  durationMs: number | null;
};

export type InstallationSnapshot = {
  id: string;
  title: string;
  kind: string;
  siteUrl: string | null;
  webModuleUrl: string | null;
  versionEndpoint: string | null;
  credentialRef: string | null;
  credentialStatus: CredentialStatus;
  expectedWebVersion: string | null;
  liveWebVersion: string | null;
  deployType: string | null;
  deployHost: string | null;
  deployTarget: string | null;
  status: StatusKind;
  statusNote: string;
  healthChecks: HealthCheckSnapshot[];
};

export type ReleaseChannelSnapshot = {
  id: string;
  label: string;
  manifestUrl: string;
  liveVersion: string | null;
  status: StatusKind;
  detail: string;
  durationMs: number | null;
};

export type ReleaseSnapshot = {
  expectedVersion: string;
  desktop: ReleaseChannelSnapshot[];
};

export type VerificationCheckSnapshot = {
  id: string;
  label: string;
  phase: number;
  presets: string[];
  domains: string[];
  requires: string[];
  manual: boolean;
  platforms: string[] | null;
};

export type VerificationResultSnapshot = {
  id: string;
  label: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  exitCode: number | null;
  reason: string;
};

export type VerificationReportSnapshot = {
  available: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  result: "passed" | "failed" | "running" | "unknown";
  selectionLabel: string;
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  ageMs: number | null;
  checks: VerificationResultSnapshot[];
};

export type VerificationSnapshot = {
  presets: string[];
  domains: string[];
  planCounts: Record<string, number>;
  plans: Record<string, string[]>;
  checks: VerificationCheckSnapshot[];
  latest: VerificationReportSnapshot;
};

export type VerificationHistoryItem = {
  id: string;
  selectionLabel: string;
  startedAt: string;
  finishedAt: string;
  result: "passed" | "failed" | "cancelled";
  branch: string;
  head: string;
  dirtyCount: number;
};

export type VerificationRunRequest = {
  mode: "preset" | "domain" | "check";
  value: string;
  includeManual?: boolean;
};

export type VerificationRunState = {
  running: boolean;
  selectionLabel: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: "idle" | "running" | "passed" | "failed" | "cancelled";
  exitCode: number | null;
  outputTail: string[];
};

export type DeploymentTargetSnapshot = {
  id: string;
  installationId: string;
  title: string;
  description: string;
  confirmText: string;
  impact: string[];
  available: boolean;
  availabilityNote: string;
};

export type DeploymentRunRequest = {
  targetId: string;
  action: "preflight" | "deploy";
};

export type DeploymentRunState = {
  running: boolean;
  targetId: string;
  action: "preflight" | "deploy" | "";
  stage: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: "idle" | "running" | "passed" | "failed" | "cancelled";
  exitCode: number | null;
  outputTail: string[];
};

export type ReleaseOperationRequest = {
  action: "package" | "preview" | "publish";
};

export type ReleaseOperationState = {
  running: boolean;
  action: "package" | "preview" | "publish" | "";
  stage: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: "idle" | "running" | "passed" | "failed" | "cancelled";
  exitCode: number | null;
  outputTail: string[];
};

export type SupportReportStatus = "new" | "reviewing" | "resolved";

export type SupportReportListItem = {
  reportId: string;
  receivedAt: string;
  status: SupportReportStatus;
  appVersion: string;
  platform: string;
  arch: string;
  sessionCount: number;
  eventCount: number;
  warnCount: number;
  errorCount: number;
  abruptSessionCount: number;
  screenshotBytes: number;
  notePresent: boolean;
  clientHash: string;
  resolvedInVersion: string;
  resolutionNote: string;
};

export type SupportEventSummary = {
  timestamp: string;
  level: string;
  scope: string;
  event: string;
  message: string;
  errorMessage: string;
};

export type SupportReportDetail = {
  meta: SupportReportListItem;
  note: string;
  app: Record<string, string>;
  screenshotDataUrl: string | null;
  recent: SupportEventSummary[];
};

export type SystemToolSnapshot = {
  id: string;
  label: string;
  available: boolean;
  detail: string;
};

export type SystemCredentialSnapshot = {
  ref: string;
  status: CredentialStatus;
  usedBy: string[];
};

export type AndroidDeviceSnapshot = {
  serial: string;
  state: string;
  model: string;
  device: string;
};

export type SystemEnvironmentSnapshot = {
  checkedAt: string;
  repoRoot: string;
  blackSeaRoot: string | null;
  tools: SystemToolSnapshot[];
  credentials: SystemCredentialSnapshot[];
  androidDevices: AndroidDeviceSnapshot[];
};

export type DependencyUpdateItem = {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  dependent: string;
  location: string;
  type: string;
  homepage: string | null;
  majorUpdate: boolean;
};

export type DependencyUpdateReport = {
  checkedAt: string;
  status: "current" | "updates" | "error";
  nodeVersion: string;
  packageManager: string;
  count: number;
  majorCount: number;
  message: string;
  items: DependencyUpdateItem[];
};

export type OverviewSnapshot = {
  generatedAt: string;
  repo: RepoSnapshot;
  product: ProductSnapshot;
  installations: InstallationSnapshot[];
  release: ReleaseSnapshot;
  verification: VerificationSnapshot;
  counts: {
    installations: number;
    healthy: number;
    drift: number;
    errors: number;
  };
};

export type AdminBridge = {
  getOverview(): Promise<OverviewSnapshot>;
  checkDependencyUpdates(): Promise<DependencyUpdateReport>;
  getVerificationRunState(): Promise<VerificationRunState>;
  getVerificationHistory(limit?: number): Promise<VerificationHistoryItem[]>;
  startVerification(request: VerificationRunRequest): Promise<{ accepted: boolean; message: string }>;
  cancelVerification(): Promise<boolean>;
  onVerificationRunState(listener: (state: VerificationRunState) => void): () => void;
  getDeploymentTargets(): Promise<DeploymentTargetSnapshot[]>;
  getDeploymentRunState(): Promise<DeploymentRunState>;
  startDeployment(request: DeploymentRunRequest): Promise<{ accepted: boolean; message: string }>;
  cancelDeployment(): Promise<boolean>;
  onDeploymentRunState(listener: (state: DeploymentRunState) => void): () => void;
  getReleaseOperationState(): Promise<ReleaseOperationState>;
  startReleaseOperation(request: ReleaseOperationRequest): Promise<{ accepted: boolean; message: string }>;
  cancelReleaseOperation(): Promise<boolean>;
  onReleaseOperationState(listener: (state: ReleaseOperationState) => void): () => void;
  getSystemEnvironment(): Promise<SystemEnvironmentSnapshot>;
  listSupportReports(limit?: number): Promise<SupportReportListItem[]>;
  getSupportReportDetail(reportId: string, refresh?: boolean): Promise<SupportReportDetail>;
  updateSupportReportStatus(
    reportId: string,
    status: SupportReportStatus,
    resolvedInVersion?: string,
    resolutionNote?: string
  ): Promise<SupportReportListItem>;
  openExternal(url: string): Promise<boolean>;
};
