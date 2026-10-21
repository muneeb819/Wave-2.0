# Wave 2.0 — Complete Setup & Verification Guide

All components across the **Studio Web App**, **Python Quickstart & Multi-Model Worker**, and **Node.js TypeScript Starter** are installed, configured, and verified.

## 1. Installed & Verified Tooling

- **Python**: `3.12` + `uv` (`pyproject.toml` + `uv.lock`)
- **LiveKit Python SDK**: `livekit-agents~=1.8` (`silero`, `turn-detector`, `inference`) + `livekit-plugins-ai-coustics~=0.3`
- **Node.js & pnpm**: Node `22.x` + `pnpm` workspace (`package.json` + `agent-node/package.json`)
- **LiveKit Node SDK**: `@livekit/agents@^1.9.3` + `@livekit/plugins-ai-coustics@^0.3.2`
- **Local Model Weights**: Pre-downloaded via `python -m livekit.agents download-files` (`silero` + `turn-detector`)

## 2. Architecture Matrix

| Capability | Studio Worker (`backend/agent.py`) | Standalone Python (`agent.py`) | Node.js Starter (`agent-node/src/main.ts`) |
| --- | --- | --- | --- |
| **STT–LLM–TTS Pipeline** | `assemblyai/universal-3-6-pro` + `google/gemma-4-31b-it` + `fishaudio/s2.1-pro` | Included | Included |
| **Realtime S2S Pipeline** | `openai/gpt-realtime-2.1`, `openai/gpt-live-1`, `google/gemini-3.8-live`, `xai/grok-voice-3.0` | Included (`LIVEKIT_PIPELINE=realtime`) | Included (`LIVEKIT_PIPELINE=realtime`) |
| **Turn Detection** | `inference.TurnDetector()`, `"stt"`, or `"vad"` | `inference.TurnDetector()` | `new inference.TurnDetector()` |
| **Noise Cancellation** | `ai_coustics.audio_enhancement(QUAIL_VF_S)` (toggleable) | Included (`LIVEKIT_NOISE_CANCELLATION`) | Included (`EnhancerModel.QuailVfS`) |
| **Keyterms & Detection** | `STTContextOptions(keyterms=[...], keyterm_detection={"enabled": True})` | Included | Included |
| **Expressive TTS** | `expressive=True` | `expressive=True` | `expressive: true` |

## 3. Running Services Locally

1. **FastAPI Token & Health Server**:
   ```bash
   uv run python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
2. **Vite Studio Frontend**:
   ```bash
   pnpm run dev
   ```
3. **LiveKit Agent Worker (when connecting Live rooms)**:
   ```bash
   # Studio multi-model dispatch worker
   uv run python -m backend.agent dev

   # OR standalone Quickstart worker (console / dev / start)
   uv run agent.py console
   uv run agent.py dev
   uv run agent.py start
   ```
