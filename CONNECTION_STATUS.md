# Connection & LiveKit Cloud Status

## Current Sandbox Status

- **FastAPI Backend (`http://localhost:8000`)**: Ready (`/api/health` → `200 OK`, `/api/status` → `200 OK`)
- **Vite Studio Preview (`http://localhost:5173`)**: Ready (proxies `/api/*` directly to `:8000`, bound to `0.0.0.0` with `allowedHosts: true` for preview domains)
- **Demo Mode (`Demo` tab)**: Works immediately in the browser with **zero credentials**, supporting both **STT → LLM → TTS** and **Realtime speech-to-speech** pipelines, live code generation (Python & Node.js), keyterms, instructions, voice configuration, metrics, and session history export.

## Going Live with Real Audio

To connect real WebRTC microphone audio and LiveKit Cloud Inference:

1. Authenticate with LiveKit Cloud or create `.env.local` in `/home/user/Wave-2.0/.env.local`:
   ```bash
   lk cloud auth
   lk app env -w
   ```
   Or manually create `.env.local`:
   ```dotenv
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your-api-key
   LIVEKIT_API_SECRET=your-api-secret
   ```
2. Start the LiveKit Agent worker in a second process:
   ```bash
   # Studio dynamic worker (honors UI model/pipeline/voice/keyterm selections per room)
   uv run python -m backend.agent dev

   # OR standalone Quickstart worker
   uv run agent.py dev
   ```
3. Click **Check connection** in the Studio UI, switch the Playground toggle from **Demo** to **Live**, and click **Start session**.

## Live Deployment Readiness

Everything needed to run this on a public IP is now covered and verified:

```bash
python start.py --preflight --mode prod --https --host 182.183.90.63 --port 8443   # readiness report
python start.py --mode prod --https --host 182.183.90.63 --yes --port 8443         # launch (add --http-port 8080)
```

- Windows: `publish-wave.ps1` (deps, token, router/UPnP, firewall, launch, verify, optional `-InstallAutostart`).
- Linux: `deploy/wave-studio.service` (boot start, restart-on-crash, pre-flight gate).
- Docker: `docker compose --env-file .env.local up -d --build` (default service = HTTPS on :8443).
- Always: `STUDIO_ACCESS_TOKEN` is enforced, anonymous remote writes are refused, hashed assets are
  cached immutably, and `/api/health` reports version + uptime.

Full checklist, security model, operations and troubleshooting: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Publishing on a LAN or Public IP

`start.py` now handles binding and TLS for you:

```bash
python start.py --host 0.0.0.0                      # dev, reachable on the LAN (HTTP)
python start.py --host 0.0.0.0 --https              # dev + TLS so the microphone works
python start.py --mode prod --https --host 0.0.0.0 --port 8443
python start.py --mode prod --https --host 182.183.90.63 --yes --port 8443
```

A public IP such as `182.183.90.63` is a router/WAN address, not a local interface: the
launcher detects that, prints the firewall + port-forwarding plan, and binds `0.0.0.0`
(only with `--yes`, or after an interactive confirmation). The generated certificate in
`certs/` lists that IP in its SAN, so `https://182.183.90.63:8443` is a secure context and
the microphone works. Router setup, CGNAT detection, tunnels, and troubleshooting are in
[PUBLISH_IP.md](PUBLISH_IP.md).
