import { spawnSync } from "node:child_process";
import process from "node:process";

const phpFiles = [
  "firm-template/web-module/api/request.php",
  "firm-template/web-module/api/sync.php",
  "firm-template/web-module/api/menu.php",
  "firm-template/web-module/api/chat.php",
  "firm-template/web-module/lib/storage.php",
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
