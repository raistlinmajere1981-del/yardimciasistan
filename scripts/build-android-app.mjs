import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const verify = process.argv.slice(2).includes("--verify");
const tasks = verify ? ["testDebugUnitTest", "assembleDebug"] : ["assembleDebug"];
const result = spawnSync(
  process.execPath,
  [resolve(repoRoot, "scripts", "run-android-gradle.mjs"), ...tasks],
  { cwd: repoRoot, env: process.env, stdio: "inherit" }
);

if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
