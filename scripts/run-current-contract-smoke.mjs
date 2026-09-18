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
    // The source smoke covers inactive-device visibility and reactivation directly.
    replacements: []
  },
  renderer: {
    source: "smoke-desktop-renderer.mjs",
    replacements: [
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
