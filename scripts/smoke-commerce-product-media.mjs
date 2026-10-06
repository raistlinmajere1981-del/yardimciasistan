import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { getLocalElectronExecutable } from "./test-helpers/local-electron.mjs";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(getLocalElectronExecutable(), ["--no-sandbox", resolve("apps/desktop-app/scripts/fixtures/commerce-product-media.cjs")], { stdio: "inherit", env });
const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); });
process.exitCode = code ?? 1;
