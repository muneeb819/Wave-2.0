"""Stdlib-only network, URL, TLS certificate, and HTTP->HTTPS redirect helpers for start.py."""

from __future__ import annotations

import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CERTS_DIR = ROOT / "certs"
WILDCARD_HOSTS = {"0.0.0.0", "::", ""}

_redirect_servers: list[ThreadingHTTPServer] = []


def normalise_host(value: str | None) -> str:
    """Strip scheme, path, and port from a user-supplied host/IP."""
    host = (value or "").strip()
    for prefix in ("https://", "http://", "wss://", "ws://"):
        if host.lower().startswith(prefix):
            host = host[len(prefix) :]
    host = host.split("/", 1)[0]
    if host.startswith("["):  # [::1]:8443
        return host.split("]", 1)[0].lstrip("[")
    if host.count(":") == 1:  # host:port
        return host.split(":", 1)[0]
    return host


def is_bindable(host: str, port: int = 0) -> bool:
    """True when this machine owns `host`, i.e. the OS can bind a socket to it."""
    host = normalise_host(host)
    if host in WILDCARD_HOSTS or host in {"localhost", "127.0.0.1", "::1"}:
        return True
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.bind((host, port))
        return True
    except OSError:
        return False


def local_ipv4_addresses() -> list[str]:
    """Best-effort list of this machine's non-loopback IPv4 addresses."""
    found: list[str] = []
    for probe in ("10.255.255.255", "192.168.255.255", "172.31.255.255"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(0.2)
                sock.connect((probe, 1))
                candidate = sock.getsockname()[0]
            if candidate and not candidate.startswith("127.") and candidate not in found:
                found.append(candidate)
                break
        except OSError:
            continue
    try:
        for candidate in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not candidate.startswith("127.") and candidate not in found:
                found.append(candidate)
    except OSError:
        pass
    return found


def build_url(scheme: str, host: str, port: int) -> str:
    """Assemble an origin string, bracketing IPv6 and omitting default ports."""
    cleaned = normalise_host(host)
    if cleaned in WILDCARD_HOSTS:
        cleaned = "localhost"
    if ":" in cleaned:
        cleaned = f"[{cleaned}]"
    default = 443 if scheme == "https" else 80
    suffix = "" if port == default else f":{port}"
    return f"{scheme}://{cleaned}{suffix}"


def non_local_host_note(host: str, port: int, https: bool) -> str:
    """Explain why a public/router address cannot be bound here and what to do instead."""
    scheme = "https" if https else "http"
    return f"""
{host} is not assigned to any interface on this machine, so it cannot be bound directly.

That address is almost certainly your router's public (WAN) IP. A public IP is not a
network card on your PC: traffic reaches it only after your router forwards the port to
this machine. Publishing there takes three steps:

  1. Run the app on this machine, listening on every interface:
       python start.py --mode prod --https --host 0.0.0.0 --port {port}

  2. Allow the port through the local firewall:
       Windows : New-NetFirewallRule -DisplayName "Wave 2.0" -Direction Inbound ^
                 -Protocol TCP -LocalPort {port} -Action Allow
       Linux   : sudo ufw allow {port}/tcp
       macOS   : System Settings > Network > Firewall > Options > allow Python

  3. Forward TCP {port} on your router to this machine's LAN address
     ({", ".join(local_ipv4_addresses()) or "see `ipconfig` / `ip addr`"}).
     Router admin page -> Port Forwarding / Virtual Server -> TCP {port} -> <LAN IP>.

Then open  {scheme}://{host}:{port}

Two things to check first:
  * CGNAT: compare the WAN address shown in your router with the IP a site such as
    ifconfig.me reports. If they differ, your ISP shares the address (PTCL/StormFiber
    commonly do) and port forwarding cannot work. In that case publish from a machine
    that has a real public IPv4, or use a tunnel (Cloudflare Tunnel, Tailscale Funnel,
    or ngrok) which gives you an HTTPS hostname without opening any port.
  * Security: this Studio ships a development token service with no user accounts.
    Set STUDIO_ACCESS_TOKEN in .env.local before exposing it to the internet, and keep
    .env.local and the agent worker off any untrusted network.
"""


def build_redirect_handler(public_host: str, https_port: int) -> type[BaseHTTPRequestHandler]:
    """301 every plain-HTTP request to the matching https URL (keeps the path/query)."""

    class RedirectHandler(BaseHTTPRequestHandler):
        server_version = "WaveRedirect/2.0"
        sys_version = ""

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._redirect()

        def do_HEAD(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            self._redirect()

        def _redirect(self) -> None:
            requested = normalise_host(self.headers.get("Host", "")) or public_host or "localhost"
            target = build_url("https", requested, https_port) + self.path
            body = f"Redirecting to {target}\n".encode()
            self.send_response(301)
            self.send_header("Location", target)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            return

    return RedirectHandler


def start_http_redirect(
    public_host: str, https_port: int, http_port: int
) -> ThreadingHTTPServer | None:
    """Listen on `http_port` and redirect to https; returns None when the port is unusable."""
    try:
        server = ThreadingHTTPServer(
            ("0.0.0.0", http_port), build_redirect_handler(public_host, https_port)
        )
    except OSError as exc:
        print(
            f"Note: could not listen on HTTP port {http_port} ({exc}).\n"
            "      Port 80 needs admin/root; try --http-port 8080 or forward 80 -> 8080."
        )
        return None
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, name="wave-http-redirect", daemon=True).start()
    _redirect_servers.append(server)
    print(
        f"HTTP -> HTTPS redirect listening on port {http_port} (https://<host>:{https_port})",
        flush=True,
    )
    return server


def stop_http_redirects() -> None:
    for server in _redirect_servers:
        try:
            server.shutdown()
            server.server_close()
        except Exception:
            pass
    _redirect_servers.clear()


def publishing_risks(host: str, token: str) -> list[str]:
    """Warnings worth printing before a network-visible launch."""
    if host in {"127.0.0.1", "localhost", "::1", ""}:
        return []
    messages: list[str] = []
    if not token:
        messages.append(
            "STUDIO_ACCESS_TOKEN is empty: anyone who can reach this port can open sessions\n"
            "        and spend LiveKit inference credits. Set it in .env.local or run\n"
            "        `python start.py --preflight --https --host " + host + "`."
        )
    messages.append(
        "The router must forward the published TCP port to this machine, and the local\n"
        "        firewall must allow it - see PUBLISH_IP.md (or run publish-wave.ps1 on Windows)."
    )
    return messages


def certificate_hosts_for(host: str, requested_host: str) -> list[str]:
    """Hosts/IPs the certificate must cover for the address we actually serve on."""
    hosts = local_ipv4_addresses()
    for value in (host, requested_host):
        if value and value not in WILDCARD_HOSTS and value not in hosts:
            hosts.append(value)
    return hosts


def ensure_certificate(
    hosts: list[str],
    key: Path | None,
    cert: Path | None,
    certs_dir: Path = CERTS_DIR,
) -> tuple[Path, Path]:
    """Reuse `--key`/`--cert`, otherwise mint (or refresh) a cert covering every host."""
    if key and cert:
        for path in (key, cert):
            if not path.is_file():
                raise SystemExit(f"Certificate file not found: {path}")
        return key, cert

    from gen_cert import certificate_hosts, generate_self_signed_cert, normalise_hosts

    key_path = certs_dir / "key.pem"
    cert_path = certs_dir / "cert.pem"
    wanted = normalise_hosts(hosts)

    if key_path.is_file() and cert_path.is_file():
        try:
            covered = certificate_hosts(cert_path)
        except Exception:
            covered = []
        if all(host in covered for host in wanted):
            return key_path, cert_path

    key_path, cert_path = generate_self_signed_cert(
        certs_dir,
        extra_hosts=wanted,
        include_local_addresses=True,
    )
    print(f"Generated TLS certificate for: {', '.join(certificate_hosts(cert_path))}")
    return key_path, cert_path
