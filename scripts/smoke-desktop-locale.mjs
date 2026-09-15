import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sourceRoot = join(process.cwd(), "apps", "desktop-app", "src");
const mainSource = readFileSync(join(process.cwd(), "apps", "desktop-app", "electron", "main.ts"), "utf8");
const htmlSource = readFileSync(join(process.cwd(), "apps", "desktop-app", "index.html"), "utf8");
const setupModelSource = readFileSync(join(sourceRoot, "app", "setup-model.ts"), "utf8");
const setupFormSource = readFileSync(join(sourceRoot, "components", "settings", "SetupForm.tsx"), "utf8");

const localeSwitch = 'app.commandLine.appendSwitch("lang", "tr-TR")';
assert.ok(mainSource.includes(localeSwitch), "Electron tr-TR locale switch is missing");
assert.ok(mainSource.indexOf(localeSwitch) < mainSource.indexOf("app.whenReady()"), "Electron locale switch must run before app.whenReady()");
assert.match(mainSource, /process\.env\.LANG = "tr_TR\.UTF-8"/);
assert.match(mainSource, /process\.env\.LC_ALL = "tr_TR\.UTF-8"/);
assert.match(htmlSource, /<html lang="tr-TR">/, "Desktop HTML must declare tr-TR");

assert.match(setupModelSource, /businessName: setupData\.businessName \|\| ""/);
assert.match(setupModelSource, /phone: setupData\.phone \|\| ""/);
assert.match(setupModelSource, /whatsapp: setupData\.whatsapp \|\| ""/);
assert.doesNotMatch(setupFormSource, /Deniz Çiçeği|905321234567|5321234567/);
assert.match(setupFormSource, /placeholder="İşletme adı"/);
assert.match(setupFormSource, /placeholder="\+90 5xx xxx xx xx"/);
assert.match(setupFormSource, /placeholder="İşletme adresi"/);

const sourceFiles = listSourceFiles(sourceRoot);
const nativeInputTags = sourceFiles.flatMap((filePath) => collectInputTags(readFileSync(filePath, "utf8")).map((tag) => ({ filePath, tag })));
for (const { filePath, tag } of nativeInputTags) {
  const typeMatch = tag.match(/\btype\s*=\s*["'](date|time|datetime-local)["']/);
  if (!typeMatch) continue;
  assert.notEqual(typeMatch[1], "datetime-local", `${filePath} must keep separate date/time contracts`);
  assert.match(tag, /\blang\s*=\s*["']tr-TR["']/, `${filePath} ${typeMatch[1]} input must declare lang=tr-TR`);
}

const allSources = sourceFiles.map((filePath) => readFileSync(filePath, "utf8")).join("\n");
assert.doesNotMatch(allSources, /localized-date-display|webkit-datetime-edit/);
console.log("desktop-locale-contract-ok");

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function collectInputTags(source) {
  const tags = [];
  let start = source.indexOf("<input");
  while (start >= 0) {
    let quote = "";
    let braceDepth = 0;
    let end = start + 6;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote) {
        if (character === quote && source[end - 1] !== "\\") quote = "";
        continue;
      }
      if (character === "\"" || character === "'") {
        quote = character;
        continue;
      }
      if (character === "{") {
        braceDepth += 1;
        continue;
      }
      if (character === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (character === ">" && braceDepth === 0) break;
    }
    tags.push(source.slice(start, end + 1));
    start = source.indexOf("<input", end + 1);
  }
  return tags;
}
