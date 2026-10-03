import { spawnSync } from "node:child_process";
import process from "node:process";

const phpFiles = [
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
