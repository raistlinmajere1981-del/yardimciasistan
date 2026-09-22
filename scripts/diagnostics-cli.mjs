import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args.shift() : "latest";
const options = parseArgs(args);
const dataRoot = path.resolve(
  String(options["data-root"] || process.env.YA_DESKTOP_DATA_DIR || path.join(process.cwd(), "data"))
);
const sessionsRoot = path.join(dataRoot, "logs", "sessions");

if (!fs.existsSync(sessionsRoot)) {
  fail(`Diagnostics session klasörü bulunamadı: ${sessionsRoot}`);
}

const sessions = readSessions(sessionsRoot);
if (sessions.length === 0) {
  fail("Diagnostics session bulunamadı.");
}

if (command === "list") {
  for (const session of sessions) {
    console.log([
      session.sessionId,
      session.current ? "current" : "closed",
      session.startedAt,
      `events=${session.eventCount}`,
      `warn=${session.warnCount}`,
      `error=${session.errorCount}`,
      session.endReason ? `end=${session.endReason}` : ""
    ].filter(Boolean).join("  "));
  }
  process.exit(0);
}

if (command !== "latest" && command !== "errors") {
  fail("Kullanım: diagnostics-cli.mjs [list|latest|errors] [--session ID] [--scope SCOPE] [--query TEXT] [--level INFO,WARN,ERROR] [--limit N] [--data-root PATH]");
}

const sessionId = String(options.session || sessions[0].sessionId);
const session = sessions.find((item) => item.sessionId === sessionId);
if (!session) fail(`Session bulunamadı: ${sessionId}`);

const levels = command === "errors"
  ? new Set(["WARN", "ERROR"])
  : new Set(
      String(options.level || "INFO,WARN,ERROR")
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    );
const scope = String(options.scope || "").trim();
const query = String(options.query || "").trim().toLocaleLowerCase("tr-TR");
const limitValue = Number(options.limit || 500);
const limit = Number.isInteger(limitValue) ? Math.max(1, Math.min(limitValue, 20_000)) : 500;

const events = readEvents(path.join(sessionsRoot, session.sessionId))
  .filter((event) => levels.has(String(event.level || "").toUpperCase()))
  .filter((event) => !scope || event.scope === scope)
  .filter((event) => !query || JSON.stringify(event).toLocaleLowerCase("tr-TR").includes(query))
  .slice(-limit);

console.log(formatHeader(session));
for (const event of events) {
  console.log(formatEvent(event));
}
console.log(`---\nshown=${events.length} sessionEvents=${session.eventCount} warn=${session.warnCount} error=${session.errorCount}`);

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      result[rawKey] = inlineValue;
      continue;
    }
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      result[rawKey] = next;
      index += 1;
    } else {
      result[rawKey] = "true";
    }
  }
  return result;
}

function readSessions(root) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      try {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.name, "session.json"), "utf8"));
        return {
          ...manifest,
          current: !manifest.endedAt
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)));
}

function readEvents(sessionPath) {
  const events = [];
  for (const fileName of fs.readdirSync(sessionPath).filter((name) => /^events-\d{3}\.jsonl$/.test(name)).sort()) {
    const content = fs.readFileSync(path.join(sessionPath, fileName), "utf8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line));
      } catch {
        // Ignore a partial last line left by an abrupt shutdown.
      }
    }
  }
  return events;
}

function formatHeader(session) {
  return [
    "Yardımcı Asistan Diagnostics",
    `Session: ${session.sessionId}`,
    `Started: ${session.startedAt}`,
    `Ended: ${session.endedAt || "active"}`,
    `App: ${session.appVersion || "?"} · Electron ${session.electronVersion || "?"} · Node ${session.nodeVersion || "?"}`,
    `Platform: ${session.platform || "?"} ${session.arch || "?"}`,
    "---"
  ].join("\n");
}

function formatEvent(event) {
  const lines = [
    `${event.timestamp || ""} #${event.sequence || "?"} [${event.level || "?"}] [${event.process || "?"}] [${event.scope || "?"}] ${event.event || "event"}`,
    String(event.message || "")
  ];
  if (event.operationId) lines.push(`operationId: ${event.operationId}`);
  if (event.meta && Object.keys(event.meta).length > 0) lines.push(`meta: ${JSON.stringify(event.meta)}`);
  if (event.error) {
    lines.push(`error: ${event.error.name || "Error"}: ${event.error.message || ""}`);
    if (event.error.stack) lines.push(String(event.error.stack));
  }
  return lines.join("\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
