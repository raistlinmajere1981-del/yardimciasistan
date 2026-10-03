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
  openExternal(url: string): Promise<boolean>;
};
