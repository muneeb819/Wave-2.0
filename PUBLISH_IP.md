# Publish Wave 2.0 on an IP address (`182.183.90.63`)

This runbook publishes the Studio so it is reachable at **`https://182.183.90.63:8443`**.

> **Read this first — where the app has to run**
>
> `182.183.90.63` is *your* public (WAN) IP. It is not a network card inside this
> workspace, so nothing running inside this sandbox can bind it. The launcher detects that
> and tells you instead of failing with `[Errno 99] Cannot assign requested address`.
>
> Publishing therefore means: **run the app on a machine inside your network, forward the
> port on your router, and open the public IP from outside.** Everything below runs on
> that machine (your PC, mini-PC, or server) inside your clone of this repository.

---

## 0. Windows: one script does all three steps

On Windows, `publish-wave.ps1` automates Steps 1-3 below and then verifies the result:

```powershell
# From the repository root. Right-click -> "Run with PowerShell" also works.
powershell -ExecutionPolicy Bypass -File .\publish-wave.ps1
```

Before the first launch it also runs `start.py --preflight` and stops if anything blocking
is reported, so a misconfigured deployment fails in seconds instead of after the server is up.
Use `-InstallAutostart` to add a Task Scheduler job that starts the server at boot, and
`-RemoveAutostart` to delete it.

It is equivalent to running the three steps manually, in this order:

| Step | What the script does |
|---|---|
| **1. Prepare this PC** | Checks Python/Node, runs `uv sync` + `pnpm install` when needed, creates `.env.local` from `.env.example`, generates a 32-byte **`STUDIO_ACCESS_TOKEN`**, warns when `LIVEKIT_*` are still placeholders, then launches `python start.py --mode prod --https --host 182.183.90.63 --yes --port 8443` |
| **2. Router** | Detects the LAN address, default gateway and DHCP state; checks for **CGNAT**; tries a UPnP port mapping automatically and otherwise prints the exact rule to create (and the router URL) |
| **3. Firewall** | Self-elevates with UAC and creates/repairs the inbound rule `Wave 2.0 Studio (TCP 8443)` |

Afterwards it waits for `/api/health`, tests localhost + LAN + public reachability, and prints
the URL, the access token to paste into the Studio, and what to fix if a check failed.

Common options:

```powershell
.\publish-wave.ps1 -PublicIp 182.183.90.63 -Port 8443      # defaults
.\publish-wave.ps1 -RouterMode Manual                        # never touch UPnP
.\publish-wave.ps1 -NoLaunch                                 # configure only (dry run)
.\publish-wave.ps1 -RotateToken                              # issue a new access token
.\publish-wave.ps1 -SkipFirewall -SkipInstall                # you manage those yourself
.\publish-wave.ps1 -WhatIf                                   # show what would change
```

If PowerShell blocks the file (`... cannot be loaded because running scripts is disabled`),
either use the `-ExecutionPolicy Bypass` form above or run once:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

The script never prints your API secret, never sends the access token on a command line, and
is safe to re-run: existing `.env.local` values are preserved and the firewall rule is reused.

The complete go-live checklist - pre-flight, systemd, Docker, monitoring, rollback and the
security model - is in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 0b. One-command publish (all platforms)

From the repository root on the machine that should serve the app:

```bash
pnpm install && uv sync          # or: npm install && pip install -r requirements.txt
python start.py --mode prod --https --host 182.183.90.63 --yes --port 8443
```

What that does:

| Step | Result |
|---|---|
| `--host 182.183.90.63` | Not a local address → the launcher prints the port-forwarding plan, then (with `--yes`) binds `0.0.0.0` so every interface is reachable |
| `--mode prod` | Builds `dist/` if needed and serves the Studio **and** `/api/*` from one uvicorn process |
| `--https` | Generates `certs/key.pem` + `certs/cert.pem` with **`182.183.90.63` in the SAN** (plus `localhost`, `127.0.0.1`, `::1`, and your LAN addresses) |
| `--port 8443` | Public port (any free TCP port works) |

Shorter equivalents:

```bash
pnpm run publish        # prod + HTTPS on 0.0.0.0:8443 (cert covers local IPs)
pnpm run serve          # prod + HTTP  on 0.0.0.0:8000 (LAN only, no microphone)
```

Expected output:

```
Generated TLS certificate for: localhost, 127.0.0.1, ::1, 192.168.1.20, 182.183.90.63
Starting Wave 2.0 (production) on https://0.0.0.0:8443 ...

Wave 2.0 is running [prod, HTTPS] - ready
  Local     : https://localhost:8443
  Network   : https://192.168.1.20:8443
  Published : https://182.183.90.63:8443  (after port forwarding)
  API       : https://localhost:8443/api/health
```

---

## 1. Why HTTPS is mandatory (not optional)

Chrome, Edge, Firefox and Safari only expose `navigator.mediaDevices.getUserMedia` in a
**secure context**: `https://…` or `http://localhost`.

| URL you open | UI / Demo mode | Microphone + Live sessions |
|---|---|---|
| `http://182.183.90.63:8443` | ✅ works | ❌ `navigator.mediaDevices` is `undefined` |
| `https://182.183.90.63:8443` | ✅ works | ✅ works (accept the certificate warning) |

The certificate is self-signed, so the first visit shows **"Your connection is not
private"**. Choose **Advanced → Proceed to 182.183.90.63 (unsafe)** once per browser.
That warning is expected; the traffic is still encrypted.

---

## 2. Forward the port on your router

1. Find this machine's LAN address:
   - Windows: `ipconfig` → *IPv4 Address*
   - Linux: `ip addr show` or `hostname -I`
   - macOS: `ipconfig getifaddr en0`
2. Open your router admin page (commonly `http://192.168.1.1` or `http://192.168.0.1`).
3. Create a **Port Forwarding / Virtual Server / NAT** rule:

   | Field | Value |
   |---|---|
   | External / WAN port | `8443` (TCP) |
   | Internal / LAN port | `8443` (TCP) |
   | Internal IP | this machine's LAN address |
   | Protocol | TCP |

4. Give the machine a **static/reserved DHCP lease**, otherwise the rule breaks when the
   LAN IP changes after a reboot.

## 3. Allow the port through the local firewall

```powershell
# Windows (Administrator PowerShell)
New-NetFirewallRule -DisplayName "Wave 2.0 Studio" -Direction Inbound `
  -Protocol TCP -LocalPort 8443 -Action Allow
```

```bash
# Linux
sudo ufw allow 8443/tcp
# firewalld instead: sudo firewall-cmd --permanent --add-port=8443/tcp && sudo firewall-cmd --reload
```

```bash
# macOS: System Settings → Network → Firewall → Options → allow incoming for Python
```

## 4. Verify, in this order

```bash
# a) same machine
curl -k https://localhost:8443/api/health
# {"status":"ok","service":"inference-studio"}

# b) another device on the same Wi-Fi (replace with your LAN IP)
curl -k https://192.168.1.20:8443/api/health

# c) from outside the network (phone on mobile data, or any external host)
curl -k https://182.183.90.63:8443/api/health
```

If (a) and (b) pass but (c) fails, the problem is the router rule, the firewall, or CGNAT
— not the app. See the troubleshooting table.

---

## 5. Check for CGNAT before blaming the router

If your ISP shares one public IPv4 between many customers (common on PTCL, StormFiber,
and most mobile/fixed-wireless links), **port forwarding can never work** because the IP
you see online is not on your router.

Compare:

1. The **WAN / Internet IP** shown on your router's status page.
2. The IP reported by an external "what is my IP" service.

| Result | Meaning |
|---|---|
| Both are `182.183.90.63` | Real public IP → port forwarding will work |
| Router shows `100.64.x.x`, `10.x.x.x`, or a different address | CGNAT → use a tunnel instead |

---

## 6. If you are behind CGNAT: publish with a tunnel

A tunnel gives you a public **HTTPS hostname** without touching the router. Run the Studio
locally, then expose it:

```bash
# Local server (HTTP is fine behind a tunnel – the tunnel terminates TLS)
python start.py --mode prod --host 127.0.0.1 --port 8000

# Cloudflare Tunnel (free, gives https://<random>.trycloudflare.com)
cloudflared tunnel --url http://localhost:8000

# or ngrok
ngrok http 8000
```

Because the tunnel is HTTPS, the microphone works; no certificate warning, no open ports.

> ⚠️ Through a tunnel the browser's `Origin` is the tunnel hostname while the API sees a
> local `Host` header. If you hit `403 Cross-origin requests are not allowed`, put the
> tunnel in front of the same origin the browser uses (single port, as above) or add the
> tunnel hostname to your reverse proxy so `Host` is preserved.

Other options: **Tailscale Funnel**, **frp**, **Caddy** or **nginx** as a TLS-terminating
reverse proxy in front of `http://127.0.0.1:8000`.

---

## 7. Security checklist before the port is public

The API mints LiveKit access tokens, so anyone who can reach it can start sessions
(and spend inference credits) using your project credentials.

- [ ] **Set an access token** — in `.env.local`:
  ```dotenv
  STUDIO_ACCESS_TOKEN=<long random string, e.g. `openssl rand -hex 24`>
  ```
  Restart, then paste the same value into the Studio's **Access token** field
  (Configuration → connection settings). Requests without it now get `401`.
- [ ] **Never expose the agent worker or `:7880`/`:7881`/`:7882`** — the worker only makes
  *outbound* connections to LiveKit Cloud, so it needs no inbound ports.
- [ ] Keep `.env.local` readable only by your user (`chmod 600 .env.local`, the Studio
  writes it that way automatically).
- [ ] Prefer a **non-default port** and, if possible, restrict the source IP:
  ```powershell
  # Windows: only allow a known remote IP
  New-NetFirewallRule -DisplayName "Wave 2.0 (restricted)" -Direction Inbound `
    -Protocol TCP -LocalPort 8443 -RemoteAddress 203.0.113.7 -Action Allow
  ```
- [ ] For a real deployment, put **Caddy/nginx + Let's Encrypt** (or Cloudflare) in front
  and use a domain name instead of the bare IP.
- [ ] Rotate the LiveKit API key/secret if the machine was ever exposed without
  `STUDIO_ACCESS_TOKEN`.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[Errno 99] Cannot assign requested address` | Tried to bind a public IP that isn't on the machine | Use `--host 0.0.0.0`, or the `--host <public-ip> --yes` form above |
| `[Errno 98] Address already in use` | Port taken (often a previous run) | `--port 8444`, or stop the old process (`lsof -i :8443`) |
| Works on LAN, not from outside | Router rule / firewall / CGNAT | §2, §3, §5 |
| `ERR_CONNECTION_REFUSED` from outside | Rule points at the wrong LAN IP | Reserve the DHCP lease and re-check §2 |
| Mic blocked, "Cannot read properties of undefined" | Opened over plain `http://` on a non-localhost host | Use `--https` (§1) |
| Certificate warning names a different host | Cert generated before the IP/host was added | Delete `certs/`, re-run with `--host 182.183.90.63` |
| `403 Cross-origin requests are not allowed` | Browser origin ≠ API host (reverse proxy rewriting `Host`) | Serve UI + API from one origin, or preserve `Host` in the proxy |
| `503 not_configured` | No LiveKit credentials in `.env.local` | Add `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` |
| Demo mode works, Live mode silent | Agent worker not running | `uv run python -m backend.agent dev` (outbound only) |

---

## 9. Day-to-day commands

```bash
# Dev with hot reload on the LAN (HTTP, no mic)
python start.py --host 0.0.0.0

# Dev with hot reload + HTTPS (mic works on the LAN)
python start.py --host 0.0.0.0 --https

# Production single process (public IP in the certificate)
python start.py --mode prod --https --host 182.183.90.63 --yes --port 8443

# Regenerate the certificate only
python gen_cert.py --host 182.183.90.63 --local-addresses

# Keep it running after logout
nohup python start.py --mode prod --https --host 0.0.0.0 --port 8443 --no-open \
  > wave-studio.log 2>&1 &
# Windows: use Task Scheduler, NSSM, or `pm2 start` / `docker compose`
```

`python start.py --help` lists every flag (`--host`, `--port`, `--api-port`, `--mode`,
`--https`, `--cert`, `--key`, `--force-build`, `--no-open`, `--no-worker`, `--yes`).
