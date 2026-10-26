import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const permissionsHeaders = {
  "Permissions-Policy": "microphone=*, autoplay=*",
};

export default defineConfig({
  base: "./",
  plugins: [react()],
  // The browser SDK is lazy-loaded only when starting a real LiveKit session.
  build: { chunkSizeWarningLimit: 650 },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    headers: permissionsHeaders,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: false } },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    headers: permissionsHeaders,
  },
});
