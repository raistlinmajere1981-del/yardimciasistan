import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function getLocalViteExecutable() {
  const executable = join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite"
  );
  if (!existsSync(executable)) {
    throw new Error("Yerel Vite bulunamadı. Önce repository bağımlılıklarını kurun.");
  }
  return executable;
}
