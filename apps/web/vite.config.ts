import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const webDir = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: webDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(webDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: resolve(webDir, "index.html"),
        stats: resolve(webDir, "stats.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:8080",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
