import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      "react-diffuse": path.resolve(__dirname, "node_modules/react-diffuse"),
    },
  },
  
  server: {
    port: 5173,
    proxy: {
      // All /api/* requests forwarded to the Express server
      "/api": "http://localhost:4989",
    },
    fs: { cachedChecks: false }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
