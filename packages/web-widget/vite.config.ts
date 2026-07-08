import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "YardimciAsistanWidget",
      formats: ["iife"],
      fileName: () => "widget.js"
    },
    outDir: "dist",
    emptyOutDir: true
  }
});
