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
