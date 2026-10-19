import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export function installDemoSite(root) {
  cpSync("test-site/landing", root, { recursive: true });
  const moduleRoot = join(root, "yardimci-asistan");
  const source = "firm-template/web-module";
  cpSync(source, moduleRoot, { recursive: true, filter: path => {
    const name = relative(source, path);
    return !name.startsWith("data/") && !name.startsWith("media/") && !name.includes(".local.")
      || ["data/.htaccess", "media/.htaccess"].includes(name);
  } });
  mkdirSync(join(moduleRoot, "data"), { recursive: true });
  writeFileSync(join(moduleRoot, "data/ai-conversations.json"), "[]\n");
  // Never inherit a local development database or provider settings in HTTP tests.
  for (const suffix of ["", "-wal", "-shm"]) rmSync(join(moduleRoot, "data/yardimci-asistan.sqlite" + suffix), { force: true });
  return moduleRoot;
}
