#!/usr/bin/env node
/**
 * Local Chrome bridge for E2B sandboxes configured with `allowPublicTraffic: false`.
 *
 * Injects `'e2b-traffic-access-token': sandbox.trafficAccessToken` on every HTTP & WebSocket
 * request while serving on `http://localhost:5173` (a Chrome Secure Context with full mic access).
 *
 * Usage:
 *   # Option 1: Using an existing sandbox host + traffic token
 *   E2B_HOST="5173-iqiiusp5t7hp6wo8rinqb.e2b.app" E2B_TRAFFIC_ACCESS_TOKEN="<token>" node scripts/e2b-traffic-proxy.mjs
 *
 *   # Option 2: Using E2B SDK (`npm install e2b`) + E2B_API_KEY
 *   E2B_API_KEY="<key>" E2B_SANDBOX_ID="iqiiusp5t7hp6wo8rinqb" node scripts/e2b-traffic-proxy.mjs
 */

import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { exec } from "node:child_process";

const LOCAL_PORT = Number(process.env.PORT || 5173);
const TARGET_PORT = Number(process.env.TARGET_PORT || 5173);

async function resolveSandboxTarget() {
  if (process.env.E2B_HOST && process.env.E2B_TRAFFIC_ACCESS_TOKEN) {
    return {
      host: process.env.E2B_HOST.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      trafficAccessToken: process.env.E2B_TRAFFIC_ACCESS_TOKEN,
    };
  }

  const { Sandbox } = await import("e2b");
  let sandbox;
  if (process.env.E2B_SANDBOX_ID) {
    sandbox = await Sandbox.connect(process.env.E2B_SANDBOX_ID);
  } else {
    sandbox = await Sandbox.create({
      network: { allowPublicTraffic: false },
    });
    await sandbox.commands.run(
      "python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000",
      { background: true },
    );
  }

  return {
    host: sandbox.getHost(TARGET_PORT),
    trafficAccessToken: sandbox.trafficAccessToken,
  };
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

const { host, trafficAccessToken } = await resolveSandboxTarget();
const targetOrigin = `https://${host}`;

// Verify access with the exact `e2b-traffic-access-token` header first
const check = await fetch(targetOrigin, {
  headers: { "e2b-traffic-access-token": trafficAccessToken },
});
console.log(
  `Verified E2B upstream ${targetOrigin} -> HTTP ${check.status} (token accepted)`,
);

const server = http.createServer((req, res) => {
  const upstreamReq = https.request(
    {
      hostname: host,
      port: 443,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host,
        "e2b-traffic-access-token": trafficAccessToken,
      },
    },
    (upstreamRes) => {
      const headers = {
        ...upstreamRes.headers,
        "permissions-policy": "microphone=*, autoplay=*",
      };
      res.writeHead(upstreamRes.statusCode || 502, headers);
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Upstream proxy error: ${err.message}`);
  });
  req.pipe(upstreamReq);
});

server.on("upgrade", (req, clientSocket, head) => {
  const upstreamSocket = tls.connect({ host, port: 443, servername: host }, () => {
    const headerLines = [`${req.method} ${req.url} HTTP/1.1`, `Host: ${host}`];
    headerLines.push(`e2b-traffic-access-token: ${trafficAccessToken}`);
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() === "host" || v === undefined) continue;
      headerLines.push(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
    }
    upstreamSocket.write(`${headerLines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });
  upstreamSocket.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstreamSocket.destroy());
});

server.listen(LOCAL_PORT, "127.0.0.1", () => {
  const localUrl = `http://localhost:${LOCAL_PORT}/?mode=live`;
  console.log(`\nWave 2.0 Chrome Bridge running at: ${localUrl}\n`);
  openBrowser(localUrl);
});
