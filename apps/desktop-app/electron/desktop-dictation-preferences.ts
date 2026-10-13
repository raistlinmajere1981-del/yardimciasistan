import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

interface DesktopDictationPreference { enabled: boolean; configuration: string }
const preferencePath = (databasePath: string) => join(dirname(databasePath), "desktop-dictation.json");

/** Device-local opt-in, owned by main and the Services resource draft. No DB upgrade. */
export function readDesktopDictationPreference(databasePath: string): DesktopDictationPreference {
  try {
    const value = JSON.parse(readFileSync(preferencePath(databasePath), "utf8")) as Record<string, unknown>;
    return { enabled: value.version === 1 && value.enabled === true,
      configuration: typeof value.configuration === "string" ? value.configuration : "" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { enabled: false, configuration: "" };
    throw new Error("Masaüstü dikte tercihi okunamadı.", { cause: error });
  }
}

export function saveDesktopDictationPreference(databasePath: string, value: DesktopDictationPreference): void {
  const target = preferencePath(databasePath), temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify({ version: 1, ...value }), { mode: 0o600, flag: "wx" });
    renameSync(temporary, target);
  } catch { throw new Error("Masaüstü dikte tercihi saklanamadı."); }
  finally { rmSync(temporary, { force: true }); }
}
