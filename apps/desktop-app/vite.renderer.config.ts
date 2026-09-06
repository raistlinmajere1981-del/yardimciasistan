import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const sharedSource = fileURLToPath(new URL("../../packages/shared/index.ts", import.meta.url));
const syncCoreSource = fileURLToPath(new URL("../../packages/sync-core/index.ts", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    // Workspace packages are emitted as CommonJS for Electron/Node. Renderer
    // code consumes their TypeScript sources so Rollup can use named exports.
    alias: {
      "@yardimci-asistan/shared": sharedSource,
      "@yardimci-asistan/sync-core": syncCoreSource
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true
  },
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true
  }
});
