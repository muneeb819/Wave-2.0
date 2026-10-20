# Wave 1 connection configuration

## Applied requirement changes

Both requested changes are applied to the active server configuration and the private configured delivery:

- `LIVEKIT_URL`: `wss://medicare-bot-z2uz9h17.livekit.cloud`
- `LIVEKIT_API_KEY`: the supplied **Wave 1** key, stored in server-only `.env.local`.
- `LIVEKIT_API_SECRET`: the matching supplied **Wave 1** secret, stored in server-only `.env.local`.
- Agent dispatch name remains `inference-studio`.
- The legacy key/secret pair is not used or included in either delivery.
- The legacy sandbox token-server URL and ID were removed from the app's environment. The browser obtains scoped, 10-minute participant tokens from the app's own `/api/sessions` service, signed using Wave 1.

This change does not disable or alter the development token-server setting in your LiveKit Cloud project. It only removes its use from this application.

## Choose the correct download

| Package                              | Server credentials                                                    |
| ------------------------------------ | --------------------------------------------------------------------- |
| `inference-studio.zip`               | Not included; configure `.env.local` yourself.                        |
| `inference-studio-wave1-private.zip` | Already configured in `.env.local` with your requested Wave 1 values. |

**The private ZIP contains live credentials in plaintext. It is not encrypted. Keep it private, do not upload it to a public repository, and remove `.env.local` before redistributing the source.** Neither package embeds credentials in browser assets. The private server file is packaged with Unix permissions `600`.

## Run the preconfigured private package

Extract the ZIP, then open a terminal in the extracted `inference-studio` folder. Do not copy `.env.example` over the existing `.env.local`.

```bash
python -m venv .venv
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m livekit.agents download-files
```

The prebuilt UI is included, so Node is not required for this path.

Start UI + token API:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
```

In a second terminal, activate the same virtual environment and start the worker:

```bash
python -m backend.agent dev --log-level info --no-reload
```

Open `http://localhost:8000`, select **Live**, click **Start session**, and allow microphone access. For a remote host, use HTTPS. If an embedded preview blocks microphone permissions, open it in a new tab.

## Verification

Wave 1 credentials are unchanged. The API and worker were restarted with the updated xAI STT catalog. A full spoken **xAI STT → Gemma → Fish Audio** round trip passed in the browser with synthetic English microphone audio. Speech was transcribed correctly, a reply was generated, and non-silent speech was received. The production build, 31 backend tests, and 11 browser tests passed. See `CONNECTION_STATUS.md`.

Current requested model defaults (only STT was changed):

- STT: `xai/stt-1` (xAI Speech to Text), language `en` (English)
- LLM: `google/gemma-4-31b-it`
- TTS: `fishaudio/s2.1-pro`
- Voice: `fa4c9eb3dccc4806b382b40d61c6b10a`

## Before sharing or production use

Configure application authentication or `STUDIO_ACCESS_TOKEN` before sharing the live endpoint, and disable the public LiveKit development token server when it is no longer needed. Rotate chat-shared credentials, update the server `.env.local` privately, and restart the worker after a key change.

Saved Nova 3/Flux browser preferences are migrated once to xAI English while preserving the other model settings, voice, and instructions. Refresh the app and create a new Live session; existing room configuration is not changed in place.
