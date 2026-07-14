import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/__yardimci_asistan_live": {
        target: "https://yardimciasistan.alwaysdata.net",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/__yardimci_asistan_live/, "/yardimci-asistan")
      }
    }
  }
});
