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
const capabilitySnapshotStub = `      getBusinessCapabilitySnapshot: async () => {
        const enabledCapabilities = [
          "core.customers",
          "core.tasks",
          "core.calendar",
          "core.notifications",
          "core.finance",
          "core.reports",
          "core.web",
          "core.sync",
          "core.backups",
          "core.devices",
          ...(setupData.modules.rooms ? [
            "accommodation.rooms",
            "accommodation.reservations",
            "accommodation.stays",
            "accommodation.folio"
          ] : []),
          ...(setupData.modules.tables ? [
            "food_service.tables",
            "food_service.reservations",
            "food_service.orders",
            "food_service.menu",
            "commerce.catalog",
            "commerce.sales"
          ] : []),
          ...(setupData.modules.qrMenu ? ["channel.qr_menu", "commerce.inventory"] : []),
          ...(setupData.modules.whatsapp ? ["service.whatsapp"] : []),
          ...(setupData.aiEnabled ? ["service.ai"] : []),
          ...(setupData.modules.android ? ["service.android"] : [])
        ];
        return {
          businessId: "renderer-smoke-business",
          businessType: setupData.businessType,
          profileId: setupData.businessType,
          capabilities: enabledCapabilities.map((capability) => ({
            capability,
            enabled: true,
            source: capability.startsWith("core.") ? "system" : "profile",
            updatedAt: "2026-07-18T12:00:00+03:00"
          })),
          enabledCapabilities
        };
      },`;

const definitions = {
  "automatic-sync": {
    source: "smoke-automatic-sync.mjs",
    replacements: [{
      before: `  const inactiveAction = await getAndroidAction(inactiveActionId);
  assert.equal(inactiveAction.status, "failed");
  assert.equal(inactiveAction.error_message, "Cihaz masaüstünde pasifleştirilmiş.");`,
      after: `  const inactiveSummaryResponse = await syncApi({ action: "android_summary", device_id: "android-auto-smoke" });
  assert.equal(inactiveSummaryResponse.status, 200);
  const inactiveSummary = await inactiveSummaryResponse.json();
  assert.equal(inactiveSummary.approval_required, true);
  assert.deepEqual(inactiveSummary.actions, []);
  const pendingAfterInactiveResponse = await syncApi({ action: "pull_android_actions", limit: 50 });
  assert.equal(pendingAfterInactiveResponse.status, 200);
  const pendingAfterInactive = await pendingAfterInactiveResponse.json();
  assert.equal(pendingAfterInactive.actions.some((candidate) => candidate.id === inactiveActionId), false);`
    }]
  },
  renderer: {
    source: "smoke-desktop-renderer.mjs",
    replacements: [
      {
        before: `    window.yardimciDesktop = {`,
        after: `    window.yardimciDesktop = {\n${capabilitySnapshotStub}`,
        replaceAll: true
      },
      {
        before: `      getDashboardData: async () => currentDashboardData,
      getReportData: async (range) => {`,
        after: `      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      onSyncStatusChanged: () => () => {},
      getReportData: async (range) => {`,
        replaceAll: true
      },
      {
        before: `      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),`,
        after: `      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
${syncStatusStub}
      saveInitialSetup: async () => ({ ok: false, message: "smoke" }),`,
        replaceAll: true
      },
      {
        before: `      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
      saveInitialSetup: async (input) => {`,
        after: `      getDashboardData: async () => dashboardData,
      getSetupData: async () => setupData,
${syncStatusStub}
      saveInitialSetup: async (input) => {`
      },
      {
        before: `      getDashboardData: async () => currentDashboardData,
      listTableOrders: async () => tableOrders,`,
        after: `      getDashboardData: async () => currentDashboardData,
      getSetupData: async () => setupData,
${syncStatusStub}
      getRoomFolioData: async () => ({
        generatedAt: "",
        rooms: [],
        activeStays: [],
        folios: [],
        menuCategories: [],
        menuItems: []
      }),
      listTableOrders: async () => tableOrders,`,
        replaceAll: true
      },
      {
        before: `    page.locator(".setup-ai-actions.is-inline > button").boundingBox()`,
        after: `    page.getByRole("button", { name: "Bağlantıyı Dene", exact: true }).boundingBox()`
      },
      {
        before: `  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".nav-item")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "AI Yardımcı", exact: true })).toHaveCount(0);`,
        after: `  await page.getByRole("button", { name: "Ana Ekran", exact: true }).click();
  expect(await page.locator(".content").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator(".nav-item")).toHaveCount(9);
  await expect(page.getByRole("button", { name: "AI Yardımcı", exact: true })).toHaveCount(0);`
      },
      {
        before: `  await page.getByRole("button", { name: "Raporlar", exact: true }).click();`,
        through: `  await page.setViewportSize({ width: 1440, height: 1000 });`,
        after: `  await page.getByRole("button", { name: "Kasa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kasa", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByText("Bugün Gelen", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugün Çıkan", { exact: true })).toBeVisible();
  await expect(page.getByText("Bugünkü Fark", { exact: true })).toBeVisible();
  await expect(page.getByText("Bekleyen Alacak", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gelir Ekle", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gider Ekle", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });`
      }
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

for (const replacement of definition.replacements) {
  const { before, after, replaceAll = false, through = "" } = replacement;
  const first = source.indexOf(before);
  if (first < 0) {
    console.error(`Current-contract patch eşleşmedi: ${basename(sourcePath)}. Eski smoke dosyası değişmiş olabilir.`);
    process.exit(3);
  }

  if (replaceAll) {
    source = source.split(before).join(after);
    continue;
  }

  if (source.indexOf(before, first + before.length) >= 0) {
    console.error(`Current-contract patch birden fazla eşleşti: ${basename(sourcePath)}.`);
    process.exit(4);
  }

  if (through) {
    const end = source.indexOf(through, first + before.length);
    if (end < 0) {
      console.error(`Current-contract patch bitişi eşleşmedi: ${basename(sourcePath)}.`);
      process.exit(5);
    }
    source = `${source.slice(0, first)}${after}${source.slice(end + through.length)}`;
    continue;
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
