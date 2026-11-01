import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studioRoot = process.env.EFEKT_ATOLYESI_ROOT
  ? resolve(process.env.EFEKT_ATOLYESI_ROOT)
  : resolve(adminRoot, "../../../EfektAtolyesi");
const output = join(adminRoot, "public", "effect-studio");
const required = ["index.html", "styles.css", "src", "assets", "examples"];
for (const name of required) {
  if (!existsSync(join(studioRoot, name))) throw Error("Efekt Atölyesi eksik: " + name);
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const name of required) cpSync(join(studioRoot, name), join(output, name), { recursive: true });
console.log("effect-studio assets synced");
