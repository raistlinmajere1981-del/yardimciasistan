import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Native userData only. Never stored in the shared business database or exported. */
export function getDocumentPrinterInstallationId(userDataPath: string): string {
  const file = join(userDataPath, "document-printer-installation-id");
  try { writeFileSync(file, randomUUID(), { flag: "wx", mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const id = readFileSync(file, "utf8");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw Error("DOCUMENT_INSTALLATION_INVALID");
  return id;
}
