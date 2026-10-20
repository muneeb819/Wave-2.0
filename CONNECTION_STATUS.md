# Live connection verified — xAI English STT

Verified on 2026-10-20 (Asia/Karachi).

- Active credential profile: **Wave 1**, unchanged
- Project: `medicare-bot-z2uz9h17.livekit.cloud`
- Agent dispatch name: `inference-studio`
- Cloud authentication and worker registration: **passed**
- Browser live room join and agent greeting: **passed**
- Full spoken xAI STT → Gemma → Fish Audio round trip: **passed**
- Non-silent remote speech received in the browser: **passed**
- Production frontend build: **passed**
- Offline backend regression tests: **31 passed**
- Browser regression tests: **11 passed**, including legacy Nova 3 settings migration

## Current stack tested

- STT: **xAI Speech to Text**, `xai/stt-1`
- Transcription language: **English**, `en`
- LLM: `google/gemma-4-31b-it` — unchanged
- TTS: `fishaudio/s2.1-pro` — unchanged
- Voice: `fa4c9eb3dccc4806b382b40d61c6b10a` — unchanged

xAI is accessed through LiveKit Inference with the existing Wave 1 key/secret, not a separate xAI provider key. The worker uses Silero VAD-based turn handling for this STT model.

## Live speech test

Synthetic audio was supplied through Chromium's test microphone. No physical microphone was accessed for this test.

- Spoken test input: “Please say connection successful.”
- xAI transcript: “Please say connection successful.”
- Agent response: “Connection successful.”
- Fish Audio output was received as non-silent audio in the browser.

The automated test session was ended after verification. The updated app and Python worker remain running in the current workspace. Refresh the app, select **Live**, click **Start session**, and allow microphone access. Open the preview in a new tab if embedding permissions block the microphone. Physical-device permissions and speech interruption behavior still need a manual check in your browser. Runtime processes must be restarted if the workspace runtime stops.

Saved Nova 3/Flux STT settings are migrated to xAI English on first load of this version. Existing LLM/TTS selections, voice, instructions, and session history are preserved. Later intentional model choices still persist. Existing room tokens/sessions keep their embedded configuration; start a new session for the updated STT.

## Credential handling

The Wave 1 key/secret remain in the server-only `.env.local` (file mode 600), not in browser assets or API status responses. The standard `inference-studio.zip` is credential-free. The explicitly private `inference-studio-wave1-private.zip` includes `.env.local` at the owner's request; it is not encrypted and must not be published or committed. Enable application authentication or a Studio access token before sharing a credentialed live endpoint. Disable the public LiveKit development token server when no longer needed and rotate chat-shared keys before production use.

Model reference: https://docs.livekit.io/agents/models/stt/spacexai/
