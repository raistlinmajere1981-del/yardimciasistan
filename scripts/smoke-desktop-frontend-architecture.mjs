import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const rendererRoot = join(root, "apps/desktop-app/src");

function fail(message) {
  console.error(`Frontend architecture smoke FAILED: ${message}`);
  process.exit(1);
}

function read(path) {
  const absolute = join(root, path);
  if (!existsSync(absolute)) fail(`Eksik dosya: ${path}`);
  return readFileSync(absolute, "utf8");
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function lineCount(content) {
  return content.split(/\r?\n/).length;
}

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}

const app = read("apps/desktop-app/src/App.tsx");
const view = read("apps/desktop-app/src/components/app/DesktopAppView.tsx");
const frame = read("apps/desktop-app/src/components/app/DesktopAppFrame.tsx");
const router = read("apps/desktop-app/src/components/app/DesktopWorkspaceRouter.tsx");
const main = read("apps/desktop-app/src/main.tsx");
const controllerTypes = read("apps/desktop-app/src/app/controller-types.ts");

assert(lineCount(app) <= 140, `App.tsx yeniden büyüdü (${lineCount(app)} satır). Controller koordinasyonu dışında sunum eklemeyin.`);
assert(lineCount(view) <= 220, `DesktopAppView.tsx yeniden büyüdü (${lineCount(view)} satır).`);
assert(lineCount(frame) <= 300, `DesktopAppFrame.tsx yeniden büyüdü (${lineCount(frame)} satır).`);
assert(lineCount(router) <= 700, `DesktopWorkspaceRouter.tsx yeniden büyüdü (${lineCount(router)} satır). Domain workspace bileşenlerine ayırın.`);

assert(app.includes("<DesktopAppView"), "App.tsx DesktopAppView üzerinden kompozisyon kurmalı.");
assert(!/from\s+["']\.\/pages\//.test(app), "App.tsx doğrudan sayfa bileşeni import etmemeli.");
assert(view.includes("<DesktopAppFrame") && view.includes("<DesktopWorkspaceRouter"), "DesktopAppView yalnız frame + router koordinasyonunu korumalı.");
assert(!/pages\//.test(view), "DesktopAppView doğrudan sayfa bileşenleri import etmemeli.");
assert(!/pages\//.test(frame), "DesktopAppFrame sayfa/workspace bileşenleri import etmemeli.");
assert(/pages\//.test(router), "DesktopWorkspaceRouter sayfa yönlendirme katmanı olarak kalmalı.");
assert(!main.includes("MutationObserver"), "main.tsx React dışı UX/MutationObserver katmanı başlatmamalı.");

for (const typeName of [
  "AppLockController",
  "DesktopSyncController",
  "MenuController",
  "SetupController",
  "MessagingController",
  "CustomerController",
  "OperationController",
  "DeviceController"
]) {
  assert(controllerTypes.includes(`export type ${typeName}`), `controller-types.ts içinde ${typeName} eksik.`);
}

const forbiddenDomMutations = [
  { pattern: /\bMutationObserver\b/, label: "MutationObserver" },
  { pattern: /\.replaceChildren\s*\(/, label: "replaceChildren" },
  { pattern: /\.appendChild\s*\(/, label: "appendChild" },
  { pattern: /\.insertBefore\s*\(/, label: "insertBefore" },
  { pattern: /\.removeChild\s*\(/, label: "removeChild" },
  { pattern: /\.innerHTML\s*=/, label: "innerHTML ataması" }
];

for (const file of walk(rendererRoot)) {
  const content = readFileSync(file, "utf8");
  for (const { pattern, label } of forbiddenDomMutations) {
    if (pattern.test(content)) {
      fail(`${relative(root, file)} içinde yasak React dışı DOM mutation kalıbı bulundu: ${label}`);
    }
  }
}

for (const removedFile of [
  "apps/desktop-app/src/desktop-ux.ts",
  "apps/desktop-app/src/cash-page-ux.ts",
  "apps/desktop-app/src/room-management-ux.ts",
  "apps/desktop-app/src/menu-editor-ux.ts",
  "apps/desktop-app/src/customer-work-enhancements.ts"
]) {
  assert(!existsSync(join(root, removedFile)), `Kaldırılmış UX katmanı geri gelmiş: ${removedFile}`);
}

console.log("Frontend architecture smoke OK");
console.log(`App.tsx: ${lineCount(app)} satır`);
console.log(`DesktopAppView.tsx: ${lineCount(view)} satır`);
console.log(`DesktopAppFrame.tsx: ${lineCount(frame)} satır`);
console.log(`DesktopWorkspaceRouter.tsx: ${lineCount(router)} satır`);
