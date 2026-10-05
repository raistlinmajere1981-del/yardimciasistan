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

function isDocumentElementNode(node) {
  return (
    ts.isPropertyAccessExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "document"
    && node.name.text === "documentElement"
  );
}

function isSafeAppearanceObserve(node) {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;
  if (node.expression.name.text !== "observe") return null;
  if (!ts.isIdentifier(node.expression.expression)) return null;
  const observerName = node.expression.expression.text;
  if (node.arguments.length < 2) return null;
  if (!isDocumentElementNode(node.arguments[0])) return null;
  const options = node.arguments[1];
  if (!ts.isObjectLiteralExpression(options)) return null;
  let attributesTrue = false;
  let attributeFilter = null;
  let hasUnsafeSubscription = false;
  for (const prop of options.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
    const key = prop.name.text;
    if (key === "attributes") {
      attributesTrue = prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
    } else if (key === "attributeFilter") {
      if (!ts.isArrayLiteralExpression(prop.initializer)) return null;
      attributeFilter = prop.initializer.elements.map((el) => (ts.isStringLiteral(el) ? el.text : ""));
    } else if ((key === "childList" || key === "subtree" || key === "characterData") && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      hasUnsafeSubscription = true;
    }
  }
  if (!attributesTrue || hasUnsafeSubscription) return null;
  if (!attributeFilter || attributeFilter.length === 0) return null;
  if (!attributeFilter.every((entry) => entry.startsWith("data-"))) return null;
  return observerName;
}

function auditFile(file) {
  const absolute = path.join(ROOT, file);
  const text = fs.readFileSync(absolute, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const normalizedFile = normalize(file);
  const isDesktopRenderer = normalizedFile.startsWith("apps/desktop-app/src/");
  const isDesktopPreload = normalizedFile === "apps/desktop-app/electron/preload.ts";
  const isPackageSource = normalizedFile.startsWith("packages/");
  const isDesktopCompositionRoot = new Set([
    "apps/desktop-app/src/App.tsx",
    "apps/desktop-app/src/components/app/DesktopAppView.tsx",
    "apps/desktop-app/src/components/app/DesktopAppFrame.tsx"
  ]).has(normalizedFile);
  const mutationObserverCandidates = [];
  const safeAppearanceObservers = new Set();
  const seenObserverInitializers = new Set();

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const resolved = resolveRelativeImport(file, specifier);
      const typeOnly = importClauseIsTypeOnly(node.importClause);

      if (isDesktopCompositionRoot && resolved?.includes("/apps/desktop-app/src/pages/")) {
        report(
          file,
          node,
          sourceFile,
          "desktop-composition-root-no-page-import",
          "App/View/Frame katmanı doğrudan Page import etmemeli; Page kompozisyonu DesktopWorkspaceRouter içinde kalmalı."
        );
      }

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

    if (isDesktopRenderer && ts.isVariableDeclaration(node) && node.initializer && ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "MutationObserver") {
      seenObserverInitializers.add(node.initializer);
      const varName = ts.isIdentifier(node.name) ? node.name.text : null;
      mutationObserverCandidates.push({ node: node.initializer, varName });
    }

    if (isDesktopRenderer && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "MutationObserver" && !seenObserverInitializers.has(node)) {
      mutationObserverCandidates.push({ node, varName: null });
    }

    if (isDesktopRenderer && ts.isCallExpression(node)) {
      const safeObserver = isSafeAppearanceObserve(node);
      if (safeObserver) safeAppearanceObservers.add(safeObserver);
    }

    if (
      isDesktopRenderer
      && ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && new Set(["replaceChildren", "appendChild", "insertBefore", "removeChild"]).has(node.expression.name.text)
    ) {
      report(
        file,
        node,
        sourceFile,
        "renderer-no-imperative-dom-mutation",
        `Renderer React ağacını ${node.expression.name.text} ile doğrudan mutasyona uğratmamalı.`
      );
    }

    if (
      isDesktopRenderer
      && ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && node.left.name.text === "innerHTML"
    ) {
      report(
        file,
        node,
        sourceFile,
        "renderer-no-innerhtml-assignment",
        "Renderer React ağacına innerHTML ataması yapmamalı."
      );
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

  for (const candidate of mutationObserverCandidates) {
    if (candidate.varName && safeAppearanceObservers.has(candidate.varName)) continue;
    report(
      file,
      candidate.node,
      sourceFile,
      "renderer-no-dom-observer",
      "Renderer React ağacını MutationObserver ile sonradan yamamamalı. İstisna: yalnızca document.documentElement üzerinde data-* appearance özniteliklerini (attributes:true + attributeFilter) izleyen gözlemciler."
    );
  }
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
