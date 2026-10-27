import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export function installDemoSite(root, { httpApi = false } = {}) {
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
  if (httpApi) {
    // Multi-worker HTTP fixtures use their actual same-origin account URL. The
    // shipped CLI adapter correctly rejects that HTTP URL outside cli-server.
    const config = join(root, "deneme/site/config.php");
    const sourceConfig = readFileSync(config, "utf8");
    const localTransport = "'local_api_root' => dirname(__DIR__, 2) . '/yardimci-asistan'";
    if (!sourceConfig.includes(localTransport)) throw new Error("Demo fixture transport config changed");
    writeFileSync(config, sourceConfig.replace(localTransport, "'local_api_root' => null"));
  }
  return moduleRoot;
}
