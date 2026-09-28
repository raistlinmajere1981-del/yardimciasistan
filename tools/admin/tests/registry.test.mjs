import assert from "node:assert/strict";
import { test } from "node:test";
import { TASK_CATEGORIES, TASKS, getTask, validateRegistry } from "../config/tasks.mjs";
import { SECTIONS } from "../ui/menu.mjs";

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
  for (const id of ["dev-check", "full-verify", "release-check", "android-release-flow", "bs-deploy-flow", "release-desktop-linux", "product-version-show", "product-version-set", "fresh-full"]) {
    assert.ok(getTask(id), id);
  }
  assert.equal(getTask("dev-check").stopOnError, false);
  assert.equal(getTask("release-desktop-linux").stopOnError, true);
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


test("Build / Release menüsü ürün sürümü işlemlerini gösterir", () => {
  const visible = new Set(SECTIONS.build.groups.flatMap(([, ids]) => ids));
  assert.ok(visible.has("product-version-show"));
  assert.ok(visible.has("product-version-set"));
});
