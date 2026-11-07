import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

function sitePhpFiles(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sitePhpFiles(`${directory}/${entry.name}`) : entry.name.endsWith(".php") ? [`${directory}/${entry.name}`] : []); }
const phpFiles = [
  "firm-template/web-module/lib/public-localization.php",
  "infrastructure/hosting/instagram-staging-log-filter.php",
  ...sitePhpFiles("test-site/landing"),
  ...sitePhpFiles("test-site/market-pilot"),
  "firm-template/web-module/lib/business-map.php",
  "firm-template/web-module/lib/business-ai-policy.php",
  "firm-template/web-module/lib/cloudflare-ai.php",
  "firm-template/web-module/api/business.php",
  "firm-template/web-module/lib/marketing.php",
  "firm-template/web-module/api/marketing.php",
  "firm-template/web-module/api/marketing-media.php",
  "firm-template/web-module/api/instagram-media.php",
  "firm-template/web-module/lib/instagram-staging.php",
  "firm-template/web-module/api/whatsapp-webhook.php",
  "firm-template/web-module/api/business-messaging-status.php",
  "firm-template/web-module/lib/business-messaging.php",
  ...sitePhpFiles("firm-template/web-module/api/account"),
  ...["customer-account", "customer-account-store", "customer-account-mail", "customer-account-mail-queue", "customer-account-oauth", "customer-account-endpoint"].map(name => `firm-template/web-module/lib/${name}.php`),
  "firm-template/web-module/api/dealer/session.php",
  "firm-template/web-module/api/dealer/logout.php",
  "firm-template/web-module/lib/dealer-access.php",
  "firm-template/web-module/lib/dealer-order.php",
  "firm-template/web-module/api/dealer/catalog.php",
  "firm-template/web-module/api/dealer/checkout-quote.php",
  "firm-template/web-module/api/dealer/order.php",
  "firm-template/web-module/api/request.php",
  "firm-template/web-module/api/order.php",
  "firm-template/web-module/api/checkout-quote.php",
  "firm-template/web-module/api/order-payment.php",
  "firm-template/web-module/api/catalog.php",
  "firm-template/web-module/api/sync.php",
  "firm-template/web-module/api/android.php",
  "firm-template/web-module/lib/android-companion-projection.php",
  "firm-template/web-module/api/menu.php",
  "firm-template/web-module/api/chat.php",
  "firm-template/web-module/api/availability.php",
  "firm-template/web-module/api/availability-sync.php",
  "firm-template/web-module/api/stock-image-analysis.php",
  "firm-template/web-module/api/identity-image-analysis.php",
  "firm-template/web-module/api/audio-transcribe.php",
  "firm-template/web-module/lib/audio-transcription.php",
  "firm-template/web-module/lib/storage.php",
  "firm-template/web-module/lib/online-order.php",
  ...["commerce-quote", "commerce-checkout", "commerce-order-payment", "commerce-mail", "commerce-mail-worker"].map(name => `firm-template/web-module/lib/${name}.php`),
  "firm-template/web-module/lib/online-catalog.php",
  "firm-template/web-module/lib/public-request-guard.php",
  "firm-template/web-module/lib/public-request-submission.php",
  "firm-template/web-module/lib/public-request-policy.php",
  "firm-template/web-module/lib/request-documents.php",
  "firm-template/web-module/lib/public-room-availability.php",
  "firm-template/web-module/lib/public-room-availability-intent.php",
  "firm-template/web-module/lib/public-room-availability-storage.php",
  "firm-template/web-module/lib/stock-image-analysis.php",
  "firm-template/web-module/lib/identity-image-analysis.php",
  "firm-template/web-module/config/ai.php"
];

let failed = false;

for (const file of phpFiles) {
  const result = spawnSync("php", ["-l", file], {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (output) {
    console.log(output);
  }

  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
