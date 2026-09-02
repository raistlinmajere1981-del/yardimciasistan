import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE_PATH = path.join(ROOT, "quality", "design-audit-baseline.json");
const TOKEN_FILE = "apps/desktop-app/src/styles.css";
const SCAN_ROOTS = [
  "apps/desktop-app/src",
  "apps/demo-web/src",
  "packages/web-widget/src"
];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const args = new Set(process.argv.slice(2));
const writeBaseline = args.has("--write-baseline");
const strict = args.has("--strict");

const metricNames = [
  "rawColor",
  "hardcodedRadius",
  "hardcodedShadow",
  "hardcodedFontSize",
  "important",
  "inlineStyle"
];

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
    if (entry.isDirectory()) files.push(...walk(relativePath));
    else if (/\.(?:css|tsx|jsx)$/.test(entry.name)) files.push(normalize(relativePath));
  }
  return files;
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function cssMetrics(file, text) {
  const isTokenFile = file === TOKEN_FILE;
  return {
    rawColor: isTokenFile
      ? 0
      : countMatches(text, /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/g),
    hardcodedRadius: isTokenFile
      ? 0
      : countMatches(text, /border-radius\s*:\s*(?!var\()[^;}{]+/g),
    hardcodedShadow: isTokenFile
      ? 0
      : countMatches(text, /box-shadow\s*:\s*(?!var\()[^;}{]+/g),
    hardcodedFontSize: isTokenFile
      ? 0
      : countMatches(text, /font-size\s*:\s*(?!var\()[0-9.]+(?:px|rem|em)\b/g),
    important: countMatches(text, /!important\b/g),
    inlineStyle: 0
  };
}

function componentMetrics(text) {
  return {
    rawColor: 0,
    hardcodedRadius: 0,
    hardcodedShadow: 0,
    hardcodedFontSize: 0,
    important: 0,
    inlineStyle: countMatches(text, /\bstyle\s*=\s*\{\s*\{/g)
  };
}

function readMetrics() {
  const result = {};
  for (const file of SCAN_ROOTS.flatMap(walk).sort()) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    result[file] = file.endsWith(".css") ? cssMetrics(file, text) : componentMetrics(text);
  }
  return result;
}

function assertTokenContract() {
  const absolute = path.join(ROOT, TOKEN_FILE);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Tasarım token dosyası bulunamadı: ${TOKEN_FILE}`);
  }
  const text = fs.readFileSync(absolute, "utf8");
  const requiredTokens = [
    "--bg",
    "--surface-1",
    "--ink",
    "--primary",
    "--status-green",
    "--text-base",
    "--space-1",
    "--radius-sm",
    "--shadow-sm",
    "--control-height"
  ];
  const missing = requiredTokens.filter((token) => !text.includes(`${token}:`));
  if (missing.length > 0) {
    throw new Error(`Tasarım token sözleşmesi eksik: ${missing.join(", ")}`);
  }
}

function summarize(metrics) {
  const total = Object.fromEntries(metricNames.map((name) => [name, 0]));
  for (const values of Object.values(metrics)) {
    for (const name of metricNames) total[name] += values[name] ?? 0;
  }
  return total;
}

function printSummary(metrics) {
  const total = summarize(metrics);
  console.log("design-audit-summary");
  for (const name of metricNames) console.log(`  ${name}: ${total[name]}`);

  const debtFiles = Object.entries(metrics)
    .map(([file, values]) => ({
      file,
      total: metricNames.reduce((sum, name) => sum + (values[name] ?? 0), 0)
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (debtFiles.length > 0) {
    console.log("design-audit-top-debt");
    for (const entry of debtFiles) console.log(`  ${entry.total}\t${entry.file}`);
  }
}

assertTokenContract();
const current = readMetrics();
printSummary(current);

if (writeBaseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), files: current }, null, 2)}\n`
  );
  console.log(`design-audit-baseline-written: ${normalize(path.relative(ROOT, BASELINE_PATH))}`);
  process.exit(0);
}

if (!strict) {
  console.log("design-audit-ok (rapor modu; --strict için önce --write-baseline çalıştırın)");
  process.exit(0);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error("design-audit: baseline bulunamadı. Önce `npm run design:audit:baseline` çalıştırın.");
  process.exit(1);
}

const baselineDocument = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const baseline = baselineDocument.files ?? {};
const regressions = [];

for (const [file, values] of Object.entries(current)) {
  const allowed = baseline[file] ?? {};
  for (const name of metricNames) {
    const currentValue = values[name] ?? 0;
    const baselineValue = allowed[name] ?? 0;
    if (currentValue > baselineValue) {
      regressions.push({ file, metric: name, baseline: baselineValue, current: currentValue });
    }
  }
}

if (regressions.length > 0) {
  console.error(`design-audit: ${regressions.length} tasarım sistemi regresyonu bulundu.`);
  for (const item of regressions) {
    console.error(`- ${item.file} [${item.metric}] ${item.baseline} -> ${item.current}`);
  }
  console.error("Mevcut borcu azaltmak serbesttir; baseline yalnız yeni borcun eklenmesini engeller.");
  process.exit(1);
}

console.log("design-audit-strict-ok");
