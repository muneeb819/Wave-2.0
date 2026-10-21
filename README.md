# Wave 2.0 — LiveKit Voice AI Studio & Python + Node.js Starter Workbench

Wave 2.0 is a complete, unified **LiveKit Agents 1.8 / 1.9** voice AI workbench combining:

1. **Interactive Inference Studio Web App** (`src/` + `backend/`) — Configure, simulate, inspect latency metrics, and export ready-to-run Python and TypeScript agents across **both** architectures:
   - **STT–LLM–TTS Pipeline**: `AssemblyAI Universal-3.6 Pro` (`assemblyai/universal-3-6-pro`) → `Google Gemma 4 31B` (`google/gemma-4-31b-it`) → `Fish Audio S2.1 Pro` (`fishaudio/s2.1-pro`, voice `fa4c9eb3dccc4806b382b40d61c6b10a`)
   - **Realtime Speech-to-Speech Pipeline**: `OpenAI GPT Realtime 2.1` (`openai/gpt-realtime-2.1`, voice `marin`), `OpenAI GPT Live 1` (`openai/gpt-live-1`), `Google Gemini 3.8 Live`, and `xAI Grok Voice 3.0`
2. **Official Python Voice AI Quickstart & Starter** (`agent.py`, `backend/agent.py`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `scenarios.yaml`, `taskfile.yaml`, `AGENTS.md`)
3. **Official Node.js TypeScript Starter** (`agent-node/`, `pnpm`, `@livekit/agents@^1.9.3`, `@livekit/plugins-ai-coustics@^0.3.2`, `Dockerfile`, `scenarios.yaml`, `AGENTS.md`)

---

## Included Voice Pipeline Capabilities

- **Dual Pipeline Architecture**: Switch seamlessly between chained **STT → LLM → TTS** and direct speech-to-speech **Realtime** models without changing room transport or client code.
- **Multilingual Semantic Turn Detection**: Uses `inference.TurnDetector()` (`TurnHandlingOptions(turn_detection=inference.TurnDetector(), preemptive_generation={"enabled": True})`), plus turn-aware `"stt"` (`Deepgram Flux`) and local `"vad"` (`Silero VAD`) modes.
- **Domain Keyterms & Live Keyterm Detection**: Configures `STTContextOptions(keyterms=["LiveKit", "Wave 2.0"], keyterm_detection={"enabled": True})`.
- **Enhanced Studio Noise Cancellation**: Uses `livekit-plugins-ai-coustics` (`ai_coustics.audio_enhancement(model=ai_coustics.EnhancerModel.QUAIL_VF_S)`), with a single toggle to disable when self-hosting open-source LiveKit Server.
- **Expressive Speech Synthesis**: Enables `expressive=True` on `AgentSession` for Fish Audio S2.1 Pro natural prosody markup.
- **Zero-Cost Demo Mode & Offline Test Suites**: Try the full UI, inspect live code exports (`Session config`, `Complete agent`, `Quickstart agent.py`, `Node.js starter`, `.env.example`), and run all Python, React DOM, and TypeScript test suites with zero external API calls.

---

## Quickstart Guide

### Step 1: Install the LiveKit CLI

```bash
# macOS
brew install livekit-cli

# Linux
curl -sSL https://get.livekit.io/cli | bash

# Windows
winget install LiveKit.LiveKitCLI
```

Link your LiveKit Cloud account and write credentials directly into `.env.local`:

```bash
lk cloud auth
lk app env -w
```

### Step 2: Run the Python Voice Agent (`uv`)

```bash
# Install dependencies (Python >= 3.10)
uv sync --dev

# Download required Silero VAD & TurnDetector weights
uv run agent.py download-files

# Mode 1 — Console mode (speak directly in your terminal, no server connection needed)
lk agent console
# or directly:
uv run agent.py console

# Mode 2 — Dev mode (hot reload + connects to LiveKit Cloud / Playground)
lk agent dev
# or Studio multi-model worker:
uv run python -m backend.agent dev

# Mode 3 — Production worker mode
lk agent start
```

Switch the standalone Quickstart worker directly into **Realtime speech-to-speech** mode at any time:

```bash
LIVEKIT_PIPELINE=realtime uv run agent.py dev
```

### Step 3: Run the Interactive Inference Studio Web UI

Start the FastAPI backend (`:8000`) and Vite React UI (`:5173`):

```bash
# Terminal 1: FastAPI token & health backend
uv run python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Interactive Studio frontend
pnpm install
pnpm run dev
```

### Step 4: Run the Node.js TypeScript Starter (`agent-node/`)

```bash
cd agent-node
pnpm install
pnpm run build
pnpm run download-files

# Terminal audio console, dev hot-reload, or production mode
pnpm run console
pnpm run dev
pnpm start
```

---

## Deploying to LiveKit Cloud

Deploy either the Python root project (`Dockerfile`) or the Node.js starter (`agent-node/Dockerfile`):

```bash
# Deploy Python agent
lk agent create

# Deploy Node.js agent
cd agent-node && lk agent create
```

---

## Self-Hosting Open-Source LiveKit Server

If you are connecting to a self-hosted open-source LiveKit Server (`ws://localhost:7880` locally or `wss://your-livekit-host.example.com`):

1. Point `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `.env.local` to your self-hosted server.
2. Disable the LiveKit Cloud-only `ai-coustics` noise cancellation plugin (`noise_cancellation: false` in the Studio **Configuration → Switch to self-hosted preset** button, or `audio_input=True` in `room.RoomOptions`).
3. Swap `inference.*` cloud gateway models for direct provider plugins (or select local Silero `VAD` turn detection).

---

## Testing & Verification Commands

```bash
# Run Python unit, security, pipeline, and in-process AgentSession evaluation tests
uv run pytest -q

# Run Ruff linter & formatter checks
uv run ruff check .
uv run ruff format --check .

# Run Studio React UI + Python AST export verification tests
pnpm run test:dom

# Build production Studio bundle
pnpm run build

# Typecheck & test Node.js LiveKit starter
cd agent-node && pnpm run typecheck && pnpm test

# Run multi-turn LiveKit Cloud conversation simulations (requires LiveKit Cloud auth)
lk agent simulate text --scenarios scenarios.yaml
```
