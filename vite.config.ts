import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "src/shell",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist/shell", emptyOutDir: true },
});
