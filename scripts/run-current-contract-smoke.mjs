import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const mode = process.argv[2] ?? "";
const syncStatusStub = `      getSyncStatus: async () => ({
        enabled: true,
        clientId: "renderer-smoke",
        requestCursor: 0,
        acknowledgedCursor: 0,
        lastAttemptAt: "2026-07-18T12:35:00+03:00",
        lastSuccessAt: "2026-07-18T12:00:00+03:00",
        lastError: "",
        consecutiveFailures: 0,
        pendingJobs: 0,
        nextRetryAt: "",
        phase: "idle",
        message: "Senkron hazır."
      }),
      onSyncStatusChanged: () => () => {},`;

const definitions = {
  "automatic-sync": {
    source: "smoke-automatic-sync.mjs",
    replacements: [[
`  const inactiveAction = await getAndroidAction(inactiveActionId);
  assert.equal(inactiveAction.status, "failed");
  assert.equal(inactiveAction.error_message, "Cihaz masaüstünde pasifleştirilmiş.");`,
`  const inactiveSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  assert.equal(inactiveSummaryResponse.status, 200);
  const inactiveSummary = await inactiveSummaryResponse.json();
  assert.equal(inactiveSummary.approval_required, true);
  assert.deepEqual(inactiveSummary.actions, []);
  const pendingAfterInactiveResponse = await syncApi({ action: "pull_android_actions", limit: 50 });
  assert.equal(pendingAfterInactiveResponse.status, 200);
  const pendingAfterInactive = await pendingAfterInactiveResponse.json();
  assert.equal(pendingAfterInactive.actions.some((candidate) => candidate.id === inactiveActionId), false);`
    ]]
  },
  renderer: {
    source: "smoke-desktop-renderer.mjs",
    replacements: [
      [
`      getDashboardData: async () => currentDashboardData,
      getReportData: async (range) => {`,
`      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      onSyncStatusChanged: () => () => {},
      getReportData: async (range) => {`
      ],
      [
`      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),`,
`      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
${syncStatusStub}
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),`
      ],
      [
`      getDashboardData: async () => currentDashboardData,
      listTableOrders: async () => tableOrders,`,
`      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
${syncStatusStub}
      listTableOrders: async () => tableOrders,`
      ],
      [
`  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const notificationBell = page.getByRole("button", { name: /Bildirimler, \\d+ uyarı/ });`,
`  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const notificationBell = page.getByRole("button", { name: /Bildirimler, \\d+ uyarı/ });`
      ]
    ]
  }
};

const definition = definitions[mode];
if (!definition) {
  console.error("Kullanım: node scripts/run-current-contract-smoke.mjs <automatic-sync|renderer>");
  process.exit(2);
}

const sourcePath = join(process.cwd(), "scripts", definition.source);
const generatedPath = join(process.cwd(), "scripts", `.current-${mode}-${process.pid}.mjs`);
let source = readFileSync(sourcePath, "utf8");

for (const [before, after] of definition.replacements) {
  const first = source.indexOf(before);
  if (first < 0) {
    console.error(`Current-contract patch eşleşmedi: ${basename(sourcePath)}. Eski smoke dosyası değişmiş olabilir.`);
    process.exit(3);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    console.error(`Current-contract patch birden fazla eşleşti: ${basename(sourcePath)}.`);
    process.exit(4);
  }
  source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

try {
  writeFileSync(generatedPath, source);
  const result = spawnSync(process.execPath, [generatedPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false
  });
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  } else {
    process.exitCode = typeof result.status === "number" ? result.status : 1;
  }
} finally {
  unlinkSync(generatedPath);
}
