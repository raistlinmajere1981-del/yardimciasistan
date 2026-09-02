import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["apps", "packages", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  ".git",
  ".demo-runtime",
  "node_modules",
  "dist",
  "dist-renderer",
  "dist-electron",
  "build",
  "coverage",
  "release",
  "out"
]);

const violations = [];

function normalize(value) {
  return value.split(path.sep).join("/");
}

function walk(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(relativePath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(relativePath);
  }
  return files;
}

function scriptKind(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function resolveRelativeImport(sourcePath, specifier) {
  if (!specifier.startsWith(".")) return null;
  return normalize(path.resolve(path.dirname(path.join(ROOT, sourcePath)), specifier));
}

function importClauseIsTypeOnly(importClause) {
  if (!importClause) return false;
  if (importClause.isTypeOnly) return true;
  if (importClause.name) return false;
  const bindings = importClause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
}

function report(file, node, sourceFile, rule, message) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  violations.push({
    file: normalize(file),
    line: position.line + 1,
    column: position.character + 1,
    rule,
    message
  });
}

function auditFile(file) {
  const absolute = path.join(ROOT, file);
  const text = fs.readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const normalizedFile = normalize(file);
  const isDesktopRenderer = normalizedFile.startsWith("apps/desktop-app/src/");
  const isDesktopPreload = normalizedFile === "apps/desktop-app/electron/preload.ts";
  const isPackageSource = normalizedFile.startsWith("packages/");

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const resolved = resolveRelativeImport(file, specifier);
      const typeOnly = importClauseIsTypeOnly(node.importClause);

      if (
        isDesktopRenderer
        && resolved?.includes("/apps/desktop-app/electron/")
        && !typeOnly
      ) {
        report(
          file,
          node,
          sourceFile,
          "renderer-no-electron-runtime-import",
          "Renderer, Electron katmanından yalnız `import type` ile tip alabilir. Runtime erişimi preload/IPC üzerinden yapılmalı."
        );
      }

      if (isDesktopPreload && !typeOnly && specifier !== "electron") {
        report(
          file,
          node,
          sourceFile,
          "preload-no-runtime-app-import",
          "Sandboxed preload yalnız Electron runtime modülünü yüklemeli; uygulama/package bağımlılıkları `import type` kalmalı ve runtime işi IPC ana sürecine taşınmalı."
        );
      }

      if (isPackageSource && resolved?.includes("/apps/")) {
        report(
          file,
          node,
          sourceFile,
          "packages-no-app-import",
          "packages/* uygulama katmanına bağımlı olamaz. Ortak sözleşmeyi package içine taşıyın."
        );
      }
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const resolved = resolveRelativeImport(file, node.moduleSpecifier.text);
      if (isDesktopRenderer && resolved?.includes("/apps/desktop-app/electron/") && !node.isTypeOnly) {
        report(
          file,
          node,
          sourceFile,
          "renderer-no-electron-runtime-export",
          "Renderer, Electron runtime modülünü yeniden export edemez."
        );
      }
      if (isPackageSource && resolved?.includes("/apps/")) {
        report(
          file,
          node,
          sourceFile,
          "packages-no-app-export",
          "packages/* uygulama katmanından export yapamaz."
        );
      }
    }

    if (
      isDesktopRenderer
      && ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      const resolved = resolveRelativeImport(file, node.arguments[0].text);
      if (resolved?.includes("/apps/desktop-app/electron/")) {
        report(
          file,
          node,
          sourceFile,
          "renderer-no-electron-dynamic-import",
          "Renderer, Electron runtime modülünü dynamic import ile yükleyemez."
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const files = SOURCE_ROOTS.flatMap(walk);
for (const file of files) auditFile(file);

if (violations.length > 0) {
  console.error(`architecture-audit: ${violations.length} ihlal bulundu.`);
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`architecture-audit-ok (${files.length} kaynak dosya tarandı)`);
}
