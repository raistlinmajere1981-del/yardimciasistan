import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const { compareVersions } = require("@yardimci-asistan/shared");
const compiled = fs.readFileSync("apps/desktop-app/dist-electron/desktop-update-service.js", "utf8");
const helper = fs.readFileSync("apps/desktop-app/resources/updater/windows-install.ps1", "utf8");
const fixtures = [];
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
let assertions = 0;

function fixture({ platform = "win32", packaged = true, launch = "ready", currentVersion = "1.0.0" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "visible-updater-")); fixtures.push(root);
  const userData = path.join(root, "O'Brien & $(no-command) `Türkçe", "data");
  const updates = path.join(userData, "updates");
  const resources = path.join(root, "Program Files", "Yardımcı Asistan", "resources");
  const appPath = path.join(path.dirname(resources), "Yardımcı Asistan.exe");
  const systemRoot = path.join(root, "Windows");
  const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const source = path.join(resources, "updater", "windows-install.ps1");
  fs.mkdirSync(path.dirname(source), { recursive: true }); fs.writeFileSync(source, helper);
  fs.mkdirSync(path.dirname(powershell), { recursive: true }); fs.writeFileSync(powershell, "NOT AN EXECUTABLE");
  fs.writeFileSync(appPath, "NOT AN EXECUTABLE");
  const installerPath = path.join(updates, "downloads", "YardimciAsistan-Setup-2.0.0.exe");
  fs.mkdirSync(path.dirname(installerPath), { recursive: true }); fs.writeFileSync(installerPath, "verified fixture, never executable");
  const pending = { version: 1, targetVersion: "2.0.0", installerPath,
    sha256: createHash("sha256").update(fs.readFileSync(installerPath)).digest("hex"),
    size: fs.statSync(installerPath).size, downloadedAt: new Date().toISOString(), sourceBaseUrl: "https://example.invalid" };
  write(path.join(updates, "pending.json"), pending);
  write(path.join(updates, "settings.json"), { version: 1, customBaseUrl: "https://example.invalid/custom",
    autoCheckEnabled: false, lastCheckedAt: "", latestVersion: "2.0.0", latestNotes: ["preserve"] });
  const handlers = new Map(), calls = [], quits = [], alive = new Set([731, 4242]);
  const logs = { info: x => calls.push(["info", x.event]), warn: x => calls.push(["warn", x.event]), error: x => calls.push(["error", x.event]) };
  let fakeClock = Date.now();
  class Clock extends Date { static now() { return launch === "timeout" ? (fakeClock += 45_001) : Date.now(); } }
  const app = { isPackaged: packaged, getVersion: () => currentVersion, whenReady: async () => {}, requestSingleInstanceLock: () => true,
    quit: () => quits.push("quit"), relaunch: () => assert.fail("updater must never relaunch the old Electron executable") };
  const module = { exports: {} };
  runInNewContext(compiled, {
    exports: module.exports, Buffer, URL, AbortController, Date: Clock,
    process: { platform, arch: "x64", pid: 731, execPath: appPath, resourcesPath: resources, env: { SystemRoot: systemRoot },
      kill: (pid, signal) => { assert.equal(signal, 0); if (!alive.has(pid)) throw Object.assign(new Error("dead"), { code: "ESRCH" }); } },
    setTimeout: (action, delay) => delay === 250 ? (quits.push(action), { unref() {} }) : setTimeout(action, 0), clearTimeout,
    require: name => {
      if (name === "electron") return { app, BrowserWindow: { getAllWindows: () => [] },
        ipcMain: { removeHandler() {}, handle: (name, action) => handlers.set(name, action) },
        dialog: { showMessageBox: async options => { calls.push(["notification", options]); } } };
      if (name === "node:child_process") return { spawn: (exe, args, options) => {
        // This is the only launcher implementation used in the smoke. No real
        // child_process method can be reached, even with mocked win32 metadata.
        calls.push(["spawn", exe, args, options]);
        const child = Object.assign(new EventEmitter(), { pid: 4242, unref() {} });
        const request = read(args.at(-1));
        assert.equal(calls.some(([type]) => type === "backup"), true, "backup precedes launch");
        assert.equal(fs.readFileSync(args[args.indexOf("-File") + 1], "utf8"), helper);
        if (["ready", "ready-dead", "failed"].includes(launch)) write(path.join(options.cwd, "status.json"), {
          session: request.session, phase: launch.startsWith("ready") ? "ready" : "error"
        });
        if (launch === "dead" || launch === "ready-dead") alive.delete(4242);
        if (launch === "spawn-error") queueMicrotask(() => child.emit("error", new Error("spawn failed")));
        return child;
      } };
      if (name === "./data-maintenance") return { createUpdateSafetyBackup: (data, version) => {
        calls.push(["backup", data, version]); fs.mkdirSync(path.join(userData, "backups", "retained-safety"), { recursive: true });
        return { folderName: "retained-safety" };
      } };
      if (name === "./desktop-logger") return { desktopLog: logs };
      if (name === "@yardimci-asistan/shared") return { compareVersions };
      if (name.startsWith("node:")) return require(name);
      throw new Error(`unexpected dependency ${name}`);
    }
  }, { filename: "desktop-update-service.js" });
  const service = module.exports;
  service.registerDesktopUpdateIpcHandlers(() => userData, () => {});
  const status = () => handlers.get("update:getStatus")();
  const invoke = () => handlers.get("update:restartAndInstall")();
  const marker = () => read(path.join(updates, "installing.json"));
  return { root, resources, systemRoot, powershell, source, userData, updates, installerPath, pending, service, handlers, calls, quits, alive, app, invoke, status, marker };
}

try {
  {
    const f = fixture();
    const [a, b] = await Promise.all([f.invoke(), f.invoke()]);
    assert.equal(a.ok, true); assert.equal(b.ok, true);
    const spawns = f.calls.filter(([name]) => name === "spawn"); assert.equal(spawns.length, 1);
    const [, executable, args, options] = spawns[0];
    assert.equal(executable, f.powershell);
    assert.deepEqual(Array.from(args.slice(0, 10)), ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", path.join(options.cwd, "windows-install.ps1")]);
    assert.equal(args[10], "-RequestPath"); assert.equal(args.length, 12);
    assert.equal(options.shell, false); assert.equal(options.detached, true); assert.equal(options.stdio, "ignore");
    assert.equal(options.cwd.startsWith(f.resources), false); assert.ok(options.cwd.includes("O'Brien & $(no-command) `Türkçe"));
    assert.equal(f.marker().safetyBackupFolderName, "retained-safety"); assert.equal(f.marker().helperPid, 4242);
    assert.equal(read(path.join(options.cwd, "proceed.json")).session, f.marker().helperSession);
    assert.equal(fs.existsSync(path.join(f.updates, "pending.json")), false);
    assert.equal(f.status().lastResult?.kind, undefined, "spawn/readiness cannot claim success");
    assert.ok(f.quits.every(item => typeof item === "function"), "original app remains until readiness response is returned");
    f.quits[0](); assert.equal(f.quits.at(-1), "quit");
    // Reopening the old app exits before domain startup and preserves handoff.
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), true);
    assert.ok(fs.existsSync(f.installerPath)); assert.ok(fs.existsSync(path.join(f.updates, "installing.json")));
    assert.equal(f.status().lastResult?.kind, undefined);
    // A dead helper with a still running installer must not unlock the old app.
    const dir = path.dirname(args.at(-1)); f.alive.delete(4242); f.alive.add(5252);
    write(path.join(dir, "status.json"), { session: f.marker().helperSession, phase: "unverified", installerPid: 5252 });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), true);
    f.alive.delete(5252);
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), false);
    assert.equal(read(path.join(f.updates, "settings.json")).lastResult.kind, "error");
    assert.ok(fs.existsSync(path.join(f.userData, "backups", "retained-safety")));
    assertions++;
  }
  for (const launch of ["failed", "dead", "ready-dead", "spawn-error", "timeout"]) {
    const f = fixture({ launch }); assert.equal((await f.invoke()).ok, false);
    assert.equal(f.quits.length, 0); assert.ok(fs.existsSync(path.join(f.updates, "pending.json")));
    assert.equal(fs.existsSync(path.join(f.updates, "installing.json")), false);
    assert.equal(f.calls.filter(([name]) => name === "notification").length, 1);
    const [, , args] = f.calls.find(([name]) => name === "spawn");
    assert.equal(fs.existsSync(path.join(path.dirname(args.at(-1)), "proceed.json")), false, "late helper cannot install after handshake timeout");
    assert.ok(fs.existsSync(path.join(path.dirname(args.at(-1)), "cancel.json")));
    assertions++;
  }
  for (const corruption of ["hash", "size", "outside", "symlink", "missing-powershell", "missing-resource"]) {
    const f = fixture();
    if (corruption === "hash") fs.writeFileSync(f.installerPath, Buffer.alloc(f.pending.size, "x"));
    if (corruption === "size") fs.appendFileSync(f.installerPath, "x");
    if (corruption === "outside" || corruption === "symlink") {
      const outside = path.join(f.root, "Other.exe"); fs.copyFileSync(f.installerPath, outside);
      if (corruption === "outside") { f.pending.installerPath = outside; write(path.join(f.updates, "pending.json"), f.pending); }
      else { fs.unlinkSync(f.installerPath); fs.symlinkSync(outside, f.installerPath); }
    }
    if (corruption === "missing-powershell") fs.unlinkSync(f.powershell);
    if (corruption === "missing-resource") fs.unlinkSync(f.source);
    assert.equal((await f.invoke()).ok, false);
    assert.equal(f.calls.some(([name]) => name === "spawn" || name === "backup"), false, "integrity/platform checks precede helper and backup");
    assert.ok(fs.existsSync(f.installerPath)); assert.ok(fs.existsSync(path.join(f.updates, "pending.json")));
    assert.equal(f.quits.length, 0); assert.equal(read(path.join(f.updates, "settings.json")).lastResult.kind, "error"); assertions++;
  }
  for (const currentVersion of ["2.0.0", "2.1.0"]) {
    const f = fixture({ currentVersion });
    const session = "11111111-2222-4333-8444-555555555555";
    write(path.join(f.updates, "installing.json"), { ...f.pending, helperSession: session, helperPid: 4242, installStartedAt: new Date().toISOString() });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), false);
    assert.equal(read(path.join(f.updates, "settings.json")).lastResult.kind, "success");
    assert.equal(read(path.join(f.updates, "sessions", session, "success.json")).version, currentVersion);
    assert.equal(fs.existsSync(path.join(f.updates, "installing.json")), false);
    const settings = read(path.join(f.updates, "settings.json"));
    assert.equal(settings.autoCheckEnabled, false); assert.equal(settings.customBaseUrl, "https://example.invalid/custom");
    assert.deepEqual(settings.latestNotes, ["preserve"]); assert.equal(f.calls.some(([name]) => name === "spawn"), false); assertions++;
  }
  for (const input of [{ platform: "linux" }, { packaged: false }]) {
    const f = fixture(input);
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), false);
    assert.equal((await f.invoke()).ok, false);
    assert.equal(f.calls.length, 0); assert.ok(fs.existsSync(path.join(f.updates, "pending.json"))); assertions++;
  }
  {
    const f = fixture();
    f.service.registerDesktopUpdateIpcHandlers(() => f.userData, () => { throw new Error("locked"); });
    assert.throws(() => f.invoke(), /locked/); assert.equal(f.calls.length, 0); assertions++;
  }
  {
    const f = fixture(); f.alive.add(9898);
    write(path.join(f.updates, "preparing.json"), { pid: 9898 });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), true); assert.equal(f.calls.length, 0); assertions++;
  }
  {
    const f = fixture(); write(path.join(f.updates, "preparing.json"), { pid: 9898 });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), true);
    assert.equal(f.calls.filter(([name]) => name === "spawn").length, 1, "dead preparation lock is recoverable"); assertions++;
  }
  for (const currentVersion of ["1.0.0", "2.0.0"]) {
    const f = fixture({ currentVersion });
    write(path.join(f.updates, "installing.json"), { ...f.pending, installStartedAt: new Date().toISOString() });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), false);
    assert.equal(read(path.join(f.updates, "settings.json")).lastResult.kind, currentVersion === "2.0.0" ? "success" : "error");
    assert.equal(f.calls.some(([name]) => name === "spawn"), false); assertions++;
  }
  {
    const f = fixture({ currentVersion: "2.0.0" });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), false);
    assert.equal(fs.existsSync(path.join(f.updates, "pending.json")), false); assert.equal(f.calls.length, 0); assertions++;
  }
  {
    const f = fixture(); fs.unlinkSync(path.join(f.updates, "pending.json"));
    const result = await f.invoke();
    assert.equal(result.ok, false); assert.equal(result.message, "Kurulmaya hazır bir güncelleme bulunmuyor.");
    assert.equal(f.calls.length, 0); assertions++;
  }
  {
    const f = fixture(); const session = "11111111-2222-4333-8444-555555555555";
    write(path.join(f.updates, "installing.json"), { ...f.pending, helperSession: session, helperPid: 4242 });
    write(path.join(f.updates, "sessions", session, "status.json"), { session, phase: "error", outcome: "permission-cancelled" });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), false);
    const result = read(path.join(f.updates, "settings.json")).lastResult;
    assert.equal(result.kind, "error"); assert.match(result.message, /Windows yönetici izni iptal edildi/); assertions++;
  }
  {
    const f = fixture(); assert.equal((await f.invoke()).ok, true);
    const dir = path.join(f.updates, "sessions", f.marker().helperSession);
    write(path.join(dir, "status.json"), { session: "another-session", phase: "error" });
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), true);
    assert.ok(fs.existsSync(f.installerPath)); assertions++;
  }
  {
    const f = fixture(); f.app.requestSingleInstanceLock = () => false;
    assert.equal(await f.service.applyPendingDesktopUpdateAtStartup(f.userData), true);
    assert.equal(f.calls.length, 0); assert.ok(fs.existsSync(path.join(f.updates, "pending.json"))); assertions++;
  }
  {
    const f = fixture(); f.alive.add(9898); write(path.join(f.updates, "preparing.json"), { pid: 9898 });
    assert.equal((await f.invoke()).ok, false); assert.equal(f.calls.length, 0); assert.equal(f.quits.length, 0); assertions++;
  }
  // Execute the composition root: no SQLite/main import before async updater decision.
  for (const handoff of [true, false]) {
    let resolveHandoff, imported = false, maintenance = false, exited = false;
    const decision = new Promise(resolve => { resolveHandoff = resolve; });
    const module = { exports: {} };
    runInNewContext(fs.readFileSync("apps/desktop-app/dist-electron/main-entry.js", "utf8"), {
      exports: module.exports, process: { argv: [], env: {}, exit: () => { exited = true; throw new Error("expected handoff exit"); } },
      setImmediate() {},
      require: name => {
        if (name === "electron") return { app: { isPackaged: true, getVersion: () => "1.0.0", getPath: () => "/tmp", getAppPath: () => "/tmp", on() {}, whenReady: async () => {}, exit: () => {} } };
        if (name === "node:path") return path;
        if (name === "./desktop-update-service") return { applyPendingDesktopUpdateAtStartup: () => decision };
        if (name === "./desktop-logger") return { initializeDesktopLogging: () => null, desktopLog: { info() {}, warn() {}, error() {} } };
        if (name === "./data-paths.js") return { resolveDataRoot: () => "/tmp", resolveDatabasePath: () => "/tmp/db" };
        if (name === "./desktop-database-compatibility.js") return { inspectDesktopDatabaseCompatibility: () => ({ state: "current" }) };
        if (name === "./data-maintenance") return { applyPendingDataMaintenanceAtStartup: () => { maintenance = true; } };
        if (name === "./main") { imported = true; return {}; }
        return {};
      }
    });
    assert.equal(imported, false); assert.equal(maintenance, false);
    resolveHandoff(handoff); await new Promise(setImmediate);
    assert.equal(imported, !handoff); assert.equal(maintenance, !handoff); assert.equal(exited, handoff);
    assertions++;
  }
  // Linux cannot execute WPF/UAC. Keep a minimal source contract for the native
  // state machine and packaging alongside behavioral production-service tests.
  // Read/merge/schema-check with electron-builder itself. This never invokes
  // build(), downloads a runtime or generates installer/release artifacts.
  const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
  const { getConfig, validateConfiguration } = builderRequire("app-builder-lib/out/util/config/config");
  const { DebugLogger } = builderRequire("builder-util");
  for (const filename of ["electron-builder.yml", "electron-builder.win32.yml"]) {
    const config = await getConfig(path.resolve("apps/desktop-app"), filename, null);
    await validateConfiguration(config, new DebugLogger(false));
    assert.ok(config.win.extraResources.some(resource => resource.from === "resources/updater" && resource.to === "updater" && resource.filter.includes("windows-install.ps1")));
    assert.equal(config.nsis.include, "resources/updater/installer.nsh");
    assert.equal(config.nsis.perMachine, true); assert.equal(config.nsis.oneClick, false);
  }
  assert.match(read("apps/desktop-app/package.json").scripts["pack:win32"], /--ia32.*electron-builder\.win32\.yml/);
  assert.ok(fs.readFileSync("apps/desktop-app/resources/updater/windows-install.ps1").subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), "Windows PowerShell 5.1 needs the UTF-8 BOM for Turkish copy");
  assert.ok(helper.includes('Add_ContentRendered'));
  assert.ok(helper.includes("Status 'ready'"));
  for (const phase of ["preparing", "permission", "installing", "finishing", "error", "unverified"]) assert.ok(helper.includes(`'${phase}'`));
  assert.ok(helper.indexOf('while (-not $parent.HasExited)') < helper.indexOf('Start-Process -FilePath $installerPath'));
  assert.ok(helper.indexOf('ComputeHash($stream)') < helper.indexOf('Start-Process -FilePath $installerPath'));
  assert.ok(helper.includes("@('--updated', '/S', '--force-run') -Verb RunAs -PassThru"));
  assert.ok(helper.indexOf('if ($installer.ExitCode -ne 0)') < helper.indexOf('Start-Process -FilePath $appPath'));
  assert.ok(helper.includes('AddHours(4)')); assert.ok(helper.includes('AddMinutes(2)'));
  assert.ok(helper.includes('NativeErrorCode -eq 1223')); assert.ok(helper.includes('$event.Cancel = $true'));
  assert.ok(helper.includes('IsIndeterminate="True"')); assert.doesNotMatch(helper, /(?:Value|Maximum)="100"|Stop-Process|taskkill|Invoke-Expression/);
  const nsis = fs.readFileSync("apps/desktop-app/resources/updater/installer.nsh", "utf8");
  assert.ok(nsis.includes('!macro customCheckAppRunning')); assert.ok(nsis.includes('SetErrorLevel 2'));
  assert.match(nsis, /nsProcess::_FindProcess\s+\/NOUNLOAD/, 'NSIS plugin exports _FindProcess, not FindProcess');
  assert.doesNotMatch(nsis, /nsProcess::FindProcess\s/, 'Do not call nonexistent NSIS export');
  assert.doesNotMatch(nsis, /KILL_PROCESS|taskkill|Stop-Process/);
  console.log(`desktop-visible-updater-ok: ${assertions} behavioral scenarios; native helper and x64/x86 configuration contracts`);
} finally {
  for (const root of fixtures) fs.rmSync(root, { recursive: true, force: true });
}
