# Deploying Wave 2.0 for live use

This is the short, complete path from a checkout to a running, secured Studio that other
people can open. Everything here has been rehearsed end to end (see [Verification](#6-verification)).

**Pick one path:**

| Your machine | Path | Command |
|---|---|---|
| Windows PC, public IP | [A — one script](#1-path-a--windows-one-script) | `powershell -ExecutionPolicy Bypass -File .\publish-wave.ps1` |
| Linux / macOS server | [B — systemd](#2-path-b--linux-server-systemd) | `sudo systemctl enable --now wave-studio` |
| Docker host | [C — containers](#3-path-c--docker) | `docker compose --env-file .env.local up -d --build` |
| Anything else | [D — manual](#4-path-d--manual-startpy) | `python start.py --mode prod --https --host <ip> --port 8443` |

---

## 0. Before any path: pre-flight

`start.py` ships a readiness check that never starts the server and never contacts the network:

```bash
python start.py --preflight --mode prod --https --host 182.183.90.63 --port 8443
```

```
Wave 2.0 deployment pre-flight
==============================

  [ OK ]  Python           3.12.4 (needs >= 3.10)
  [ OK ]  Python packages  fastapi, uvicorn, livekit, cryptography present
  [ OK ]  Node tooling     /usr/bin/node + pnpm
  [ OK ]  UI bundle        dist/index.html present (679 bytes)
  [ OK ]  .env.local       /opt/wave-2.0/.env.local
  [ OK ]  LiveKit Cloud    URL, API key and secret are set
  [ OK ]  Access token     set (32 characters)
  [ OK ]  Exposure         reachable from the network at 182.183.90.63, token required
  [WARN]  Bind address     182.183.90.63 is not on this machine (router/ISP address) ...
  [ OK ]  Port             TCP 8443 is free on 0.0.0.0
  [ OK ]  TLS certificate  covers localhost, 127.0.0.1, ::1, 169.254.0.21, 182.183.90.63

  Ready to launch, with 1 warning(s) to review.
```

Exit code `0` = ready (warnings are fine), `1` = at least one blocking `[FAIL]` line.
`publish-wave.ps1` and the systemd unit run this check for you.

What it verifies: Python version, installed packages, Node/pnpm, `dist/` freshness,
`.env.local` contents (including placeholder detection), access-token strength, whether
the bind address is on this machine, whether the port is free, and which hosts the TLS
certificate covers.

---

## 1. Path A — Windows, one script

```powershell
cd C:\path\to\Wave-2.0
powershell -ExecutionPolicy Bypass -File .\publish-wave.ps1
```

It performs the whole checklist and then keeps the server in the foreground:

1. **Prepare** — Python/Node/uv/pnpm check, `uv sync`, `pnpm install`, `dist/` build,
   `.env.local` from `.env.example`, a random 32-byte `STUDIO_ACCESS_TOKEN`
   (written with an owner-only ACL and only ever shown masked).
2. **Router** — detects LAN address, gateway and DHCP state, warns about CGNAT, tries a
   UPnP mapping, otherwise prints the exact rule to create.
3. **Firewall** — self-elevates once (UAC) and creates/repairs
   `Wave 2.0 Studio (TCP 8443)` for inbound TCP.
4. **Launch + verify** — runs `start.py --mode prod --https --host 182.183.90.63 --port 8443`,
   waits for `/api/health`, tests localhost/LAN/public, prints the token and the URLs.

Useful switches: `-Port`, `-PublicIp`, `-LanIp`, `-RouterMode Auto|UPnP|Manual|Skip`,
`-NoLaunch` (dry run), `-SkipFirewall`, `-SkipInstall`, `-RotateToken`,
`-InstallAutostart` (start at boot via Task Scheduler), `-WhatIf`.

Details, CGNAT notes and manual commands: [PUBLISH_IP.md](PUBLISH_IP.md).

---

## 2. Path B — Linux server (systemd)

```bash
sudo useradd --system --create-home --home-dir /opt/wave-2.0 wave
sudo git clone https://github.com/muneeb819/Wave-2.0.git /opt/wave-2.0
cd /opt/wave-2.0
sudo -u wave uv sync
sudo -u wave pnpm install && sudo -u wave pnpm run build
sudo -u wave cp .env.example .env.local     # then edit: LIVEKIT_* + STUDIO_ACCESS_TOKEN
sudo -u wave python3 -c "import secrets; print(secrets.token_hex(32))"   # a good token

sudo cp deploy/wave-studio.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wave-studio
systemctl status wave-studio
journalctl -u wave-studio -f
```

The unit runs `--preflight` before every start (`ExecStartPre`), so a broken config makes
systemd fail fast with the report in the journal instead of serving a half-working app.
It restarts on crash, starts on boot, and only writes to `certs/` and `.env.local`.

Firewall (pick your tool):

```bash
sudo ufw allow 8443/tcp          # Ubuntu/Debian
sudo firewall-cmd --add-port=8443/tcp --permanent && sudo firewall-cmd --reload
```

---

## 3. Path C — Docker

```bash
cp .env.example .env.local        # fill in LIVEKIT_* and STUDIO_ACCESS_TOKEN
docker compose --env-file .env.local up -d --build          # HTTPS on :8443 (default)
docker compose --env-file .env.local --profile http up -d   # plain HTTP on :8000 (behind your proxy)
docker compose --env-file .env.local --profile agent up -d  # + the LiveKit agent worker
docker compose logs -f studio
```

Images:

| Target | Contents | Default port |
|---|---|---|
| `studio` (default) | UI + API in one uvicorn process | 8000 (HTTP) |
| `agent` | LiveKit agent worker with the ONNX models pre-downloaded | — |

The default service runs `start.py --mode prod --https` inside the container, so the same
certificate logic as on the host applies (`./certs` is a volume, so the certificate survives
recreates). Terminating TLS at Caddy/nginx/Traefik instead? Use the `http` profile and forward
`X-Forwarded-Proto` correctly.

---

## 4. Path D — Manual `start.py`

```bash
python start.py --mode prod --https --host 182.183.90.63 --yes --port 8443
```

Add `--http-port 8080` to also answer plain HTTP with a 301 to the HTTPS URL (a browser
that gets `http://` first otherwise fails the TLS handshake with a confusing error).
Port 80 needs admin/root; 8080 does not, and you can forward 80 → 8080 on the router.

---

## 5. Security model (what is already enforced)

| Concern | Behaviour |
|---|---|
| Access control | `STUDIO_ACCESS_TOKEN` + `Authorization: Bearer` on `/api/sessions`, `/api/credentials`, `/api/bot-settings`. Checked with `hmac.compare_digest`. |
| Anonymous remote writes | Blocked. With no token configured, writes from any non-loopback client return `403 token_required` — publishing without a token no longer lets strangers rewrite `.env.local` or burn LiveKit credits. |
| Cross-origin POSTs | Rejected when `Origin` does not match `Host` (CSRF). |
| Credential storage | `.env.local`, mode `0600`, never returned by the API, never logged. Only the last 4 characters are shown in the UI. |
| Secrets in transit | TLS (`--https`), self-signed by default, covering the public IP, LAN IP and localhost. |
| Response headers | `Cache-Control` (no-store for `/api`, immutable for hashed assets), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy: frame-ancestors 'self'`, and HSTS when served over TLS. |
| Rate limiting | 8 session requests/minute per client IP, bounded memory. In-process — one uvicorn worker is intentional. |
| Container/process isolation | Docker: non-root `appuser`. systemd: `NoNewPrivileges`, `ProtectSystem=strict`, read-only home, writable paths limited to `certs/` and `.env.local`. |

Still your responsibility: keep `.env.local` off backups you share, rotate the token if it
leaks (`publish-wave.ps1 -RotateToken`), and remember this is a single-operator Studio with
no user accounts — put a real identity proxy in front if you need per-user access.

---

## 6. Verification

```bash
# 1. ready?
python start.py --preflight --mode prod --https --host 182.183.90.63 --port 8443

# 2. running locally (self-signed cert -> -k)
curl -sk https://127.0.0.1:8443/api/health
{"status":"ok","service":"inference-studio","version":"2.0.0","uptime_seconds":12,
 "configured":true,"protected":true}

# 3. HTTP redirect, if you enabled --http-port
curl -sI http://127.0.0.1:8080/ | head -2
HTTP/1.1 301 Moved Permanently
Location: https://127.0.0.1:8443/

# 4. the token is enforced
curl -sk -o /dev/null -w '%{http_code}\n' -X POST https://127.0.0.1:8443/api/sessions \
  -H 'content-type: application/json' -d '{}'          # 401 without the header

# 5. from outside: mobile data (not the same Wi-Fi), then
#    https://182.183.90.63:8443  ->  accept the certificate warning once
```

Expect: the Studio UI loads, **Status → Protected** is on, a session starts only after
pasting the token in *Configuration → Access token*, and the mic works (HTTPS).

---

## 7. Operations

| Task | Command |
|---|---|
| Start / stop / restart | `systemctl start\|stop\|restart wave-studio` or `docker compose restart studio` |
| Logs | `journalctl -u wave-studio -f` / `docker compose logs -f` |
| Update | `git pull && uv sync && pnpm install && pnpm run build && systemctl restart wave-studio` |
| Roll back | `git checkout <previous-release-tag>` (e.g. `v1.0.0`), then `uv sync && pnpm run build && systemctl restart wave-studio` |
| Rotate the access token | `publish-wave.ps1 -RotateToken` or edit `.env.local` and restart |
| Certificates | regenerate with `python gen_cert.py --host <ip> --local-addresses`; `certs/` is git-ignored |
| Back up | `.env.local` and `certs/` only — everything else is reproducible from Git |
| Health monitoring | poll `GET /api/health` (200 = live); Docker and systemd already do this |

---

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `[FAIL] Port … already in use` | Another Studio (or process) owns the port: stop it, or use `--port 8444`. |
| `403 {"code": "token_required"}` | You are publishing without `STUDIO_ACCESS_TOKEN`. Add one and restart. |
| `503 {"code": "not_configured"}` | `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` are missing or placeholders. |
| Browser: `ERR_SSL_PROTOCOL_ERROR` on `http://…:8443` | You opened the HTTPS port over HTTP. Use `https://`, or enable `--http-port`. |
| Certificate warning | Expected: the certificate is self-signed. Advanced → Proceed once per browser. |
| Mic greyed out / blocked | Not a secure context. Use the HTTPS URL or `localhost`; plain HTTP on an IP is blocked by every browser. |
| Works on the LAN, not from outside | Port forwarding + firewall + CGNAT. Compare the router WAN IP with the IP a "what is my IP" site shows; if they differ, use a tunnel (PUBLISH_IP.md §6). |
| `dist/` missing in a container | Build the `studio` target, not `agent`. |

---

## 9. Known limits

- **Single process by design**: rate limits and settings live in memory, so run one uvicorn
  worker (the default). Horizontal scaling needs external state.
- **Self-signed TLS**: fine for an IP, which no public CA can certify. For a domain, put
  Caddy/nginx in front for an automatic Let's Encrypt certificate.
- **No user accounts**: one shared access token. Add an auth proxy if several people need
  separate identities.
- **The agent worker is separate** from the Studio: start `backend.agent` (or your LiveKit
  Cloud agent) for real voice sessions; without it the UI runs in Demo mode.
