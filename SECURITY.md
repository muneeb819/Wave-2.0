# Security Policy & Threat Model

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `2.0.x` | Yes       |
| `< 2.0` | No        |

## Reporting a Vulnerability

Please **do not** open public GitHub issues for suspected security vulnerabilities.

1. Use [GitHub Private Vulnerability Reporting](https://github.com/muneeb819/Wave-2.0/security/advisories/new) on this repository.
2. Include reproduction steps, affected component (`src/`, `backend/`, `agent-node/`, or `deploy/`), and potential impact.
3. Maintainers acknowledge reports within **48 hours** and aim to ship a remediated release within **7 days** for critical or high-severity findings.

---

## Architecture Trust Boundaries

Wave 2.0 separates untrusted browser clients from secret-holding server processes across four explicit trust zones:

```text
+---------------------------+        HTTPS + Bearer / Same-Origin        +----------------------------------+
| 1. Browser Studio UI      | -----------------------------------------> | 2. FastAPI Token & Control API   |
|    (src/, untrusted)      | <----------------------------------------- |    (backend/main.py)             |
+---------------------------+     10-min Room-Scoped JWT + CSP/HSTS      +----------------------------------+
              |                                                                            |
              | WSS / WebRTC DTLS-SRTP                                                     | SecretResolver
              v                                                                            v
+---------------------------+        TLS Agent Dispatch & Media          +----------------------------------+
| 4. LiveKit Cloud / SFU    | <----------------------------------------> | 3. Agent Worker + Secret Store   |
|    & Inference Gateways   |                                            |    (backend/agent.py, Vault)     |
+---------------------------+                                            +----------------------------------+
```

### Boundary 1: Browser Studio Client (`src/`)
- **Trust level**: Untrusted end-user browser environment.
- **Controls**:
  - Strict Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`) prevents framing and script injection.
  - Runtime boundary validation via Zod schemas (`src/schemas.ts`) validates all API responses (`/api/status`, `/api/sessions`) and persisted `localStorage` / `sessionStorage` payloads before state hydration.
  - Browser-direct WebCrypto token signing (`src/browserToken.ts`) is strictly opt-in for serverless static hosting (GitHub Pages) and stores credentials only in `sessionStorage` when explicitly entered by the operator.

### Boundary 2: FastAPI Token & Control Service (`backend/main.py`)
- **Trust level**: Authenticated server boundary holding LiveKit API signing keys.
- **Controls**:
  - **Constant-time authentication**: When `STUDIO_ACCESS_TOKEN` is set, `/api/sessions` and `/api/credentials` verify `Authorization: Bearer <token>` using `hmac.compare_digest` (`require_access_token`) to prevent timing side-channels.
  - **Loopback write guard (`require_write_access`)**: Credential writes (`POST /api/credentials`) are rejected from non-loopback clients unless `STUDIO_ACCESS_TOKEN` is configured and verified, preventing anonymous remote credential replacement.
  - **Cross-origin CSRF protection**: Mutating `POST` requests carrying an `Origin` header must match the served `Host` or an explicit `STUDIO_ALLOWED_ORIGINS` allowlist (`verify_same_origin`).
  - **Least-privilege JWT minting**: Minted LiveKit tokens expire after 10 minutes (`TOKEN_TTL = timedelta(minutes=10)`), scope access to a unique random room (`inference-<10-hex>`), allow microphone audio publishing only (`can_publish_sources=["microphone"]`), and set `can_update_own_metadata=False` with zero `roomAdmin` or `roomCreate` privileges.
  - **Bounded rate limiting**: Sliding-window per-client rate limiter (`25 requests / 60s`, bounded to `4,096` tracked buckets) mitigates token-minting abuse and LiveKit Inference credit exhaustion.
  - **Structured audit & error masking**: Every request receives a validated `X-Request-ID` logged via JSON `structlog`; unexpected exceptions are captured by `backend/observability.py` (optional Sentry DSN with `send_default_pii=False`) and return generic 500 error codes without stack traces.
  - **Transport hardening**: Emits `Strict-Transport-Security` over HTTPS (`STUDIO_ENABLE_HSTS=true`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store` on `/api/*`.

### Boundary 3: Voice Agent Workers (`backend/agent.py`, `agent-node/src/agent.ts`)
- **Trust level**: Isolated backend worker process executing STT/LLM/TTS or Realtime sessions.
- **Controls**:
  - Job dispatch metadata (`SessionConfig` in Python Pydantic with `extra="forbid"`; Zod schema in `agent-node`) validates every model ID against the static `CATALOG` allowlist, clamps numeric bounds, and strips control characters before opening upstream inference streams.

### Boundary 4: LiveKit Cloud / Self-Hosted SFU
- **Trust level**: External media & inference infrastructure.
- **Controls**:
  - `validate_livekit_url` rejects embedded URL credentials, enforces `wss://` / `https://` for all remote hosts, and permits plaintext `ws://` / `http://` exclusively for `localhost`, `127.0.0.1`, or `::1`.

---

## Secrets Policy & Vault Integration

### Uncommitted Secrets
Secrets must **never** be committed to Git history, container layers, or `.env.example`:
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- `STUDIO_ACCESS_TOKEN` (minimum 16 characters; `>= 32` characters enforced by `preflight.py` for public deployments)
- `VAULT_TOKEN` and `DOPPLER_TOKEN`
- `.env.local` and TLS private keys under `certs/` (both excluded in `.gitignore` and written with `0600` POSIX permissions)

### External Secret Managers (`backend/secrets.py`)
Production deployments should inject secrets at runtime rather than storing `.env.local` on disk. `backend/secrets.py` resolves secrets in strict precedence order:

1. **Process Environment Variables** (`LIVEKIT_API_SECRET`, `STUDIO_ACCESS_TOKEN`, etc.)
2. **Mounted Secret Files (`*_FILE`)** — Set `SECRET_PROVIDER=file` and pass file paths via `LIVEKIT_API_KEY_FILE`, `LIVEKIT_API_SECRET_FILE`, and `STUDIO_ACCESS_TOKEN_FILE` (compatible with Docker Compose `secrets:`, Kubernetes projected secret volumes at `/run/secrets/*`, and `systemd` `LoadCredential=`).
3. **HashiCorp Vault KV v2 (`SECRET_PROVIDER=vault`)** — Fetches secrets over HTTPS (`VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_SECRET_PATH`, optional `VAULT_NAMESPACE`) with a 60-second in-memory TTL cache. Remote plaintext `http://` Vault URLs are rejected.
4. **Doppler Secrets Manager (`SECRET_PROVIDER=doppler`)** — Fetches runtime secrets over HTTPS using a service token (`DOPPLER_TOKEN`).
5. **Local Development Fallback (`.env.local`)** — Read via `dotenv_values` without mutating `os.environ` or exposing values to `/api/status`.

### Key Rotation
1. Rotate `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` in LiveKit Cloud and generate a fresh `STUDIO_ACCESS_TOKEN` (`python -c "import secrets; print(secrets.token_urlsafe(32))"`).
2. Update your Vault/Doppler secret or mounted `*_FILE` credential.
3. Restart `wave-studio` (or wait up to 60 seconds when using Vault/Doppler TTL caching). Previously minted room JWTs automatically expire within 10 minutes.
