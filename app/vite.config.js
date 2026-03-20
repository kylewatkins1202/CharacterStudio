import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
 
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All /api/* requests forwarded to the Express server
      "/api": "http://localhost:4989",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
