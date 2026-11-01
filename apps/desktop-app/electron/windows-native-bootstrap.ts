import { app } from "electron";
import { join } from "node:path";

// This entry must run before main-entry's static dependency graph loads the codec.
if (app.isPackaged && process.platform === "win32") {
  if (process.arch !== "x64" && process.arch !== "ia32") throw new Error("Desteklenmeyen Windows mimarisi.");
  process.env.NAPI_RS_NATIVE_LIBRARY_PATH = join(process.resourcesPath, "native-image", `image.win32-${process.arch}-msvc.node`);
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./main-entry");
