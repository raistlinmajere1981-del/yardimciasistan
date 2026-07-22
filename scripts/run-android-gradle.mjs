import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const gradleVersion = "9.6.1";
const gradleSha256 = "9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14";
const distributionUrl = `https://services.gradle.org/distributions/gradle-${gradleVersion}-bin.zip`;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(repoRoot, "apps", "android-app");
const gradleUserHome = process.env.GRADLE_USER_HOME || join(homedir(), ".gradle");
const wrapperCache = join(gradleUserHome, "yardimci-asistan-wrapper");
const archivePath = join(wrapperCache, "downloads", `gradle-${gradleVersion}-bin.zip`);
const installRoot = join(wrapperCache, "distributions", `gradle-${gradleVersion}`);
const gradleHome = join(installRoot, `gradle-${gradleVersion}`);
const gradleExecutable = join(gradleHome, "bin", process.platform === "win32" ? "gradle.bat" : "gradle");
const gradleArguments = process.argv.slice(2);
const buildEnvironment = { ...process.env };

if (!buildEnvironment.ANDROID_HOME && !buildEnvironment.ANDROID_SDK_ROOT) {
  const sdkCandidates = [
    join(homedir(), "Android", "Sdk"),
    buildEnvironment.LOCALAPPDATA ? join(buildEnvironment.LOCALAPPDATA, "Android", "Sdk") : ""
  ];
  const detectedSdk = sdkCandidates.find((candidate) => candidate && existsSync(candidate));
  if (detectedSdk) {
    buildEnvironment.ANDROID_HOME = detectedSdk;
  }
}

if (gradleArguments.length === 0) {
  throw new Error("En az bir Gradle görevi verilmeli (ör. assembleDebug).");
}

await ensureGradle();

const result = spawnSync(
  gradleExecutable,
  ["--project-dir", appDir, "--console=plain", "--no-daemon", ...gradleArguments],
  {
    cwd: repoRoot,
    env: buildEnvironment,
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}

async function ensureGradle() {
  if (existsSync(gradleExecutable)) {
    return;
  }

  mkdirSync(dirname(archivePath), { recursive: true });
  if (!existsSync(archivePath) || await sha256(archivePath) !== gradleSha256) {
    const partialArchive = `${archivePath}.part-${process.pid}`;
    rmSync(partialArchive, { force: true });
    console.log(`Gradle ${gradleVersion} güvenli kullanıcı cache'ine indiriliyor...`);
    const response = await fetch(distributionUrl, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`Gradle indirilemedi: HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partialArchive, { mode: 0o600 }));
    const downloadedSha256 = await sha256(partialArchive);
    if (downloadedSha256 !== gradleSha256) {
      rmSync(partialArchive, { force: true });
      throw new Error("Gradle dağıtımı SHA-256 doğrulamasından geçmedi.");
    }
    renameSync(partialArchive, archivePath);
  }

  rmSync(installRoot, { recursive: true, force: true });
  mkdirSync(installRoot, { recursive: true });
  run("jar", ["xf", archivePath], installRoot);
  if (!existsSync(gradleExecutable)) {
    throw new Error("Gradle dağıtımı açıldı ancak çalıştırılabilir dosya bulunamadı.");
  }
  if (process.platform !== "win32") {
    chmodSync(gradleExecutable, 0o755);
  }
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} çalıştırılamadı.\n${output}`);
  }
}
