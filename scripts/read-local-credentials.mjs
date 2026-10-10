import { readFileSync } from "node:fs";

const allowedFields = new Set([
  "ftpProtocol",
  "ftpHost",
  "ftpPort",
  "ftpUser",
  "ftpPassword",
  "ftpRemoteRoot",
  "ftpTlsMode",
  "ftpCleanDefaultPlaceholder"
]);

const [filePath, reference, ...fields] = process.argv.slice(2);
if (!filePath || !reference || fields.length === 0 || fields.some((field) => !allowedFields.has(field))) {
  process.stderr.write("Yerel credential alanları geçersiz.\n");
  process.exit(2);
}

try {
  const data = JSON.parse(readFileSync(filePath, "utf8"));
  const record = data.credentials?.[reference] ?? {};
  for (const field of fields) {
    const value = record[field];
    process.stdout.write(`${typeof value === "string" ? value : String(value ?? "")}\0`);
  }
} catch {
  process.stderr.write("Yerel credentials dosyası okunamadı.\n");
  process.exit(1);
}
