import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Demo backup release identity follows the same canonical desktop version as
// the installer and /kurulum/ cards. Never publish renamed older-schema ZIPs.
const productVersion = JSON.parse(fs.readFileSync(new URL("../../../product-version.json", import.meta.url), "utf8"));
export const DEMO_VERSION = productVersion.version;
if (typeof DEMO_VERSION !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(DEMO_VERSION)) {
  throw new Error("Invalid canonical demo product version");
}

// Each freshly produced pack uses the current Turkish calendar day, so "Today"
// and "Last 7 days" remain populated. YA_DEMO_DATE can freeze a YYYY-MM-DD
// fixture date for repeatable test snapshots without mutating a live database.
function currentDemoDay() {
  const selected = process.env.YA_DEMO_DATE;
  if (selected !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selected) ||
        new Date(selected + "T00:00:00.000Z").toISOString().slice(0, 10) !== selected) {
      throw new Error("YA_DEMO_DATE must be a valid YYYY-MM-DD");
    }
    return selected;
  }
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value ?? "";
  return [part("year"), part("month"), part("day")].join("-");
}
const DEMO_DAY = currentDemoDay();
export const FIXED_NOW = DEMO_DAY + "T08:00:00.000Z"; // 11:00 Europe/Istanbul

export function isoAt(dayOffset, hour = 9, minute = 0) {
  const date = new Date(DEMO_DAY + "T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour - 3, minute, 0, 0); // hour is Europe/Istanbul local time
  return date.toISOString();
}

export function isoDate(dayOffset) {
  return isoAt(dayOffset).slice(0, 10);
}

export function demoId(prefix, index) {
  return `${prefix}_${String(index).padStart(3, "0")}`;
}

export function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function insertRow(db, table, row) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const statement = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
  statement.run(...columns.map((column) => row[column]));
}

export function json(value) {
  return JSON.stringify(value);
}

export function countFiles(rootPath) {
  if (!fs.existsSync(rootPath)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countFiles(path.join(rootPath, entry.name));
    else if (entry.isFile()) total += 1;
  }
  return total;
}

export function slug(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 70);
}

/** Mirrors sanitizeFileName in apps/desktop-app/electron/data-maintenance.ts. */
export function sanitizeBackupFileName(value) {
  const cleaned = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 70);
  return cleaned || "urun";
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function listFiles(rootPath, relative = "") {
  const result = [];
  if (!fs.existsSync(rootPath)) return result;
  for (const entry of fs.readdirSync(path.join(rootPath, relative), { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...listFiles(rootPath, child));
    else if (entry.isFile()) result.push(child);
  }
  return result.sort();
}
