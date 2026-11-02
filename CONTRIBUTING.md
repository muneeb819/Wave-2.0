# Contributing to Wave 2.0

Thank you for contributing to **Wave 2.0 — LiveKit Inference Voice AI Studio & Agent Starter**. This guide covers local setup, repository structure, quality gates, and security expectations.

## Prerequisites

- **Python 3.10–3.13** with [`uv`](https://docs.astral.sh/uv/) (`>= 0.6`)
- **Node.js `>= 20`** with [`pnpm`](https://pnpm.io/) (`10.15.0`)

## Quick Local Setup

```bash
# 1. Install Python backend, agent, and dev/test dependencies
uv sync --dev --python 3.13

# 2. Install Web Studio dependencies
pnpm install

# 3. Install Node.js Agent Starter dependencies
pnpm --dir agent-node install

# 4. Copy the environment template (never commit .env.local)
cp .env.example .env.local
```

## Repository Structure

| Path | Responsibility |
| ---- | -------------- |
| `src/components/` | Focused reusable UI primitives (`Modal`, `Pipeline`, `ModelCard`, `ErrorBoundary`, etc.) |
| `src/pages/` | Top-level Studio views (`InferencePage`, `SessionsPage`, `SettingsPage`) |
| `src/sections/` | Domain modals and panels (`BotLinkEditor`, `ConnectBotModal`, `CodeExportModal`, etc.) |
| `src/session/` | LiveKit WebRTC room bridge (`liveRoomBridge.ts`) and local demo simulator |
| `src/api/` | Typed HTTP client (`studioClient.ts`) validated by `src/schemas.ts` (Zod) |
| `backend/` | FastAPI token server (`main.py`), catalog/validation (`config.py`), secret providers (`secrets.py`), observability (`observability.py`), and Python LiveKit agent (`agent.py`) |
| `agent-node/` | Node.js TypeScript LiveKit Agent (`@livekit/agents`) |
| `tests/` | `pytest` backend/security/deployment suites and `vitest` React Testing Library suites |

## Quality Gates

Every pull request must pass all checks enforced in `.github/workflows/ci.yml`:

```bash
# Lint & format (Python + TypeScript/React)
uv run ruff check .
uv run ruff format --check .
pnpm run lint

# Backend tests + >= 60% coverage gate
uv run pytest --cov=backend --cov-fail-under=60

# Web Studio tests + >= 60% line coverage gate + production bundle build
pnpm vitest run --coverage
pnpm run build

# Node.js agent starter tests & typecheck
pnpm --dir agent-node test
pnpm --dir agent-node build

# Dependency vulnerability audits
uv run pip-audit --skip-editable
pnpm audit --audit-level=high
pnpm --dir agent-node audit --audit-level=high
```

## Architecture & Cleanliness Guidelines

1. **Keep modules small and single-concern**: Every source file must remain under 500 lines (`max-lines` is enforced by ESLint), and UI components/pages/sections should stay focused (< 300 lines).
2. **Validate every external boundary**: Use Pydantic models (`extra="forbid"`) in `backend/` and Zod schemas (`src/schemas.ts`) in `src/` and `agent-node/`.
3. **Never commit secrets**: Document any newly introduced environment variable in `.env.example` with a safe placeholder, and keep real keys in `.env.local` or an external secret provider (`SECURITY.md`).
4. **Pair code with tests**: Ship every feature, bug fix, or security control in the same commit as its unit or integration test.
5. **Commit conventions**: Use clear Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`, `ci:`, `docs:`, `chore:`).
