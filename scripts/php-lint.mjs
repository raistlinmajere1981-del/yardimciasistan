import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

function sitePhpFiles(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sitePhpFiles(`${directory}/${entry.name}`) : entry.name.endsWith(".php") ? [`${directory}/${entry.name}`] : []); }
const phpFiles = [
  ...sitePhpFiles("test-site/landing"),
  "firm-template/web-module/lib/website-navigation.php",
  "firm-template/web-module/lib/marketing.php",
  "firm-template/web-module/api/marketing.php",
  "firm-template/web-module/api/marketing-media.php",
  "firm-template/web-module/api/instagram-media.php",
  "firm-template/web-module/lib/instagram-staging.php",
  "firm-template/web-module/duyurular/index.php",
  "firm-template/web-module/api/whatsapp-webhook.php",
  "firm-template/web-module/api/business-messaging-status.php",
  "firm-template/web-module/lib/business-messaging.php",
  "firm-template/web-module/bayi/index.php",
  "firm-template/web-module/api/dealer/claim.php",
  "firm-template/web-module/api/dealer/session.php",
  "firm-template/web-module/api/dealer/logout.php",
  "firm-template/web-module/lib/dealer-access.php",
  "firm-template/web-module/lib/dealer-order.php",
  "firm-template/web-module/api/dealer/catalog.php",
  "firm-template/web-module/api/dealer/order.php",
  "firm-template/web-module/magaza/index.php",
  "firm-template/web-module/api/request.php",
  "firm-template/web-module/api/order.php",
  "firm-template/web-module/api/catalog.php",
  "firm-template/web-module/api/sync.php",
  "firm-template/web-module/api/menu.php",
  "firm-template/web-module/api/chat.php",
  "firm-template/web-module/api/availability.php",
  "firm-template/web-module/api/availability-sync.php",
  "firm-template/web-module/api/stock-image-analysis.php",
  "firm-template/web-module/api/identity-image-analysis.php",
  "firm-template/web-module/lib/storage.php",
  "firm-template/web-module/lib/online-order.php",
  "firm-template/web-module/lib/online-catalog.php",
  "firm-template/web-module/lib/public-request-guard.php",
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
