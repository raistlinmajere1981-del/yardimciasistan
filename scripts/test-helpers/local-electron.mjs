import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const electronRoots = [
  join(repoRoot, "node_modules", "electron"),
  join(repoRoot, "apps", "desktop-app", "node_modules", "electron")
];

function getLocalElectronRoot() {
  const electronRoot = electronRoots.find((candidate) => existsSync(join(candidate, "package.json")));
  if (!electronRoot) {
    throw new Error("Yerel Electron bulunamadı. Önce repository bağımlılıklarını kurun.");
  }
  return electronRoot;
}

export function getLocalElectronExecutable() {
  const electronRoot = getLocalElectronRoot();
  const pathFile = join(electronRoot, "path.txt");
  if (!existsSync(pathFile)) {
    throw new Error("Yerel Electron kurulumu eksik: path.txt bulunamadı.");
  }

  const relativeExecutable = readFileSync(pathFile, "utf8").trim();
  const executable = join(electronRoot, "dist", relativeExecutable);
  if (!relativeExecutable || !existsSync(executable)) {
    throw new Error("Yerel Electron çalıştırılabilir dosyası bulunamadı.");
  }
  return executable;
}

export function getLocalElectronVersion() {
  const packagePath = join(getLocalElectronRoot(), "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (typeof packageJson.version !== "string" || !packageJson.version) {
    throw new Error("Yerel Electron sürümü okunamadı.");
  }
  return packageJson.version;
}
