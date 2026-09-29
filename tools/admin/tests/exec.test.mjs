import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCmd, runCommand } from "../runners/exec.mjs";

test("başarılı komut exit 0 döner", async () => {
  const r = await runCommand({ command: process.execPath, args: ["-e", "process.exit(0)"], cwd: "repo", mode: "capture" });
  assert.equal(r.exitCode, 0);
  assert.equal(r.timedOut, false);
});

test("hata kodu gizlenmez", async () => {
  const r = await runCommand({ command: process.execPath, args: ["-e", "process.exit(3)"], cwd: "repo", mode: "capture" });
  assert.equal(r.exitCode, 3);
});

test("stdout/stderr kaybolmaz", async () => {
  const r = await runCommand({ command: process.execPath, args: ["-e", "console.log('out'); console.error('err')"], cwd: "repo", mode: "capture" });
  assert.match(r.stdout, /out/);
  assert.match(r.stderr, /err/);
});

test("olmayan komut spawn hatası verir", async () => {
  const r = await runCommand({ command: "yardimci-asistan-olmayan-komut", args: [], cwd: "repo", mode: "capture" });
  assert.equal(r.exitCode, 127);
  assert.equal(r.spawnError, true);
});

test("formatCmd boşluklu argümanları tırnaklar", () => {
  assert.equal(formatCmd("git", ["commit", "-m", "iki kelime"]), 'git commit -m "iki kelime"');
});


test("stream modu çıktıyı canlı yazarken logu da korur", async () => {
  let liveOut = "";
  let liveErr = "";
  const stdoutSink = { write(chunk) { liveOut += String(chunk); return true; } };
  const stderrSink = { write(chunk) { liveErr += String(chunk); return true; } };
  const r = await runCommand({
    command: process.execPath,
    args: ["-e", "console.log('canli-out'); console.error('canli-err')"],
    cwd: "repo",
    mode: "stream",
    stdoutSink,
    stderrSink
  });
  assert.equal(r.exitCode, 0);
  assert.match(liveOut, /canli-out/);
  assert.match(liveErr, /canli-err/);
  assert.match(r.stdout, /canli-out/);
  assert.match(r.stderr, /canli-err/);
});
