import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { chromium } from "@playwright/test";

const checks = [];

checkCommand("node", ["--version"], true);
checkCommand("npm", ["--version"], true);
checkCommand("npx", ["electron", "--version"], false);
checkCommand("php", ["-v"], false);
checkCommand("Xvfb", ["-help"], false);
checkCommand("xvfb-run", ["--help"], false);
checkCommand("magick", ["-version"], false);
checkCommand("adb", ["version"], false);
checkCommand("java", ["-version"], true);
checkCommand("keytool", ["-help"], true);

checkFile("README.md", true);
checkFile("docs/PROJECT_BRIEF.md", true);
checkFile("docs/WEB_MODULE_INSTALLATION.md", true);
checkFile("docs/DEMO_SITE_CUSTOMIZATION.md", true);
checkFile("docs/dev/DESKTOP_INSTALLER_PLAN.md", true);
checkFile("docs/dev/END_TO_END_DEMO_FLOW.md", true);
checkFile("demo-data/web-module-requests.json", true);
checkFile("apps/demo-web/package.json", true);
checkFile("apps/android-app/package.json", true);
checkFile("packages/shared/package.json", true);
checkFile("packages/whatsapp-bridge/package.json", true);
checkFile("packages/ai-core/package.json", true);
checkFile("packages/web-widget/package.json", true);
checkFile("firm-template/web-module/api/request.php", true);
checkFile("firm-template/web-module/api/menu.php", true);
checkFile("firm-template/web-module/api/chat.php", true);
checkFile("firm-template/web-module/menu.html", true);

checkJson("package.json", true);
checkJson("apps/demo-web/config/business.json", true);
checkJson("demo-data/web-module-requests.json", true);
checkJson("firm-template/web-module/config/business.json", true);
checkJson("firm-template/web-module/data/requests.json", true);
checkJson("firm-template/web-module/data/menu.json", true);
checkJson("firm-template/web-module/data/ai-conversations.json", true);
checkJson("firm-template/web-module/data/android-snapshot.json", true);

checkPlaywrightBrowser();
checkAndroidSdk();

const failedRequired = checks.filter((check) => check.required && !check.ok);

console.log("");
for (const check of checks) {
  const marker = check.ok ? "OK " : check.required ? "ERR" : "WARN";
  console.log(`${marker} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
}

console.log("");
console.log(`Platform: ${process.platform} ${process.arch}`);

if (failedRequired.length > 0) {
  console.error("");
  console.error("Zorunlu kontrollerden biri başarısız oldu.");
  process.exit(1);
}

function checkCommand(command, args, required) {
  const result = spawnSync(command, args, {
    encoding: "utf8"
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n")[0] ?? "";

  checks.push({
    name: `${command} komutu`,
    required,
    ok: result.status === 0,
    detail: result.status === 0 ? output : "bulunamadı veya çalışmadı"
  });
}

function checkFile(path, required) {
  checks.push({
    name: path,
    required,
    ok: existsSync(join(process.cwd(), path)),
    detail: existsSync(join(process.cwd(), path)) ? "var" : "bulunamadı"
  });
}

function checkJson(path, required) {
  try {
    JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
    checks.push({
      name: `${path} JSON`,
      required,
      ok: true,
      detail: "geçerli"
    });
  } catch (error) {
    checks.push({
      name: `${path} JSON`,
      required,
      ok: false,
      detail: error instanceof Error ? error.message : "okunamadı"
    });
  }
}

function checkPlaywrightBrowser() {
  const executablePath = chromium.executablePath();
  const isInstalled = existsSync(executablePath);

  checks.push({
    name: "Playwright Chromium",
    required: false,
    ok: isInstalled,
    detail: isInstalled ? executablePath : "npx playwright install chromium gerekli"
  });
}

function checkAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), "Android", "Sdk")
  ].filter(Boolean);
  const sdkPath = candidates.find((candidate) => candidate && existsSync(join(candidate, "platforms")) && existsSync(join(candidate, "build-tools")));

  if (!sdkPath) {
    checks.push({
      name: "Android SDK",
      required: true,
      ok: false,
      detail: "ANDROID_HOME/ANDROID_SDK_ROOT veya ~/Android/Sdk bulunamadı"
    });
    return;
  }

  const requiredTools = ["aapt2", "d8", "zipalign", "apksigner"];
  const buildToolsPath = findLatestCompleteBuildTools(sdkPath, requiredTools);
  const platformPath = findLatestAndroidPlatform(sdkPath);

  checks.push({
    name: "Android SDK",
    required: true,
    ok: Boolean(buildToolsPath && platformPath),
    detail: buildToolsPath && platformPath ? `${sdkPath} (${platformPath}, ${buildToolsPath})` : "platforms/android-* ve build-tools eksik"
  });
}

function findLatestCompleteBuildTools(sdkPath, requiredTools) {
  const toolsRoot = join(sdkPath, "build-tools");
  if (!existsSync(toolsRoot)) {
    return "";
  }

  const tools = spawnSync("find", [toolsRoot, "-maxdepth", "1", "-mindepth", "1", "-type", "d"], {
    encoding: "utf8"
  });

  return tools.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort()
    .reverse()
    .find((path) => requiredTools.every((tool) => existsSync(join(path, tool)))) ?? "";
}

function findLatestAndroidPlatform(sdkPath) {
  const platformRoot = join(sdkPath, "platforms");
  if (!existsSync(platformRoot)) {
    return "";
  }

  const platforms = spawnSync("find", [platformRoot, "-maxdepth", "1", "-mindepth", "1", "-type", "d", "-name", "android-[0-9]*"], {
    encoding: "utf8"
  });

  return platforms.stdout
    .trim()
    .split("\n")
    .filter((path) => /android-\d+$/.test(path) && existsSync(join(path, "android.jar")))
    .sort()
    .reverse()[0] ?? "";
}
