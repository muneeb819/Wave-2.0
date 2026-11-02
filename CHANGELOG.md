# Changelog

All notable changes to **Wave 2.0** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-11-02

### Added
- Live loopback HTTP integration tests (`tests/test_secrets_vault.py`) exercising HashiCorp Vault KV v2/v1 (`X-Vault-Token`, `X-Vault-Namespace`, secret rotation) and Doppler HTTP Basic Auth (`DOPPLER_API_URL`) over real sockets.
- Dedicated unit and UI test suites across `useAgentSession`, `liveRoomBridge`, `useMicTester`, `useCloudConnection`, `studioClient`, `browserToken`, `InferencePage`, `SessionsPage`, `SettingsPage`, `ConnectBotModal`, `CodeExportModal`, `RealtimePipelineModal`, `PlaygroundViewport`, `StudioDialogs`, `security_guards`, and `launcher_net` (39 total spec files; >83% frontend line coverage and >90% backend coverage).
- Standalone `pyright` backend static typecheck, `tsc --noEmit` frontend typecheck, `eslint`, and coverage steps in `.github/workflows/ci.yml` gating pull requests to `main`.
- `renovate.json` alongside weekly `.github/dependabot.yml` automation and `.gitattributes` generated-asset declarations.

### Changed
- Split `tests/test_api.py` into `tests/conftest.py`, `tests/test_api_tokens.py`, `tests/test_api_sessions.py`, and `tests/test_worker_pipeline.py`; extracted `backend/security_guards.py`, `backend/launcher_summary.py`, and `src/sections/PlaygroundViewport.tsx`; configured Vite vendor chunking so zero code files exceed 500 SLOC (450-line ESLint cap).
- Replaced exact `==` version pins in `pyproject.toml`, `requirements.txt`, and `package.json` with compatible SemVer ranges (`livekit-agents>=1.8.10,<2`, `livekit-api>=1.2.2,<2`, `livekit-client@^2.23.0`).

## [2.0.0] - 2026-11-02

### Added
- Modular Studio UI architecture across `src/components/`, `src/pages/`, `src/sections/`, `src/hooks/`, `src/session/`, and `src/api/studioClient.ts`.
- Runtime boundary validation with Zod (`src/schemas.ts`) across API responses, browser JWT credentials, and persisted Studio storage.
- React `ErrorBoundary` wrapping the Studio root with graceful recovery controls.
- Structured JSON request and agent logging with `structlog` and end-to-end `X-Request-ID` propagation.
- Optional Sentry error tracking (`SENTRY_DSN`, `send_default_pii=False`) and operational health metrics in `backend/observability.py`.
- Pluggable secret resolution (`backend/secrets.py`) supporting Docker/Kubernetes `*_FILE` secret mounts, HashiCorp Vault KV v2, and Doppler Secrets Manager.
- Root `SECURITY.md` threat model, `CONTRIBUTING.md`, ESLint flat config (`eslint.config.js`), 60% coverage gates (`pytest-cov` and `@vitest/coverage-v8`), Dependabot configuration, and `pip-audit` / `pnpm audit` CI jobs.

### Changed
- Upgraded `vitest`, `@vitest/coverage-v8`, and `vite` across Web Studio and `agent-node` to remediate upstream dependency advisories.
- Expanded `.env.example` to document all runtime, Vite proxy, TLS, deployment, E2B, and secret-provider environment variables.

## [1.2.0] - 2026-04-20

### Added
- E2B cloud sandbox preview proxy (`scripts/e2b-traffic-proxy.mjs`) and Chrome microphone pre-call level meter (`useMicTester`).

## [1.1.0] - 2026-04-12

### Added
- Browser-direct LiveKit connection modes (Token Server Sandbox ID and WebCrypto HS256 room JWT minting) for static GitHub Pages deployments (`docs/`).
- Pre-configured LiveKit Cloud bot (`CA_tBWDFVRz7pZS`) and one-click self-hosted LiveKit Server preset.
- Public deployment automation (`preflight.py`, `gen_cert.py`, `publish-wave.ps1`, `Dockerfile`, `docker-compose.yml`, and `deploy/wave-studio.service`).

## [1.0.0] - 2026-04-05

### Added
- Initial LiveKit Agents v1.5 voice studio supporting STT-LLM-TTS (`deepgram/nova-3`, `openai/gpt-4.1-mini`, `cartesia/sonic-3`) and Realtime speech-to-speech (`openai/gpt-realtime-mini`, `google/gemini-2.5-flash`, `xai/grok-voice-agent`) pipelines.
- Python (`backend/agent.py`) and Node.js (`agent-node/src/agent.ts`) agent starters with Multilingual TurnDetector and `ai-coustics` `QUAIL_VF_S` noise cancellation.
