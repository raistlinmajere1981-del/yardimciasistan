import { defineConfig, type PluginOption } from "vite";
// @ts-expect-error Build tooling is an ESM JavaScript module shared with packaging.
import { nexaAssetsPlugin } from "../../scripts/nexa-assets.mjs";
import { fileURLToPath } from "node:url";

const nexaPlugin = nexaAssetsPlugin as (surface: "desktop" | "web") => PluginOption;

export default defineConfig({
  plugins: [nexaPlugin("web")],
  resolve: { alias: { "@yardimci-asistan/shared": fileURLToPath(new URL("../../packages/shared/index.ts", import.meta.url)) } },
  build: {
    lib: {
      entry: "assistant/entry.ts",
      name: "YardimciAsistanWidget",
      formats: ["iife"],
      fileName: () => "widget.js"
    },
    outDir: "assets/assistant",
    emptyOutDir: true
  }
});
