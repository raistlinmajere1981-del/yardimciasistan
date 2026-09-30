import { gunzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "./runners/exec.mjs";
import { HISTORY_DIR } from "./lib/paths.mjs";

const SUPPORT_HOST = process.env.YARDIMCI_ASISTAN_DEPLOY_HOST?.trim()
  || "yardimciasistan@ssh-yardimciasistan.alwaysdata.net";
const SUPPORT_REMOTE_ROOT = process.env.YARDIMCI_ASISTAN_SUPPORT_STORAGE_ROOT?.trim()
  || "/home/yardimciasistan/support-reports";
const SUPPORT_CACHE_ROOT = join(HISTORY_DIR, "support-reports");
const REPORT_ID_PATTERN = /^YA-\d{6}-\d{6}-[A-F0-9]{6}$/;

function assertRemoteRoot() {
  if (!/^\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/.test(SUPPORT_REMOTE_ROOT)) {
    throw new Error(`Güvenli olmayan destek raporu yolu: ${SUPPORT_REMOTE_ROOT}`);
  }
}

function assertReportId(reportId) {
  if (!REPORT_ID_PATTERN.test(String(reportId ?? ""))) {
    throw new Error("Geçersiz destek raporu kimliği.");
  }
  return String(reportId);
}

function sshArgs(remoteCommand) {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=15",
    SUPPORT_HOST,
    remoteCommand,
  ];
}

async function ssh(remoteCommand, timeoutMs = 20_000) {
  return runCommand({
    command: "ssh",
    args: sshArgs(remoteCommand),
    timeoutMs,
    mode: "capture",
  });
}

function reportRemotePath(reportId, fileName) {
  assertRemoteRoot();
  return `${SUPPORT_REMOTE_ROOT}/${assertReportId(reportId)}/${fileName}`;
}

export function supportReportsConnectionInfo() {
  return { host: SUPPORT_HOST, remoteRoot: SUPPORT_REMOTE_ROOT, cacheRoot: SUPPORT_CACHE_ROOT };
}

export async function listSupportReports(limit = 80) {
  assertRemoteRoot();
  const delimiter = "__YA_SUPPORT_META_END__";
  const remoteCommand = [
    "set -f;",
    `for f in ${SUPPORT_REMOTE_ROOT}/YA-*/meta.json; do`,
    '[ -f "$f" ] || continue;',
    'cat "$f";',
    `printf '\\n${delimiter}\\n';`,
    "done"
  ].join(" ");
  const result = await ssh(remoteCommand);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Destek raporları sunucudan listelenemedi.");
  }

  const reports = result.stdout
    .split(delimiter)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      try {
        const parsed = JSON.parse(block);
        if (!REPORT_ID_PATTERN.test(String(parsed.report_id ?? ""))) return [];
        return [parsed];
      } catch {
        return [];
      }
    })
    .sort((left, right) => String(right.received_at ?? "").localeCompare(String(left.received_at ?? "")))
    .slice(0, Math.max(1, Math.min(250, Number(limit) || 80)));
  return reports;
}

export async function readSupportReportMeta(reportId) {
  const result = await ssh(`cat ${reportRemotePath(reportId, "meta.json")}`);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "Rapor özeti okunamadı.");
  const parsed = JSON.parse(result.stdout);
  if (parsed.report_id !== reportId) throw new Error("Rapor özeti kimliği uyuşmuyor.");
  return parsed;
}

export async function downloadSupportReport(reportId, { refresh = false } = {}) {
  const safeId = assertReportId(reportId);
  mkdirSync(SUPPORT_CACHE_ROOT, { recursive: true });
  const reportDir = join(SUPPORT_CACHE_ROOT, safeId);
  mkdirSync(reportDir, { recursive: true });
  const archivePath = join(reportDir, "report.json.gz");

  if (refresh || !existsSync(archivePath)) {
    const source = `${SUPPORT_HOST}:${reportRemotePath(safeId, "report.json.gz")}`;
    const result = await runCommand({
      command: "scp",
      args: ["-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", source, archivePath],
      timeoutMs: 45_000,
      mode: "capture"
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || "Destek raporu indirilemedi.");
    }
  }

  const decoded = gunzipSync(readFileSync(archivePath)).toString("utf8");
  const bundle = JSON.parse(decoded);
  if (bundle?.format !== "yardimci-asistan-support-report" || bundle?.version !== 1) {
    throw new Error("Destek raporu biçimi tanınmıyor.");
  }
  return { reportId: safeId, reportDir, archivePath, bundle };
}

export function formatSupportReportLog(bundle) {
  const lines = [];
  for (const block of bundle.sessions ?? []) {
    const session = block.session ?? {};
    lines.push(
      `=== ${session.sessionId ?? "oturum"} · ${session.startedAt ?? ""} · WARN ${session.warnCount ?? 0} · ERROR ${session.errorCount ?? 0} ===`
    );
    for (const event of block.events ?? []) {
      lines.push(
        `${event.timestamp ?? ""} #${event.sequence ?? ""} [${event.level ?? ""}] [${event.process ?? ""}] [${event.scope ?? ""}] ${event.event ?? ""}`,
        String(event.message ?? "")
      );
      if (event.operationId) lines.push(`operationId: ${event.operationId}`);
      if (event.meta && Object.keys(event.meta).length) lines.push(`meta: ${JSON.stringify(event.meta)}`);
      if (event.error) {
        lines.push(`error: ${event.error.name ?? "Error"}: ${event.error.message ?? ""}`);
        if (event.error.stack) lines.push(String(event.error.stack));
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

export function summarizeSupportReport(bundle) {
  const sessions = Array.isArray(bundle.sessions) ? bundle.sessions : [];
  const events = sessions.flatMap((entry) => Array.isArray(entry.events) ? entry.events : []);
  const errors = events.filter((event) => event.level === "ERROR");
  const warnings = events.filter((event) => event.level === "WARN");
  const abrupt = sessions.filter((entry) => !entry.session?.endedAt).length;
  const recent = [...events]
    .filter((event) => event.level === "ERROR" || event.level === "WARN")
    .sort((left, right) => String(right.timestamp ?? "").localeCompare(String(left.timestamp ?? "")))
    .slice(0, 10);

  return {
    sessionCount: sessions.length,
    eventCount: events.length,
    errorCount: errors.length,
    warnCount: warnings.length,
    abruptSessionCount: abrupt,
    recent,
    note: String(bundle.note ?? ""),
    app: bundle.app ?? {},
    screenshotAttached: Boolean(bundle.screenshot?.base64)
  };
}

export function extractSupportScreenshot(downloaded) {
  const base64 = String(downloaded.bundle?.screenshot?.base64 ?? "");
  if (!base64) return "";
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 8 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Rapor ekran görüntüsü geçerli PNG değil.");
  }
  const filePath = join(downloaded.reportDir, "screenshot.png");
  writeFileSync(filePath, bytes, { mode: 0o600 });
  return filePath;
}

export async function openLocalPath(filePath) {
  const target = String(filePath ?? "");
  if (!target) return { ok: false, message: "Açılacak dosya yok." };
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [target];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", target];
  } else {
    command = "xdg-open";
    args = [target];
  }
  const result = await runCommand({ command, args, timeoutMs: 10_000, mode: "capture" });
  return result.exitCode === 0
    ? { ok: true, message: "Dosya sistem görüntüleyicisinde açıldı." }
    : { ok: false, message: result.stderr.trim() || "Dosya açılamadı." };
}

export async function updateSupportReportStatus(reportId, status, { resolvedInVersion = "" } = {}) {
  const safeStatus = ["new", "reviewing", "resolved"].includes(status) ? status : "";
  if (!safeStatus) throw new Error("Geçersiz rapor durumu.");
  const meta = await readSupportReportMeta(reportId);
  const now = new Date().toISOString();
  const {
    reviewing_at: _reviewingAt,
    resolved_at: _resolvedAt,
    resolved_in_version: _resolvedInVersion,
    ...baseMeta
  } = meta;
  const next = {
    ...baseMeta,
    status: safeStatus,
    ...(safeStatus === "reviewing" ? { reviewing_at: now } : {}),
    ...(safeStatus === "resolved"
      ? {
          resolved_at: now,
          resolved_in_version: String(resolvedInVersion || "").trim()
        }
      : {})
  };

  mkdirSync(SUPPORT_CACHE_ROOT, { recursive: true });
  const reportDir = join(SUPPORT_CACHE_ROOT, assertReportId(reportId));
  mkdirSync(reportDir, { recursive: true });
  const localMeta = join(reportDir, "meta.json");
  writeFileSync(localMeta, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });

  const remoteMeta = reportRemotePath(reportId, "meta.json");
  const remoteTemp = reportRemotePath(reportId, ".meta.admin.tmp");
  const destination = `${SUPPORT_HOST}:${remoteTemp}`;
  const upload = await runCommand({
    command: "scp",
    args: ["-q", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", localMeta, destination],
    timeoutMs: 30_000,
    mode: "capture"
  });
  if (upload.exitCode !== 0) throw new Error(upload.stderr.trim() || "Rapor durumu güncellenemedi.");

  const activate = await ssh(`chmod 600 ${remoteTemp} && mv ${remoteTemp} ${remoteMeta}`);
  if (activate.exitCode !== 0) {
    throw new Error(activate.stderr.trim() || "Rapor durumu atomik olarak etkinleştirilemedi.");
  }
  return next;
}
