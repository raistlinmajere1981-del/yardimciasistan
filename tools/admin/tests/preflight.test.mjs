import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPreflight, runPreflight } from "../runners/preflight.mjs";

test("basic preflight repo içinde OK döner", () => {
  const r = runPreflight("basic");
  assert.equal(r.suite, "basic");
  assert.ok(r.checks.length >= 3);
  const repo = r.checks.find((c) => c.name.startsWith("Doğru repo"));
  assert.ok(repo?.ok, JSON.stringify(r.checks));
  assert.equal(r.ok, r.checks.filter((c) => c.required && !c.ok).length === 0);
});

test("bilinmeyen suite boş OK döner", () => {
  const r = runPreflight("yok-boyle-suite");
  assert.equal(r.ok, true);
  assert.deepEqual(r.checks, []);
});

test("formatPreflight işaretleri içerir", () => {
  const text = formatPreflight({ checks: [{ name: "x", ok: true, detail: "d", required: true }, { name: "y", ok: false, detail: "", required: true }] });
  assert.match(text, /\[OK\]/);
  assert.match(text, /\[ERR\]/);
});
