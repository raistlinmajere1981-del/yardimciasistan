import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, "assets/nexa/manifest.json"), "utf8"));

export function nexaRuntimePaths(surface) {
  const selected = surface === "desktop"
    ? manifest.assets.filter((asset) => Object.values(manifest.runtime.desktop).some((rule) => asset.usage === rule.usage && asset.dimensions.width === rule.width)
      || asset.usage.startsWith("habitat-") || asset.usage === "contact-shadow" || asset.usage === "micro-shadow")
    : manifest.assets.filter((asset) => Object.values(manifest.runtime.web).some((rule) => asset.usage === rule.usage
      && (rule.width === undefined || asset.dimensions.width === rule.width)
      && (rule.state === undefined || asset.state === rule.state)));
  return [...new Set(selected.map((asset) => asset.assetPath))];
}

/** Emit only the selected runtime files; never copy master/quality or PNG sources.
 * In dev, serve those same paths without writing tracked/generated snapshots. */
export function nexaAssetsPlugin(surface) {
  const paths = nexaRuntimePaths(surface);
  return {
    name: `nexa-assets-${surface}`,
    buildStart() {
      this.addWatchFile(resolve(root, "assets/nexa/manifest.json"));
      for (const path of paths) this.addWatchFile(resolve(root, path));
    },
    generateBundle() {
      for (const path of paths) this.emitFile({ type: "asset", fileName: path, source: readFileSync(resolve(root, path)) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0].replace(/^\//, "");
        if (!paths.includes(path)) return next();
        response.setHeader("Content-Type", path.endsWith(".svg") ? "image/svg+xml" : "image/webp");
        response.end(readFileSync(resolve(root, path)));
      });
    },
  };
}
