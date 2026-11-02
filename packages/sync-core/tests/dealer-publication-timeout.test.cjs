const assert = require("node:assert/strict");
const test = require("node:test");
const { PhpHostingSyncTransport } = require("../dist");

test("large dealer publication has a separate 45s transport budget while ordinary sync stays at 15s", async () => {
  const observed = [];
  const originalTimeout = AbortSignal.timeout;
  const transport = new PhpHostingSyncTransport({
    baseUrl: "https://example.test/yardimci-asistan",
    syncSecret: "synthetic-secret-for-test",
    clientId: "desktop-fixture",
    sourceEpoch: 1,
    fetchImpl: async (_url, init) => {
      const action = JSON.parse(init.body).action;
      assert.equal(init.method, "POST");
      observed.push({ action, abortSignal: Boolean(init.signal) });
      return Response.json({ ok: false, message: "fixture rejection" }, { status: 503 });
    }
  });
  const timeouts = [];
  try {
    AbortSignal.timeout = milliseconds => {
      timeouts.push(milliseconds);
      return originalTimeout(milliseconds);
    };
    assert.equal((await transport.getCapabilities()).ok, false);
    assert.equal((await transport.publishDealerAccess({
      sourceRevision: 2, idempotencyKey: "dealer-timeout-fixture",
      value: { version: 3, enabled: true, dealers: [], catalogs: [], order_history: [] }
    })).ok, false);
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
  assert.deepEqual(observed.map(x => x.action), ["capabilities", "publish_dealer_access"]);
  assert.ok(observed.every(x => x.abortSignal));
  assert.deepEqual(timeouts, [15_000, 45_000]);
});
