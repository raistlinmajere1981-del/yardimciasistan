import { defineConfig } from "vite";
// @ts-expect-error Build tooling is an ESM JavaScript module shared with packaging.
import { nexaAssetsPlugin } from "../../scripts/nexa-assets.mjs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [nexaAssetsPlugin("web")],
  resolve: { alias: { "@yardimci-asistan/shared": fileURLToPath(new URL("../shared/index.ts", import.meta.url)) } },
  build: {
    lib: {
      entry: "src/entry.ts",
      name: "YardimciAsistanWidget",
      formats: ["iife"],
      fileName: () => "widget.js"
    },
    outDir: "dist",
    emptyOutDir: true
  }
});
