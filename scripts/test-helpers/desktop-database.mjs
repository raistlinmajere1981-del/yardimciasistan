import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { DesktopDatabase } = require("../../apps/desktop-app/dist-electron/database.js");

export function createTemporaryDesktopDatabase(prefix) {
  const dataRoot = mkdtempSync(join(tmpdir(), prefix));
  const database = new DesktopDatabase({
    appPath: join(process.cwd(), "apps", "desktop-app"),
    userDataPath: dataRoot
  });

  return {
    database,
    cleanup() {
      database.close();
      rmSync(dataRoot, { recursive: true, force: true });
    }
  };
}
