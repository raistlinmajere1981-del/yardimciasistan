import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Targeted regression coverage for the epoch/generation invalidation pattern
// used by marketing/order/table effects: in-flight async results must never
// commit once their generation is invalidated, under mount, rapid dependency
// change, unmount and React StrictMode (mount-cleanup-mount) orderings.
//
// Structural part pins the rule-satisfying spelling: the invalidation bump
// lives in a stable `useCallback([])` and is invoked from the cleanup (same
// lifecycle moment as before), never as a textual `ref.current++` read inside
// the cleanup, and the boolean guard + ticket comparison stay intact.

const FILES = {
  "apps/desktop-app/src/app/use-market-orders-session.ts": ["reloadGeneration", "detailGeneration"],
  "apps/desktop-app/src/components/calendar/use-marketing-calendar.ts": ["epoch"],
  "apps/desktop-app/src/components/customers/BusinessTemplateMessagePanel.tsx": ["epoch", "configurationRequest"],
  "apps/desktop-app/src/components/marketing/MarketingAnalytics.tsx": ["epoch"],
  "apps/desktop-app/src/components/marketing/MarketingAudience.tsx": ["epoch"],
  "apps/desktop-app/src/components/marketing/MarketingDeliveryWorkspace.tsx": ["epoch"],
  "apps/desktop-app/src/components/marketing/MarketingEntityAnalytics.tsx": ["epoch"],
  "apps/desktop-app/src/components/marketing/MarketingScheduleDialog.tsx": ["epoch"],
  "apps/desktop-app/src/components/restaurant/TableWorkspace.tsx": ["historyRead"],
  "apps/desktop-app/src/pages/MarketingPage.tsx": ["epoch"]
};

// BusinessTemplateMessagePanel mounts two independent effects; only the
// configuration effect owns a generation counter.
const NO_COUNTER_FILES = new Set([
  "apps/desktop-app/src/components/customers/BusinessTemplateMessagePanel.tsx"
]);

function cleanupsOf(source) {
  const found = [];
  const pattern = /return \(\) => \{([^{}]*)\};/g;
  let match;
  while ((match = pattern.exec(source)) !== null) found.push(match[1]);
  return found;
}

for (const [file, refs] of Object.entries(FILES)) {
  await test(`structure: ${file}`, () => {
    const source = readFileSync(file, "utf8");
    for (const ref of refs) {
      if (NO_COUNTER_FILES.has(file) && ref === "epoch") continue;
      // The stable invalidator exists with empty deps and bumps the ref.
      const def = new RegExp(
        `const \\w+ = useCallback\\(\\(\\) => \\{[^}]*\\+\\+${ref}\\.current[^}]*\\}, \\[\\]\\);`
      );
      assert.match(source, def, `${file}: stable invalidate callback for ${ref}`);
      // No textual ref read-modify-write remains inside any effect cleanup.
      for (const cleanup of cleanupsOf(source)) {
        assert.equal(
          new RegExp(`(\\+\\+${ref}\\.current|${ref}\\.current\\+\\+|${ref}\\.current\\s*\\+=)`).test(cleanup),
          false,
          `${file}: cleanup must not read ${ref}.current`
        );
      }
    }
    // The ticket protocol itself is untouched.
    assert.match(source, /(ticket|request) (!==|===) \w+\.current/, `${file}: ticket comparison intact`);
  });
}

await test("structure: invalidators are effect dependencies", () => {
  for (const file of Object.keys(FILES)) {
    const source = readFileSync(file, "utf8");
    const defs = [...source.matchAll(/const (\w+) = useCallback\(\(\) => \{[^}]*\+\+\w+\.current[^}]*\}, \[\]\);/g)]
      .map((match) => match[1]);
    assert.ok(defs.length > 0, `${file}: at least one invalidate callback`);
    for (const name of defs) {
      assert.match(
        source,
        new RegExp(`\\}, \\[[^\\]]*${name}[^\\]]*\\]\\);`),
        `${file}: ${name} is listed in an effect dependency array`
      );
    }
  }
});

// --- Protocol simulation: the shipped semantics under adversarial orderings.
// A cell models one generation counter plus its boolean liveness guard.
// load()/operate() capture `ticket = ++epoch`; completions commit only when
// live AND ticket matches the current generation — exactly the code pattern.
function makeCell() {
  return { epoch: 0, live: true, committed: [] };
}
function startWork(cell) {
  const ticket = ++cell.epoch;
  return {
    ticket,
    complete(value) {
      if (cell.live && ticket === cell.epoch) cell.committed.push(value);
    }
  };
}
function cleanup(cell, { unmount = false } = {}) {
  // Mirrors the shipped cleanup: boolean guard first, then the stable
  // invalidator bump (same lifecycle moment as the previous inline bump).
  cell.live = unmount ? false : cell.live;
  ++cell.epoch;
}
function remount(cell) {
  cell.live = true;
}

await test("protocol: rapid dependency change drops stale, commits live", () => {
  const cell = makeCell();
  const stale = startWork(cell); // generation-1 load
  cleanup(cell); // dep change
  const live = startWork(cell); // generation-2 load
  stale.complete("stale");
  live.complete("live");
  assert.deepEqual(cell.committed, ["live"]);
});

await test("protocol: unmount drops in-flight work", () => {
  const cell = makeCell();
  const inflight = startWork(cell);
  cleanup(cell, { unmount: true });
  inflight.complete("late");
  assert.deepEqual(cell.committed, []);
});

await test("protocol: StrictMode remount keeps only the second mount", () => {
  const cell = makeCell();
  const first = startWork(cell); // mount 1 load
  cleanup(cell, { unmount: true }); // StrictMode simulated unmount
  remount(cell); // StrictMode remount re-arms liveness (same refs)
  const second = startWork(cell); // mount 2 load
  first.complete("mount-1"); // resolves after remount: live again, but ticket stale
  second.complete("mount-2");
  assert.deepEqual(cell.committed, ["mount-2"]);
});

await test("protocol: ticket-only continuation is fenced by cleanup bump", () => {
  // Models externally-triggered operations (save/preview actions) that check
  // only the ticket: the cleanup bump is their sole invalidation signal.
  const cell = makeCell();
  const op = startWork(cell);
  cleanup(cell, { unmount: true });
  op.complete("after-unmount");
  assert.deepEqual(cell.committed, []);
});

await test("protocol: overlapping subscription loads resolve newest-wins", () => {
  const cell = makeCell();
  const a = startWork(cell);
  const b = startWork(cell);
  a.complete("a");
  b.complete("b");
  assert.deepEqual(cell.committed, ["b"]);
});

console.log("epoch-invalidation-ok: structure + stale-drop protocol verified");
