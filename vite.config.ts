import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:8000";

export default defineConfig({
  base: "./",
  plugins: [react()],
  esbuild: {
    legalComments: "none",
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("livekit-client")) return "vendor-livekit";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("zod")) return "vendor-zod";
          return "vendor-react";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
