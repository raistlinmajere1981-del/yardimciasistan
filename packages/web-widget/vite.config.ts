import { defineConfig } from "vite";

export default defineConfig({
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
