import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: "src/shell",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/shell",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        shell: resolve(__dirname, "src/shell/index.html"),
        addressOverlay: resolve(__dirname, "src/shell/address-overlay.html"),
      },
    },
  },
});
