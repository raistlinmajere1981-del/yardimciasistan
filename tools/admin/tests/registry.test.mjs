import assert from "node:assert/strict";
import { test } from "node:test";
import { TASK_CATEGORIES, TASKS, getTask, validateRegistry } from "../config/tasks.mjs";
import { getSiteProfiles } from "../config/sites.mjs";
import { SECTIONS } from "../ui/menu.mjs";

test("site profilleri canonical installation metadata'sını kullanır", () => {
  const sites = new Map(getSiteProfiles().map((site) => [site.id, site]));

  assert.equal(sites.get("ya")?.publicUrl, "https://yardimciasistan.alwaysdata.net/yardimci-asistan");
  assert.equal(sites.get("ya")?.credentialRef, "alwaysdata-main");
  assert.match(sites.get("ya")?.versionEndpoint ?? "", /\/api\/version\.php$/);

  assert.equal(sites.get("landing")?.publicUrl, "https://yardimciasistan.alwaysdata.net");
  assert.equal(sites.get("support")?.credentialRef, "alwaysdata-main");

  assert.equal(sites.get("blacksea")?.webModuleUrl, "https://blackseapansiyon.com/yardimci-asistan");
  assert.equal(sites.get("blacksea")?.credentialRef, "blacksea-natro");
});

test("registry geçerli: hata yok, id'ler benzersiz", () => {
  assert.deepEqual(validateRegistry(), []);
  const ids = TASKS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("grup/workflow adımları tanımlı tasklara işaret eder", () => {
  for (const t of TASKS) {
    for (const s of t.steps ?? []) {
      assert.ok(getTask(s), `${t.id} -> tanımsız adım ${s}`);
    }
  }
});

test("task'lar spawn-safe: command string, args dizi, shell yok", () => {
  for (const t of TASKS) {
    if (t.kind !== "task") continue;
    assert.equal(typeof t.command, "string", t.id);
    assert.ok(Array.isArray(t.args), t.id);
    assert.ok(!("shell" in t), `${t.id}: shell alanı yasak`);
    assert.ok(t.args.every((a) => typeof a === "string"), `${t.id}: arg string olmalı`);
  }
});

test("kategoriler ve site/cwd tutarlılığı", () => {
  for (const t of TASKS) {
    assert.ok(TASK_CATEGORIES[t.category], `${t.id}: geçersiz kategori`);
    if (t.kind === "task" && t.site === "blacksea") assert.equal(t.cwd, "blacksea", t.id);
    if ((t.kind === "group" || t.kind === "workflow") && t.site === "blacksea") {
      for (const s of t.steps) {
        const step = getTask(s);
        const leaf = step.kind === "task" ? step : null;
        if (leaf && leaf.site === "blacksea") assert.equal(leaf.cwd, "blacksea", `${t.id} -> ${s}`);
      }
    }
  }
});

test("temel preset ve akışlar mevcut", () => {
  for (const id of ["verify-dev", "verify-domain", "verify-full", "verify-pre-main", "verify-release", "android-release-flow", "bs-deploy-flow", "release-desktop-linux", "release-desktop-all", "pack-desktop-all", "landing-deploy-downloads", "product-version-show", "product-version-set", "fresh-full"]) {
    assert.ok(getTask(id), id);
  }
  assert.equal(getTask("verify-full").kind, "task");
  assert.equal(getTask("verify-pre-main").kind, "task");
  assert.equal(getTask("release-desktop-linux").stopOnError, true);
  assert.equal(getTask("release-desktop-all").stopOnError, true);
});

test("tehlikeli işlemlerde confirm/impact açıklaması var", () => {
  for (const id of ["ya-deploy", "ya-deploy-fresh", "bs-deploy-update", "fresh-desktop-data", "android-uninstall"]) {
    const t = getTask(id);
    assert.ok(t.confirm, `${id}: confirm gerekli`);
  }
  for (const id of ["fresh-lab-once", "fresh-desktop-data", "fresh-artifacts"]) {
    assert.ok(getTask(id).impact?.length > 0, `${id}: impact açıklaması gerekli`);
  }
});


test("Build / Release menüsü sürüm ve birleşik paketleme işlemlerini gösterir", () => {
  const visible = new Set(SECTIONS.build.groups.flatMap(([, ids]) => ids));
  assert.ok(visible.has("product-version-show"));
  assert.ok(visible.has("product-version-set"));
  assert.ok(visible.has("pack-desktop-all"));
  assert.ok(visible.has("release-desktop-all"));
});

test("Landing deploy seçenekleri güncel kurulum dosyalarını yayınlayabilir", () => {
  const dry = getTask("landing-deploy-downloads-dry");
  const deploy = getTask("landing-deploy-downloads");
  assert.deepEqual(dry.args.slice(-2), ["--dry-run", "--with-downloads"]);
  assert.deepEqual(deploy.args.slice(-2), ["--yes", "--with-downloads"]);
  assert.ok(deploy.confirm);
});


test("Kontroller menüsü yalnız canonical verify presetlerini gösterir", () => {
  const visible = new Set(SECTIONS.checks.groups.flatMap(([, ids]) => ids));
  for (const id of ["verify-dev", "verify-domain", "verify-full", "verify-pre-main", "verify-release"]) {
    assert.ok(visible.has(id), id);
  }
  for (const stale of ["pilot-check", "pilot-check-full", "check-linux", "pre-main", "dev-check", "full-verify", "release-check"]) {
    assert.equal(visible.has(stale), false, stale);
  }
});


test("canonical verify taskları açıklamalı ve canlı stream modunda", () => {
  for (const id of ["verify-dev", "verify-domain", "verify-check", "verify-full", "verify-pre-main", "verify-release", "verify-list", "verify-plan"]) {
    const task = getTask(id);
    assert.ok(task.description, `${id}: kısa açıklama gerekli`);
    assert.equal(task.mode, "stream", `${id}: canlı çıktı stream modunda olmalı`);
  }
});
