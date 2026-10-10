import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const appDir = process.cwd();
const outputDir = mkdtempSync(join(tmpdir(), "ya-admin-renderer-check-"));

try {
  const result = spawnSync(
    process.platform === "win32" ? "vite.cmd" : "vite",
    ["build", "--config", "vite.renderer.config.ts", "--outDir", outputDir, "--emptyOutDir"],
    {
      cwd: appDir,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit"
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
