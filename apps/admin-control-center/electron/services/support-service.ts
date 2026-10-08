import { gunzipSync } from "node:zlib";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type {
  SupportEventSummary,
  SupportReportDetail,
  SupportReportListItem,
  SupportReportStatus
} from "../../shared/contracts";

const REPORT_ID_PATTERN = /^YA-\d{6}-\d{6}-[A-F0-9]{6}$/;
const REMOTE_PATH_PATTERN = /^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/;
const HOST_PATTERN = /^[A-Za-z0-9._@-]+$/;

type SupportMeta = {
  report_id?: unknown;
  received_at?: unknown;
  status?: unknown;
  app_version?: unknown;
  platform?: unknown;
  arch?: unknown;
  session_count?: unknown;
  event_count?: unknown;
  warn_count?: unknown;
  error_count?: unknown;
  abrupt_session_count?: unknown;
  screenshot_bytes?: unknown;
  note_present?: unknown;
  client_hash?: unknown;
  resolved_in_version?: unknown;
  resolution_note?: unknown;
  reviewing_at?: unknown;
  resolved_at?: unknown;
  [key: string]: unknown;
};

type SupportBundle = {
  format?: unknown;
  version?: unknown;
  note?: unknown;
  app?: Record<string, unknown>;
  screenshot?: {
    mimeType?: unknown;
    base64?: unknown;
  } | null;
  sessions?: Array<{
    session?: Record<string, unknown>;
    events?: Array<{
      timestamp?: unknown;
      level?: unknown;
      scope?: unknown;
      event?: unknown;
      message?: unknown;
      error?: {
        message?: unknown;
      } | null;
    }>;
  }>;
};

type Registry = {
  installations?: Record<string, {
    credentialRef?: string;
    deploy?: {
      host?: string;
      storageRoot?: string;
    };
  }>;
};

type Credentials = {
  credentials?: Record<string, {
    sshIdentityFile?: unknown;
  }>;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown): SupportReportStatus {
  if (value === "reviewing" || value === "resolved") return value;
  return "new";
}

function normalizeMeta(meta: SupportMeta): SupportReportListItem {
  return {
    reportId: textValue(meta.report_id),
    receivedAt: textValue(meta.received_at),
    status: normalizeStatus(meta.status),
    appVersion: textValue(meta.app_version),
    platform: textValue(meta.platform),
    arch: textValue(meta.arch),
    sessionCount: numberValue(meta.session_count),
    eventCount: numberValue(meta.event_count),
    warnCount: numberValue(meta.warn_count),
    errorCount: numberValue(meta.error_count),
    abruptSessionCount: numberValue(meta.abrupt_session_count),
    screenshotBytes: numberValue(meta.screenshot_bytes),
    notePresent: meta.note_present === true,
    clientHash: textValue(meta.client_hash),
    resolvedInVersion: textValue(meta.resolved_in_version),
    resolutionNote: textValue(meta.resolution_note)
  };
}

function assertReportId(reportId: string) {
  if (!REPORT_ID_PATTERN.test(reportId)) throw new Error("Geçersiz destek raporu kimliği.");
  return reportId;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function supportConfig(repoRoot: string) {
  const registry = readJson<Registry>(join(repoRoot, "config", "installations.json"));
  const support = registry.installations?.support;
  const host = textValue(support?.deploy?.host);
  const remoteRoot = textValue(support?.deploy?.storageRoot);

  if (!HOST_PATTERN.test(host)) throw new Error("Destek SSH hedefi geçersiz.");
  if (!REMOTE_PATH_PATTERN.test(remoteRoot)) throw new Error("Destek storage yolu geçersiz.");

  let identityFile = "";
  const credentialRef = textValue(support?.credentialRef);
  const credentialPath = join(repoRoot, "config", "credentials.local.json");

  if (credentialRef && existsSync(credentialPath)) {
    try {
      const credentials = readJson<Credentials>(credentialPath);
      identityFile = textValue(credentials.credentials?.[credentialRef]?.sshIdentityFile);
    } catch {
      identityFile = "";
    }
  }

  return { host, remoteRoot, identityFile };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 30000
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: error.message });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function sshBaseArgs(identityFile: string) {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=15",
    ...(identityFile ? ["-i", identityFile] : [])
  ];
}

function remoteReportPath(remoteRoot: string, reportId: string, file: string) {
  return `${remoteRoot}/${assertReportId(reportId)}/${file}`;
}

async function sshCapture(repoRoot: string, remoteCommand: string, timeoutMs = 30000) {
  const config = supportConfig(repoRoot);
  const result = await runCommand(
    "ssh",
    [...sshBaseArgs(config.identityFile), config.host, remoteCommand],
    repoRoot,
    timeoutMs
  );
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Destek sunucusuna bağlanılamadı.");
  }
  return result.stdout;
}

export async function listSupportReports(
  repoRoot: string,
  limit = 80
): Promise<SupportReportListItem[]> {
  const config = supportConfig(repoRoot);
  const delimiter = "__YA_SUPPORT_META_END__";
  const remoteCommand = [
    `find ${config.remoteRoot} -mindepth 2 -maxdepth 2 -type f -name meta.json -print 2>/dev/null |`,
    "while IFS= read -r f; do",
    'cat "$f";',
    `printf '\\n${delimiter}\\n';`,
    "done"
  ].join(" ");

  const stdout = await sshCapture(repoRoot, remoteCommand, 40000);
  return stdout
    .split(delimiter)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      try {
        const parsed = JSON.parse(block) as SupportMeta;
        const normalized = normalizeMeta(parsed);
        return REPORT_ID_PATTERN.test(normalized.reportId) ? [normalized] : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    .slice(0, Math.max(1, Math.min(250, Number(limit) || 80)));
}

async function readRemoteMeta(repoRoot: string, reportId: string) {
  const config = supportConfig(repoRoot);
  const raw = await sshCapture(
    repoRoot,
    `cat ${remoteReportPath(config.remoteRoot, reportId, "meta.json")}`
  );
  const parsed = JSON.parse(raw) as SupportMeta;
  if (textValue(parsed.report_id) !== reportId) throw new Error("Rapor kimliği uyuşmuyor.");
  return parsed;
}

async function downloadBundle(repoRoot: string, reportId: string) {
  const config = supportConfig(repoRoot);
  const cacheRoot = join(tmpdir(), "yardimci-asistan-admin", "support");
  mkdirSync(cacheRoot, { recursive: true });

  const dir = join(cacheRoot, assertReportId(reportId));
  mkdirSync(dir, { recursive: true });
  const archivePath = join(dir, "report.json.gz");

  const source = `${config.host}:${remoteReportPath(config.remoteRoot, reportId, "report.json.gz")}`;
  const result = await runCommand(
    "scp",
    ["-q", ...sshBaseArgs(config.identityFile), source, archivePath],
    repoRoot,
    45000
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "Destek raporu indirilemedi.");
  }

  chmodSync(archivePath, 0o600);
  const bundle = JSON.parse(
    gunzipSync(readFileSync(archivePath)).toString("utf8")
  ) as SupportBundle;

  if (bundle.format !== "yardimci-asistan-support-report" || bundle.version !== 1) {
    throw new Error("Destek raporu biçimi tanınmıyor.");
  }

  return bundle;
}

function supportEvents(bundle: SupportBundle): SupportEventSummary[] {
  const events = (Array.isArray(bundle.sessions) ? bundle.sessions : [])
    .flatMap((session) => Array.isArray(session.events) ? session.events : [])
    .filter((event) => event.level === "WARN" || event.level === "ERROR")
    .sort((left, right) => textValue(right.timestamp).localeCompare(textValue(left.timestamp)))
    .slice(0, 20);

  return events.map((event) => ({
    timestamp: textValue(event.timestamp),
    level: textValue(event.level),
    scope: textValue(event.scope),
    event: textValue(event.event),
    message: textValue(event.message).slice(0, 1600),
    errorMessage: textValue(event.error?.message).slice(0, 1600)
  }));
}

function appSnapshot(value: SupportBundle["app"]) {
  const result: Record<string, string> = {};
  if (!value || typeof value !== "object") return result;

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      result[key] = String(item);
    }
  }
  return result;
}

export async function getSupportReportDetail(
  repoRoot: string,
  reportId: string
): Promise<SupportReportDetail> {
  assertReportId(reportId);
  const [meta, bundle] = await Promise.all([
    readRemoteMeta(repoRoot, reportId),
    downloadBundle(repoRoot, reportId)
  ]);

  const base64 = textValue(bundle.screenshot?.base64);
  const screenshotDataUrl = base64
    ? `data:image/png;base64,${base64}`
    : null;

  return {
    meta: normalizeMeta(meta),
    note: textValue(bundle.note),
    app: appSnapshot(bundle.app),
    screenshotDataUrl,
    recent: supportEvents(bundle)
  };
}

export async function updateSupportReportStatus(
  repoRoot: string,
  reportId: string,
  status: SupportReportStatus,
  resolvedInVersion = "",
  resolutionNote = ""
): Promise<SupportReportListItem> {
  assertReportId(reportId);
  if (!["new", "reviewing", "resolved"].includes(status)) {
    throw new Error("Geçersiz destek raporu durumu.");
  }

  const config = supportConfig(repoRoot);
  const meta = await readRemoteMeta(repoRoot, reportId);
  const now = new Date().toISOString();

  delete meta.reviewing_at;
  delete meta.resolved_at;
  delete meta.resolved_in_version;
  delete meta.resolution_note;

  meta.status = status;
  if (status === "reviewing") meta.reviewing_at = now;
  if (status === "resolved") {
    meta.resolved_at = now;
    meta.resolved_in_version = String(resolvedInVersion).trim().slice(0, 80);
    meta.resolution_note = String(resolutionNote).trim().slice(0, 2000);
  }

  const tempDir = mkdtempSync(join(tmpdir(), "ya-admin-support-"));
  const localMeta = join(tempDir, "meta.json");
  writeFileSync(localMeta, JSON.stringify(meta, null, 2) + "\n", { mode: 0o600 });

  try {
    const remoteTemp = remoteReportPath(config.remoteRoot, reportId, ".meta.admin.tmp");
    const upload = await runCommand(
      "scp",
      ["-q", ...sshBaseArgs(config.identityFile), localMeta, `${config.host}:${remoteTemp}`],
      repoRoot,
      30000
    );
    if (upload.code !== 0) {
      throw new Error(upload.stderr.trim() || "Rapor durumu yüklenemedi.");
    }

    await sshCapture(
      repoRoot,
      `chmod 600 ${remoteTemp} && mv ${remoteTemp} ${remoteReportPath(config.remoteRoot, reportId, "meta.json")}`
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }

  return normalizeMeta(meta);
}
