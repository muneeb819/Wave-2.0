# AGENTS.md

This repository (**Wave 2.0 · LiveKit Voice AI Studio & Starter**) combines:

1. **Python LiveKit Agents Worker & Quickstart (`agent.py`, `backend/agent.py`)** built on `livekit-agents` (`>= 1.8`) and `livekit-plugins-ai-coustics`, supporting **both**:
   - **Chained STT → LLM → TTS Pipeline** (`assemblyai/universal-3-6-pro` → `google/gemma-4-31b-it` → `fishaudio/s2.1-pro` with `inference.TurnDetector()`, `STTContextOptions` keyterms & live keyterm detection, `expressive=True`, `preemptive_generation={"enabled": True}`, and `ai_coustics.audio_enhancement(model=ai_coustics.EnhancerModel.QUAIL_VF_S)`).
   - **Realtime Speech-to-Speech Pipeline** (`openai/gpt-realtime-2.1` via `inference.RealtimeModel`, `openai/gpt-live-1` via `inference.DuplexModel`, `google/gemini-3.8-live`, and `xai/grok-voice-3.0`).
2. **Node.js / TypeScript LiveKit Agents Starter (`agent-node/`)** built on `@livekit/agents` and `@livekit/plugins-ai-coustics` with `pnpm` (`>= 10.15.0`) and Node.js (`>= 20`).
3. **Token & Configuration Service (`backend/main.py`, `backend/config.py`)** issuing short-lived, room-scoped LiveKit JWTs with validated agent dispatch metadata (`shared/models.json`).
4. **Interactive Studio Workbench (`src/`)** for switching pipelines (`STT-LLM-TTS` ↔ `Realtime`), configuring models/voices/instructions/keyterms, inspecting live WebRTC events & SDK latency metrics, running offline demos, and exporting runnable Python or Node.js agent code.

---

## Tooling & Package Management

- **Python (`>= 3.10`)**: Managed with [`uv`](https://docs.astral.sh/uv/) (`pyproject.toml` + `uv.lock`; `requirements.txt` is maintained in lockstep for `pip` environments).
  - Install dependencies: `uv sync`
  - Download local VAD / audio enhancement model files: `uv run python -m livekit.agents download-files`
  - Lint & format Python code:
    ```console
    uv run ruff check .
    uv run ruff format --check .
    ```
  - Run offline Python API & in-process agent tests:
    ```console
    uv run pytest -q
    ```
- **Frontend & Node.js Agent (`Node.js >= 20`, `pnpm >= 10.15.0`)**:
  - Install web workbench dependencies: `pnpm install` (or `npm ci`)
  - Typecheck & production build: `pnpm build` (or `npm run build`)
  - Run frontend DOM & E2E tests: `pnpm test:dom` / `pnpm test:ui`
  - Run Node.js agent checks (`agent-node/`):
    ```console
    cd agent-node
    pnpm install
    pnpm typecheck
    pnpm test
    ```

---

## Running & Startup Modes

### Quickstart / CLI Agent (`agent.py` — default agent name `my-agent`)

```console
lk cloud auth
uv sync
uv run agent.py console    # Local terminal audio mode
uv run agent.py dev        # Development mode connected to LiveKit Cloud / Agent Console
uv run agent.py start      # Production mode
lk agent dev               # Run directly through LiveKit CLI
```

Switch the standalone entrypoint to the Realtime speech-to-speech pipeline (`openai/gpt-realtime-2.1`) via environment variable:

```console
LIVEKIT_PIPELINE=realtime uv run agent.py dev
```

### One-command launcher + IP publishing (`start.py`)

`start.py` runs the API and the Studio together and can bind any interface:

```console
python start.py                                   # dev (Vite :5173 + API :8000)
python start.py --host 0.0.0.0                    # dev, reachable on the LAN
python start.py --host 0.0.0.0 --https            # dev + TLS (microphone works off-localhost)
python start.py --mode prod --https --host 0.0.0.0 --port 8443
python start.py --mode prod --https --host <public-ip> --yes --port 8443
```

Rules that matter:

- Browsers expose `getUserMedia` only in a secure context, so any binding other than
  `localhost`/`127.0.0.1` needs `--https`; `gen_cert.py` writes a self-signed certificate
  whose SAN covers every host/IP you publish on.
- A public IP is not a local interface; `start.py` prints the firewall + port-forwarding
  plan and only binds `0.0.0.0` when `--yes` is passed (or interactively confirmed).
- Set `STUDIO_ACCESS_TOKEN` in `.env.local` before exposing the Studio beyond your own
  network — the token service has no user accounts.
- Full runbook (router, firewall, CGNAT, tunnels, troubleshooting): `PUBLISH_IP.md`.
- Windows: `publish-wave.ps1` wraps the three go-live steps (deps + `.env.local` token,
  router/UPnP, firewall) and then launches `start.py`; keep it in sync when flags change.
- `python start.py --preflight` is the readiness gate (packages, build, env, token, port,
  TLS SANs). `publish-wave.ps1` and `deploy/wave-studio.service` both run it; keep
  `preflight.py` in sync with any new deployment requirement.
- `DEPLOYMENT.md` is the single go-live guide (Windows/systemd/Docker/security/operations).

### Full Wave 2.0 Studio Workbench (`inference-studio` dispatch)

Run in separate terminals from the repository root:

```console
# Terminal 1 — FastAPI token & status service (0.0.0.0:8000)
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers

# Terminal 2 — Vite React workbench (0.0.0.0:5173, proxies /api -> 127.0.0.1:8000)
pnpm dev

# Terminal 3 — Python (or Node.js) LiveKit worker
uv run python -m backend.agent dev
```

---

## LiveKit Documentation & Agent Skills

Always verify SDK details against the current LiveKit documentation rather than guessing APIs:

```console
lk docs
lk docs search "realtime models"
lk docs get-page /agents/start/voice-ai
lk skills install
```

---

## Handoffs, Tasks ("Workflows"), and Voice Output Rules

- Voice agents are latency-sensitive. Prefer focused sub-agents (handoffs) and `AgentTask` workflows over monolithic system prompts when building multi-step flows.
- Keep spoken output plain text only: no markdown, bullet lists, tables, code fences, asterisks, or emojis.
- Whenever you change core agent instructions, tools (`@function_tool`), or workflows:
  1. Add or update a conversation scenario in [`scenarios.yaml`](scenarios.yaml).
  2. Test interactively turn-by-turn with the CLI debugger (`lk agent debugger start`, `lk agent debugger say "..."`, `lk agent debugger restart`, `lk agent debugger stop`).
  3. Run multi-turn simulations with `lk agent simulate text --scenarios scenarios.yaml`.
  4. Ensure offline unit tests (`uv run pytest -q`) and frontend checks (`pnpm test:dom && pnpm build`) pass cleanly.

---

## Self-Hosting Adaptations

When targeting a self-hosted open-source LiveKit Server instead of LiveKit Cloud:

1. Toggle **Noise cancellation (`ai-coustics`)** **off** in the Studio pipeline controls (or set `LIVEKIT_NOISE_CANCELLATION=false`).
2. Use local Silero VAD (`turn_detection="vad"`) and configure provider plugins with your own provider API keys in `.env.local`.
3. Never expose `LIVEKIT_API_SECRET` or provider API keys in client-side `VITE_*` variables.
