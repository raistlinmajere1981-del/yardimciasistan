import path from "node:path";

const SECRET_COLUMN = /(secret|token|password|passwd|credential|api_key|private_key|hmac)/i;
const SECRET_COLUMN_EXEMPT = new Set(["request_hmac"]);
const SECRET_VALUE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9]{16,}\b|\bBearer\s+[A-Za-z0-9._-]{16,})/i;
const SAFE_EMAIL = /^[^@\s]+@(?:[a-z0-9-]+\.)*example\.test$/i;

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function quickCheck(db) {
  const row = db.prepare("PRAGMA quick_check").get();
  return row ? String(Object.values(row)[0] ?? "") : "";
}

export function foreignKeyViolations(db) {
  return db.prepare("PRAGMA foreign_key_check").all().map((row) => ({ ...row }));
}

/** Returns human-readable violations; never echoes secret-looking values in full. */
export function scanSecrets(db) {
  const violations = [];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));

  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
      .filter((column) => String(column.type || "").toUpperCase().includes("TEXT"));
    for (const column of columns) {
      const name = String(column.name);
      const rows = db.prepare(`SELECT ${quoteIdentifier(name)} AS value FROM ${quoteIdentifier(table)}
        WHERE ${quoteIdentifier(name)} IS NOT NULL AND ${quoteIdentifier(name)} <> ''`).all();
      for (const row of rows) {
        const value = String(row.value ?? "");
        if (SECRET_COLUMN.test(name) && !SECRET_COLUMN_EXEMPT.has(name)) {
          violations.push(`${table}.${name} contains a non-empty credential-like value`);
          break;
        }
        if (SECRET_VALUE.test(value)) {
          violations.push(`${table}.${name} contains a secret-shaped string`);
          break;
        }
        if (name === "email" && !SAFE_EMAIL.test(value.trim())) {
          violations.push(`${table}.email contains a non-example.test address`);
          break;
        }
        if (value.includes("sync_secret") || value.includes("web_module_url")) {
          violations.push(`${table}.${name} references a protected settings key`);
          break;
        }
      }
    }
  }

  const settings = db.prepare("SELECT web_module_url, sync_secret, app_password_verifier, auto_sync_enabled FROM settings").all();
  for (const row of settings) {
    if (String(row.web_module_url ?? "") !== "") violations.push("settings.web_module_url is not empty");
    if (String(row.sync_secret ?? "") !== "") violations.push("settings.sync_secret is not empty");
    if (String(row.app_password_verifier ?? "") !== "") violations.push("settings.app_password_verifier is not empty");
    if (Number(row.auto_sync_enabled ?? 0) !== 0) violations.push("settings.auto_sync_enabled is not 0");
  }

  return violations;
}

export function inspectDatabase(db) {
  const check = quickCheck(db);
  const foreignKeys = foreignKeyViolations(db);
  const secrets = scanSecrets(db);
  return {
    quickCheck: check,
    foreignKeyViolations: foreignKeys,
    secretViolations: secrets,
    ok: check.toLowerCase() === "ok" && foreignKeys.length === 0 && secrets.length === 0
  };
}

export function backupPaths(folderPath) {
  return {
    folderPath,
    databasePath: path.join(folderPath, "yardimci-asistan.sqlite"),
    assetsPath: path.join(folderPath, "assets"),
    qrMenuImagesPath: path.join(folderPath, "qr-menu-images"),
    manifestPath: path.join(folderPath, "backup.json")
  };
}
