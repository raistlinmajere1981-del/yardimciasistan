import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const sharedSource = fileURLToPath(new URL("../../packages/shared/index.ts", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    // The workspace shared package is emitted as CommonJS for Electron/Node.
    // Renderer code is bundled by Vite/Rollup and should consume the TypeScript
    // source directly instead of trying to statically infer named exports from
    // the generated CommonJS barrel. This also keeps renderer builds independent
    // from a possibly stale packages/shared/dist artifact.
    alias: {
      "@yardimci-asistan/shared": sharedSource
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
