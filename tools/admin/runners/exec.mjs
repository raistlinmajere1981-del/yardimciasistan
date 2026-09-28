import { spawn } from "node:child_process";
import { resolveCwd } from "../lib/paths.mjs";

/**
 * Tek komut çalıştırma noktası. Shell birleştirme yok; her zaman
 * spawn(command, args) kullanılır (fish dahil her shell ile uyumlu).
 *
 * mode "capture": stdout/stderr toplanır, history/rapor için döner.
 * mode "inherit": etkileşimli (deploy onayı, dev server) işlemler için
 *   terminal doğrudan bağlanır; çıktı yakalanmaz.
 */
export function runCommand({ command, args = [], cwd = "repo", env = {}, timeoutMs = 0, mode = "capture" }) {
  const start = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: resolveCwd(cwd),
        env: { ...process.env, ...env },
        stdio: mode === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        exitCode: 127,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
        timedOut: false,
        spawnError: true,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer = null;

    if (mode === "capture") {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > 512_000) stdout = stdout.slice(-256_000);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 512_000) stderr = stderr.slice(-256_000);
      });
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 2000);
      }, timeoutMs);
      timer.unref?.();
    }

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: 127,
        stdout,
        stderr: `${stderr}${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
        timedOut,
        spawnError: true,
      });
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        spawnError: false,
      });
    });
  });
}

export function formatCmd(command, args = []) {
  const parts = [command, ...args.map((a) => (/\s/.test(a) ? `"${a}"` : a))];
  return parts.join(" ");
}
