import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const permissionsHeaders = {
  "Permissions-Policy": "microphone=*, autoplay=*",
};

// `start.py --https` exports these so the dev server can serve TLS too. Microphone
// access requires a secure context, so LAN/public-IP publishing needs HTTPS.
const httpsCert = process.env.VITE_HTTPS_CERT;
const httpsKey = process.env.VITE_HTTPS_KEY;
const https =
  httpsCert && httpsKey
    ? { cert: readFileSync(httpsCert), key: readFileSync(httpsKey) }
    : undefined;

// Dev-only proxy target for /api. `start.py` points this at the FastAPI port it started
// (and switches to https when TLS is enabled).
const apiTarget = process.env.VITE_API_TARGET || "http://127.0.0.1:8000";

const proxy = {
  "/api": { target: apiTarget, changeOrigin: false, secure: false },
};

export default defineConfig({
  base: "./",
  plugins: [react()],
  // The browser SDK is lazy-loaded only when starting a real LiveKit session.
  build: { chunkSizeWarningLimit: 650 },
  server: {
    host: process.env.VITE_HOST || "0.0.0.0",
    port: Number(process.env.VITE_PORT || 5173),
    strictPort: true,
    allowedHosts: true,
    https,
    headers: permissionsHeaders,
    proxy,
  },
  preview: {
    host: process.env.VITE_HOST || "0.0.0.0",
    port: Number(process.env.VITE_PORT || 5173),
    allowedHosts: true,
    https,
    headers: permissionsHeaders,
  },
});
