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

export type OverviewSnapshot = {
  generatedAt: string;
  repo: RepoSnapshot;
  product: ProductSnapshot;
  installations: InstallationSnapshot[];
  counts: {
    installations: number;
    healthy: number;
    drift: number;
    errors: number;
  };
};

export type AdminBridge = {
  getOverview(): Promise<OverviewSnapshot>;
  openExternal(url: string): Promise<boolean>;
};
