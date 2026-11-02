import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

export function runEffectStudio(repoRoot: string, action: "list" | "load" | "save" | "prepare" | "publish", args: unknown = {}) {
  const studioRoot = process.env.EFEKT_ATOLYESI_ROOT
    ? resolve(process.env.EFEKT_ATOLYESI_ROOT)
    : resolve(repoRoot, "..", "EfektAtolyesi");
  const script = join(studioRoot, "scripts", "admin-studio.mjs");
  return new Promise<unknown>((resolveResult, reject) => {
    const child = spawn("node", [script, action], {
      cwd: studioRoot,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => child.kill(), action === "publish" ? 120_000 : 25_000);
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 38 * 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 16_000) child.kill();
    });
    child.on("error", (error) => {
      if (!settled) { settled = true; clearTimeout(timer); reject(error); }
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const reply = JSON.parse(stdout) as { ok: boolean; result?: unknown; error?: string };
        if (!reply.ok) throw new Error(reply.error || "Atölye işlemi başarısız.");
        resolveResult(reply.result);
      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : stderr || "Atölye yanıtı okunamadı."));
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(args));
  });
}
