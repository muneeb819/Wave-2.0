# Inference Studio

A LiveKit voice-agent application based on the [LiveKit Inference reference](https://docs.livekit.io/agents/models/inference/) and your architecture diagram. Includes a React/TypeScript workbench, a FastAPI token service, and a real Python LiveKit Agents worker.

**Demo works without credentials. Live voice requires your LiveKit Cloud project and a running worker.** Live Cloud authentication, worker registration, typed conversation, streamed speech, and a full spoken STT–LLM–TTS round trip have now been verified in this workspace. The speech test used synthetic microphone audio, not a physical microphone. Credentials remain server-side and never enter the browser bundle. The standard `inference-studio.zip` is credential-free; the explicitly private `inference-studio-wave1-private.zip` includes the configured server `.env.local` at your request and must not be published. See [WAVE1_SETUP.md](WAVE1_SETUP.md) and [CONNECTION_STATUS.md](CONNECTION_STATUS.md).

## Current requested stack — xAI STT in English

```python
from livekit.agents import AgentSession, inference

session = AgentSession(
    stt=inference.STT(
        model="xai/stt-1",
        language="en"
    ),
    llm=inference.LLM(
        model="google/gemma-4-31b-it",
    ),
    tts=inference.TTS(
        model="fishaudio/s2.1-pro",
        voice="fa4c9eb3dccc4806b382b40d61c6b10a",
    ),
)
```

No separate xAI, Google, or Fish Audio provider keys are required when using LiveKit Inference. Your LiveKit Cloud project must have inference access and sufficient balance. Model availability and aliases are controlled by LiveKit, not this app.

### STT selection update

The current default is **xAI Speech to Text** (`xai/stt-1`) with **English** (`en`), accessed through LiveKit Inference with the existing Wave 1 credentials. No separate xAI key is needed. [Provider documentation](https://docs.livekit.io/agents/models/stt/spacexai/).

On the first load of this version, saved Nova 3/Flux STT settings are migrated to xAI English without resetting the saved LLM, TTS, voice, or instructions. Later explicit model changes still persist. Refresh the preview and start a new session to apply the change; an existing room cannot change its STT model in place. Session history is preserved.

## Features

- Dark, responsive architecture view: **You ↔ Agent ↔ LiveKit Inference → STT / LLM / TTS**.
- Model selection, supported transcription languages, custom Fish Audio voice ID, and editable system instructions.
- **Live:** browser microphone capture, WebRTC audio playback, typed chat, interim user captions, final transcripts, agent state, and real SDK metrics.
- **Demo:** text-only scripted responses and explicitly illustrative metrics. No microphone capture, inference calls, or Cloud charges.
- Browser-tab session history, search/filter, transcript download, and clear/delete controls.
- Python configuration and complete runnable worker export, reflecting your selected models. The exported worker supports the same dashboard event protocol.
- Server-side credential loading, room-scoped 10-minute tokens, explicit agent dispatch, model allow-list validation, optional Studio access token, and a development rate limiter.

The **Realtime** branch is shown as an alternative architecture, just as in the reference. This starter implements your requested STT–LLM–TTS pipeline, **not** a separate realtime speech-to-speech integration.

## 1. Install

Recommended: **Python 3.11–3.13** and **Node 22.22+**. The installed browser SDK's dependencies recommend Node 22.22 or newer. The project was also built and browser-tested successfully on Node 20.20.2 in this workspace.

```bash
cd inference-studio

python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt
npm ci
python -m livekit.agents download-files
```

## 2. Explore the demo

**The downloadable ZIP includes the prebuilt `dist/` UI.** After installing the Python requirements, you can run just the API command below and open port **8000** to try it, without installing Node or rebuilding. For frontend development, use both terminals and port **5173** as described below.

Run these in separate terminals, from the project folder:

```bash
# Terminal 1 — token API
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

```bash
# Terminal 2 — frontend
npm run dev
```

Open **http://localhost:5173** (or the **Inference Studio** live preview in Arena). Click **Start session** with **Demo** selected, then type a message. End the session to save its transcript in the Sessions view.

The frontend calls only relative `/api/*` paths. Vite proxies them to the Python service; browser code never calls the viewer's localhost. Fonts and icons are bundled locally.

## 3. Connect real voice

**Private Wave 1 package:** `.env.local` is already configured with your supplied Wave 1 key/secret pair. Do not overwrite it with the example file. Follow [WAVE1_SETUP.md](WAVE1_SETUP.md) for the preconfigured quick start.

**Credential-free source package:** create a project at [LiveKit Cloud](https://cloud.livekit.io/) and obtain the project's URL, API key, and secret.

```bash
cp .env.example .env.local
```

Edit **`.env.local` on the server**:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_AGENT_NAME=inference-studio

# Recommended for shared development previews. This is not a LiveKit key.
STUDIO_ACCESS_TOKEN=your-strong-random-studio-token
```

Never put credentials in `VITE_*` environment variables or commit `.env.local`. Never paste your LiveKit API secret into the web UI. The optional **Studio access token** is the only password accepted by the frontend, and is kept in page memory.

Start the Python worker in a third terminal, using the same virtual environment:

```bash
python -m backend.agent dev
```

Then:

1. Open **Configuration → Check connection**. This detects credential presence and URL syntax; it does **not** verify the Cloud account or worker registration.
2. Wait for the worker to register with your Cloud project.
3. Switch the playground to **Live**, then click **Start session**.
4. Enter the optional Studio access token if requested and allow microphone access.
5. Hear the greeting, speak naturally, or type a message. Watch the transcript and metrics.
6. Click **End session** to disconnect the room and release the microphone.

Microphone access requires **HTTPS or localhost**. If your browser blocks playback, use the playground's **Enable audio** control.

The API re-reads `.env.local` for each configuration check/token request. Restart the **worker** after changing credentials or its dispatch name.

### Live verification — xAI English, 2026-10-20 (Asia/Karachi)

- [x] Cloud API authenticates with the newly configured key/secret pair.
- [x] Worker registers as `inference-studio`.
- [x] Browser joins a room and receives an agent greeting.
- [x] Typed messages reach the agent and generate a streamed speech response.
- [x] Synthetic spoken microphone input is transcribed by xAI (`xai/stt-1`, English) and answered through Gemma and Fish Audio.
- [x] Browser receives non-silent agent audio and real SDK metrics.
- [ ] Manually verify your own browser's physical microphone, permission prompt, and speech interruption behavior.

Test input: "Please say connection successful." The agent returned: "Connection successful. Is there anything else I can help you with?" The live speech test was ended after verification; the updated worker remains running. The updated production build, 31 backend tests, and 11 browser tests passed, including saved Nova 3 migration. If an embedded preview blocks microphone permissions, open the app preview in a new tab. The standard ZIP contains no credentials; the private Wave 1 ZIP intentionally includes the server `.env.local`.

## Architecture

```text
Browser (React + livekit-client)
  │ POST /api/sessions: validated model configuration
  ▼
FastAPI token service
  │ 10-minute JWT: one room, microphone/data grants, explicit agent dispatch
  ▼
LiveKit Cloud room  ◀── WebRTC audio + typed messages ──▶ Browser
  │ dispatch metadata
  ▼
Python worker: backend/agent.py
  │
  ├── inference.STT  → xAI Speech to Text (English)
  ├── inference.LLM  → Google Gemma
  └── inference.TTS  → Fish Audio

Worker → room data topic inference.events → browser state/transcripts/metrics
Browser → text stream topic lk.chat → AgentSession
```

The primary worker prewarms Silero VAD. Flux uses native STT end-of-turn events; the other listed STT models use VAD turn detection. Room input/output connects microphone audio, agent audio, and typed chat. Starting a session dispatches the named worker via the room configuration embedded in the signed token.

## Metrics and privacy

- **Transcription:** latest SDK end-of-utterance transcription delay.
- **LLM first token:** `LLMMetrics.ttft`.
- **TTS first byte:** `TTSMetrics.ttfb`.
- **Pipeline estimate:** end-of-utterance delay + LLM TTFT + TTS TTFB. This is an estimate, **not** measured microphone-to-speaker latency. Network, scheduling, buffering, and audio playback can add time.
- Missing measurements stay **—**. Demo values are labeled **illustrative** and must not be used as performance benchmarks.

The selected configuration is saved in browser `localStorage`. The latest 20 session transcripts/metadata are held in `sessionStorage`, scoped to the browser tab; clear them in Sessions or Configuration. Browser tab/session restore may preserve that storage. Downloads are local files.

This app does not write transcripts or audio to its API server. The worker explicitly starts sessions with **`record=False`** and does not create audio recordings. LiveKit project settings, provider policies, infrastructure logs, and any observability you configure are separate; review them before handling sensitive data. Tokens and the optional Studio access token are held only in page memory.

## API

| Endpoint             | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `GET /api/health`    | Service liveness                                                 |
| `GET /api/status`    | Safe configuration status; never returns API key/secret          |
| `POST /api/sessions` | Validate config; issue a room-scoped token and dispatch metadata |
| `GET /api/docs`      | FastAPI API documentation                                        |

When `STUDIO_ACCESS_TOKEN` is set, token requests must include `Authorization: Bearer <studio-token>`. The development limiter allows 8 token requests per minute per observed client IP/process. With the local Vite proxy, multiple browsers may share a limiter bucket. Cross-origin browser POSTs are rejected. The proxy must preserve the original Host header.

### Before production

This is a **development starter, not a production authentication system**. Before publicly exposing a credentialed instance:

- Add authenticated, authorized users to the token endpoint; do not rely on CORS or a shared development token as production authorization.
- Add a shared, authenticated-user-based rate limiter, quotas, and abuse controls.
- Use TLS, a secret manager, appropriate logging/redaction, and restricted infrastructure access.
- Keep the dispatch name, deployment, project credentials, and model permissions consistent across services.
- Scope room grants to your application's needs. Do not return LiveKit API secrets to clients.

For a simple built deployment, FastAPI serves the bundled UI if `dist/` exists when the process starts:

```bash
npm run build
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
# Separately: python -m backend.agent start
```

Put the API/UI behind HTTPS and application authentication. Start or deploy the worker separately. In production, do not run Vite's development server.

## Tests

```bash
# Offline API/config/token/worker-wiring tests; no provider calls
python -m pytest tests/test_api.py -q

# Browser tests; install browser assets once
npx playwright install --with-deps chromium
npm run test:ui

# Type checking + production bundle
npm run build
```

The browser test runner starts/reuses the frontend and API. Tests use an explicitly unconfigured status fixture so they never create a paid LiveKit session, even if you configure a project later. API tests isolate environment variables and sign only fake local tokens.

## Project files

```text
backend/
  agent.py             Real LiveKit worker and dashboard event bridge
  config.py            Credential loading and validated session schema
  main.py              Token/status API and optional built UI serving
shared/models.json     Model catalog and exact default configuration
src/
  App.tsx              Workbench, session history, setup, and configuration
  components.tsx       Architecture diagram, model controls, and dialogs
  Playground.tsx       Conversation, events, metrics, and code preview
  useAgentSession.ts   Live room/audio lifecycle and separate demo behavior
  code.ts              Python and environment exports
  styles.css           Responsive visual design
  readability.css      Desktop typography refinements
  types.ts             Shared frontend types/utilities
  main.tsx             Frontend entry point
public/favicon.svg
.env.example
requirements.txt
package.json
package-lock.json
playwright.config.ts
tests/
  test_api.py
  ui.spec.ts
```

## Troubleshooting

| Problem                                                    | Check                                                                                                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API offline                                                | Start Uvicorn on port 8000. Keep browser API calls relative; Vite handles the proxy.                                                                                    |
| Cloud configured but no agent joins                        | Start the Python worker. Verify the same Cloud project and `LIVEKIT_AGENT_NAME` on API and worker. The UI times out after 25 seconds without agent readiness.           |
| Model request failed                                       | Check the worker logs, inference balance, provider/model availability, and voice ID.                                                                                    |
| `deepgram/flux-general` alias not accepted by your project | This is an optional Deepgram model, not the current default. Select **Flux English** (`deepgram/flux-general-en`) if needed, or keep the requested xAI English default. |
| Can't change language                                      | The requested xAI default is English. Language choices follow the selected model; optional Flux English models are limited to English.                                  |
| Microphone denied                                          | Use HTTPS/localhost and allow microphone permissions in the browser.                                                                                                    |
| No audible speech                                          | Check output device/system volume; use **Enable audio** if the browser blocked autoplay.                                                                                |
| 401 from token API                                         | Enter the value of `STUDIO_ACCESS_TOKEN` in Configuration, not your LiveKit API key or secret.                                                                          |
| 429 from token API                                         | Wait one minute; use a production shared limiter if deploying for multiple users.                                                                                       |

## References

- [LiveKit Inference](https://docs.livekit.io/agents/models/inference/)
- [Voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai/)
- [Agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)
- [Agent events](https://docs.livekit.io/reference/agents/events/)
- [Observability and data hooks](https://docs.livekit.io/testing/observability/data/)

Community starter, not an official LiveKit Cloud dashboard. LiveKit and provider names belong to their respective owners.
