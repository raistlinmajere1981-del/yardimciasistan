import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  ["npm", ["run", "build:packages"]],
  ["npm", ["run", "build", "-w", "@yardimci-asistan/desktop-app"]],
  ["node", ["scripts/smoke-database-baseline.mjs"]],
  ["node", ["scripts/smoke-data-paths.mjs"]],
  ["node", ["scripts/smoke-desktop-logging-contract.mjs"]],
  ["node", ["scripts/smoke-birthday-foundation.mjs"]],
  ["node", ["scripts/smoke-business-capabilities.mjs"]],
  ["node", ["scripts/smoke-capability-runtime.mjs"]],
  ["node", ["scripts/smoke-setup-profile-contract.mjs"]],
  ["node", ["scripts/smoke-capability-surface-consistency.mjs"]],
  ["node", ["scripts/smoke-room-management-capability-contract.mjs"]],
  ["node", ["scripts/smoke-commerce-foundation.mjs"]],
  ["node", ["scripts/smoke-commerce-runtime.mjs"]],
  ["node", ["scripts/smoke-commerce-ipc-contract.mjs"]],
  ["node", ["scripts/smoke-market-workspace-contract.mjs"]],
  ["node", ["scripts/smoke-market-quick-sale-contract.mjs"]],
  ["node", ["scripts/smoke-market-quick-sale-session.mjs"]],
  ["node", ["scripts/smoke-market-sale-runtime.mjs"]],
  ["node", ["scripts/smoke-market-customer-credit-foundation.mjs"]],
  ["node", ["scripts/smoke-market-customer-credit-ui-contract.mjs"]],
  ["node", ["scripts/smoke-market-customer-credit-whatsapp.mjs"]],
  ["node", ["--test", "packages/shared/tests/barcode.test.cjs"]],
  ["node", ["scripts/smoke-market-barcode-input-contract.mjs"]],
  ["node", ["scripts/smoke-market-label-printer-contract.mjs"]],
  ["node", ["scripts/smoke-market-profile-registry.mjs"]],
  ["node", ["scripts/smoke-market-android-foundation.mjs"]],
  ["node", ["scripts/smoke-market-android-ui-contract.mjs"]],
  ["node", ["scripts/smoke-market-companion-desktop-inbox.mjs"]],
  ["node", ["scripts/smoke-market-live-scanner-contract.mjs"]],
  ["node", ["scripts/smoke-market-product-data-contract.mjs"]]
];

for (const [command, args] of checks) {
  console.log(`\n[foundation] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.error(`[foundation] Komut başlatılamadı: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[foundation] Kontrol başarısız oldu (exit ${result.status ?? "unknown"}).`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nmodular-foundation-check-ok");
