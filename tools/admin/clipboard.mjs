import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPORT_DIR } from "./lib/paths.mjs";

/**
 * Linux clipboard adapter: wl-copy → xclip → xsel.
 * Hiçbiri yoksa hata verilmez; rapor dosyaya yazılır ve yolu gösterilir.
 */
const ADAPTERS = [
  { name: "wl-copy", args: [] },
  { name: "xclip", args: ["-selection", "clipboard"] },
  { name: "xsel", args: ["--clipboard", "--input"] },
];

export function detectClipboard() {
  for (const a of ADAPTERS) {
    const check = spawnSync("sh", ["-c", `command -v ${a.name}`], { encoding: "utf8", timeout: 5000 });
    if (check.status === 0) return a;
  }
  return null;
}

export function copyText(text) {
  const adapter = detectClipboard();
  if (!adapter) return { ok: false, method: "", reason: "clipboard aracı yok (wl-copy/xclip/xsel)" };
  try {
    const r = spawnSync(adapter.name, adapter.args, { input: text, encoding: "utf8", timeout: 10000 });
    if (r.status === 0) return { ok: true, method: adapter.name, reason: "" };
    return { ok: false, method: adapter.name, reason: "kopyalama başarısız" };
  } catch (e) {
    return { ok: false, method: adapter.name, reason: e instanceof Error ? e.message : "hata" };
  }
}

export function saveReportFile(name, content) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "rapor";
  const path = join(REPORT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safe}.txt`);
  writeFileSync(path, content);
  return path;
}
