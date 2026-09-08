import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  ["npm", ["run", "build:packages"]],
  ["npm", ["run", "build", "-w", "@yardimci-asistan/desktop-app"]],
  ["npm", ["run", "quality:strict"]],
  ["node", ["scripts/smoke-business-capabilities.mjs"]],
  ["node", ["scripts/smoke-capability-runtime-v2.mjs"]],
  ["node", ["scripts/smoke-setup-capability-contract.mjs"]],
  ["node", ["scripts/smoke-capability-surface-consistency.mjs"]],
  ["node", ["scripts/smoke-room-management-capability-contract.mjs"]],
  ["node", ["scripts/smoke-commerce-foundation.mjs"]],
  ["node", ["scripts/smoke-commerce-runtime.mjs"]],
  ["node", ["scripts/smoke-commerce-ipc-contract.mjs"]],
  ["node", ["scripts/smoke-market-workspace-contract.mjs"]],
  ["node", ["scripts/smoke-market-quick-sale-contract.mjs"]],
  ["node", ["scripts/smoke-market-sale-runtime.mjs"]],
  ["node", ["scripts/smoke-market-customer-credit-foundation.mjs"]],
  ["node", ["scripts/smoke-market-barcode-input-contract.mjs"]],
  ["node", ["scripts/smoke-market-label-printer-contract.mjs"]],
  ["node", ["scripts/smoke-market-profile-availability.mjs"]],
  ["node", ["scripts/smoke-market-android-foundation.mjs"]],
  ["node", ["scripts/smoke-market-android-ui-contract.mjs"]],
  ["node", ["scripts/smoke-market-companion-desktop-inbox.mjs"]],
  ["node", ["scripts/smoke-market-live-scanner-contract.mjs"]]
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
