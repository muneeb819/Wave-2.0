#!/usr/bin/env python3
"""Cross-platform launcher for Wave 2.0 Studio (API + UI, optional agent worker).

Modes
-----
dev   Vite hot-reload UI on `--port` (5173) + FastAPI on `--api-port` (8000).
prod  Single FastAPI process serving the built `dist/` bundle on `--port` (8000).

Binding
-------
`--host` accepts anything the OS can bind: `127.0.0.1`, `0.0.0.0`, `::`, a LAN address
such as `192.168.1.20`, or a public IP that is actually assigned to one of this machine's
interfaces. If the address belongs to your router/ISP instead of this machine (the usual
case for a public IP behind NAT) the launcher explains exactly what to do instead of
failing with a raw `[Errno 99] Cannot assign requested address`.

Publishing over a LAN or the internet
-------------------------------------
Browsers only grant microphone access in a secure context (HTTPS or localhost), so any
publishing beyond your own machine needs `--https`. That generates a self-signed
certificate covering every host/IP you publish on (see `gen_cert.py`).

Examples
--------
    python start.py                                     # localhost dev, hot reload
    python start.py --host 0.0.0.0                      # LAN dev server, HTTP
    python start.py --mode prod --https --host 0.0.0.0 --port 8443
    python start.py --host 182.183.90.63 --mode prod --https   # public IP on this box
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERTS_DIR = ROOT / "certs"
DEFAULT_DEV_UI_PORT = 5173
DEFAULT_API_PORT = 8000
DEFAULT_PROD_PORT = 8000
WILDCARD_HOSTS = {"0.0.0.0", "::", ""}


# --------------------------------------------------------------------------------------
# Small, testable helpers
# --------------------------------------------------------------------------------------
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


# --------------------------------------------------------------------------------------
# Process helpers
# --------------------------------------------------------------------------------------
def resolve_python() -> str:
    candidates = [
        ROOT / ".venv" / "Scripts" / "python.exe",
        ROOT / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return sys.executable


def resolve_vite_cmd() -> list[str]:
    local_bin = ROOT / "node_modules" / ".bin" / ("vite.cmd" if os.name == "nt" else "vite")
    if local_bin.is_file():
        return [str(local_bin)]
    for pm in ("pnpm", "npm"):
        exe = shutil.which(pm)
        if exe:
            return [exe, "run", "dev", "--"]
    raise RuntimeError(
        "Node.js package manager not found. Install Node.js >= 20 and run `pnpm install`."
    )


def find_package_manager() -> str | None:
    for pm in ("pnpm", "npm"):
        exe = shutil.which(pm)
        if exe:
            return exe
    return None


def ensure_build(force: bool = False) -> None:
    """Build the production bundle into dist/ when missing or forced."""
    index = ROOT / "dist" / "index.html"
    if index.is_file() and not force:
        return
    pm = find_package_manager()
    if not pm:
        raise RuntimeError(
            "dist/ is missing and no Node.js package manager was found. "
            "Install Node.js >= 20 and run `pnpm install && pnpm run build`."
        )
    print("Building the production Studio bundle (dist/) ...", flush=True)
    result = subprocess.run([pm, "run", "build"], cwd=ROOT)
    if result.returncode != 0 or not index.is_file():
        raise RuntimeError("Production build failed. Run `pnpm run build` to see the error.")
    print("Build finished.", flush=True)


def wait_for_http(url: str, timeout: float = 20.0, insecure: bool = False) -> bool:
    if insecure:
        import ssl

        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    else:
        context = None
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5, context=context) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


def has_livekit_credentials(py: str) -> bool:
    code = (
        "from backend.config import CREDENTIAL_NAMES, environment; "
        "env = environment(); "
        "raise SystemExit(0 if all(env[k] for k in CREDENTIAL_NAMES) else 1)"
    )
    return (
        subprocess.run(
            [py, "-c", code],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode
        == 0
    )


def ensure_certificate(hosts: list[str], key: Path | None, cert: Path | None) -> tuple[Path, Path]:
    """Reuse `--key`/`--cert`, otherwise mint (or refresh) a cert covering every host."""
    if key and cert:
        for path in (key, cert):
            if not path.is_file():
                raise SystemExit(f"Certificate file not found: {path}")
        return key, cert

    from gen_cert import certificate_hosts, generate_self_signed_cert, normalise_hosts

    key_path = CERTS_DIR / "key.pem"
    cert_path = CERTS_DIR / "cert.pem"
    wanted = normalise_hosts(hosts)

    if key_path.is_file() and cert_path.is_file():
        try:
            covered = certificate_hosts(cert_path)
        except Exception:
            covered = []
        if all(host in covered for host in wanted):
            return key_path, cert_path

    key_path, cert_path = generate_self_signed_cert(
        CERTS_DIR,
        extra_hosts=wanted,
        include_local_addresses=True,
    )
    print(f"Generated TLS certificate for: {', '.join(certificate_hosts(cert_path))}")
    return key_path, cert_path


# --------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Launch the Wave 2.0 LiveKit Studio locally or on a LAN/public IP.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python start.py\n"
            "  python start.py --host 0.0.0.0\n"
            "  python start.py --mode prod --https --host 0.0.0.0 --port 8443\n"
            "  python start.py --host 192.168.1.20 --https\n"
        ),
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("WAVE_HOST", "127.0.0.1"),
        help="Interface to publish on (default: 127.0.0.1; use 0.0.0.0 for LAN).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help=f"Studio port (default: dev {DEFAULT_DEV_UI_PORT}, prod {DEFAULT_PROD_PORT}).",
    )
    parser.add_argument(
        "--api-port",
        type=int,
        default=int(os.environ.get("WAVE_API_PORT", DEFAULT_API_PORT)),
        help=f"FastAPI port in dev mode (default: {DEFAULT_API_PORT}).",
    )
    parser.add_argument(
        "--mode",
        choices=("dev", "prod"),
        default=os.environ.get("WAVE_MODE", "dev"),
        help="dev = Vite hot reload + API; prod = single process serving dist/.",
    )
    parser.add_argument("--https", action="store_true", help="Serve over TLS (needed for mic).")
    parser.add_argument("--cert", type=Path, default=None, help="Custom certificate PEM.")
    parser.add_argument("--key", type=Path, default=None, help="Custom private key PEM.")
    parser.add_argument(
        "--force-build",
        action="store_true",
        help="Rebuild dist/ before starting in prod mode.",
    )
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser.")
    parser.add_argument("--no-worker", action="store_true", help="Never start the agent worker.")
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Accept the wildcard fallback when --host is not a local address.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    py = resolve_python()
    host = normalise_host(args.host) or "127.0.0.1"
    scheme = "https" if args.https else "http"
    port = args.port or (DEFAULT_DEV_UI_PORT if args.mode == "dev" else DEFAULT_PROD_PORT)

    # --- Validate the requested bind address -----------------------------------------
    requested_host = host
    if not is_bindable(host):
        print(non_local_host_note(host, port, args.https), flush=True)
        if not args.yes:
            if sys.stdin.isatty():
                try:
                    answer = input("Continue by binding 0.0.0.0 instead? [y/N] ").strip().lower()
                except EOFError:
                    answer = ""
                if answer not in {"y", "yes"}:
                    return 2
            else:
                print("Re-run with --host 0.0.0.0 (or add --yes) to listen on every interface.\n")
                return 2
        host = "0.0.0.0"
        print("Binding 0.0.0.0 instead so the port is reachable from your network.\n")

    processes: list[subprocess.Popen[bytes]] = []

    def shutdown(*_args: object) -> None:
        print("\nStopping Wave 2.0 services...")
        for proc in reversed(processes):
            if proc.poll() is None:
                proc.terminate()
        deadline = time.monotonic() + 4.0
        for proc in reversed(processes):
            while proc.poll() is None and time.monotonic() < deadline:
                time.sleep(0.1)
            if proc.poll() is None:
                proc.kill()

    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    try:
        if args.mode == "prod":
            return run_production(args, py, host, port, scheme, requested_host, processes)
        return run_development(args, py, host, port, scheme, requested_host, processes, shutdown)
    except SystemExit:
        return 0
    finally:
        shutdown()


def certificate_hosts_for(host: str, requested_host: str) -> list[str]:
    """Hosts/IPs the certificate must cover for the address we actually serve on."""
    hosts = local_ipv4_addresses()
    for value in (host, requested_host):
        if value and value not in WILDCARD_HOSTS and value not in hosts:
            hosts.append(value)
    return hosts


def run_production(
    args: argparse.Namespace,
    py: str,
    host: str,
    port: int,
    scheme: str,
    requested_host: str = "",
    processes: list[subprocess.Popen[bytes]] | None = None,
) -> int:
    """Single uvicorn process: FastAPI serves both /api/* and the built Studio."""
    ensure_build(force=args.force_build)

    tls: list[str] = []
    if args.https:
        key, cert = ensure_certificate(
            certificate_hosts_for(host, requested_host),
            args.key,
            args.cert,
        )
        tls = ["--ssl-keyfile", str(key), "--ssl-certfile", str(cert)]

    command = [
        py,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        host,
        "--port",
        str(port),
        "--no-proxy-headers",
        *tls,
    ]
    print(f"Starting Wave 2.0 (production) on {scheme}://{host}:{port} ...", flush=True)
    proc = subprocess.Popen(command, cwd=ROOT)
    if processes is not None:
        processes.append(proc)

    health_host = "127.0.0.1" if host in WILDCARD_HOSTS else host
    ready = wait_for_http(
        f"{scheme}://{health_host}:{port}/api/health",
        timeout=45.0,
        insecure=args.https,
    )
    print_publication_summary(
        args, py, host, port, scheme, ready, prod=True, requested_host=requested_host
    )

    if not args.no_open:
        try:
            webbrowser.open(build_url(scheme, host, port))
        except Exception:
            pass

    return proc.wait()


def run_development(
    args: argparse.Namespace,
    py: str,
    host: str,
    port: int,
    scheme: str,
    requested_host: str,
    processes: list[subprocess.Popen[bytes]],
    shutdown,
) -> int:
    """FastAPI on :api-port plus the Vite dev server (hot reload) on :port."""
    api_host = host if host not in WILDCARD_HOSTS else "0.0.0.0"
    api_scheme = scheme
    tls: list[str] = []
    if args.https:
        key, cert = ensure_certificate(
            certificate_hosts_for(host, requested_host),
            args.key,
            args.cert,
        )
        os.environ["VITE_HTTPS_KEY"] = str(key)
        os.environ["VITE_HTTPS_CERT"] = str(cert)
        tls = ["--ssl-keyfile", str(key), "--ssl-certfile", str(cert)]

    os.environ["VITE_API_TARGET"] = f"{api_scheme}://127.0.0.1:{args.api_port}"

    print(
        f"Starting FastAPI backend on {api_scheme}://localhost:{args.api_port} ...",
        flush=True,
    )
    api_proc = subprocess.Popen(
        [
            py,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            api_host,
            "--port",
            str(args.api_port),
            "--no-proxy-headers",
            *tls,
        ],
        cwd=ROOT,
    )
    processes.append(api_proc)

    if not args.no_worker and has_livekit_credentials(py):
        print("LiveKit credentials detected in .env.local -> starting agent worker ...")
        processes.append(subprocess.Popen([py, "-m", "backend.agent", "dev"], cwd=ROOT))

    try:
        vite_cmd = resolve_vite_cmd()
        print(f"Starting Wave 2.0 Studio dev server on {scheme}://{host}:{port} ...", flush=True)
        env = {**os.environ, "VITE_HOST": host, "VITE_PORT": str(port)}
        web_proc = subprocess.Popen(
            [*vite_cmd, "--host", host, "--port", str(port), "--strictPort"],
            cwd=ROOT,
            env=env,
        )
        processes.append(web_proc)
        ready = wait_for_http(
            f"{scheme}://127.0.0.1:{port}",
            timeout=30.0,
            insecure=args.https,
        )
    except RuntimeError as exc:
        print(f"Note: {exc} Falling back to the built bundle on port {args.api_port}.")
        ready = wait_for_http(
            f"{api_scheme}://127.0.0.1:{args.api_port}/api/health",
            timeout=20.0,
            insecure=args.https,
        )
        port = args.api_port

    wait_for_http(
        f"{api_scheme}://127.0.0.1:{args.api_port}/api/health",
        timeout=20.0,
        insecure=args.https,
    )
    print_publication_summary(
        args, py, host, port, scheme, ready, prod=False, requested_host=requested_host
    )

    if not args.no_open:
        try:
            webbrowser.open(build_url(scheme, host, port))
        except Exception:
            pass

    while True:
        for proc in processes:
            code = proc.poll()
            if code is not None:
                return code
        time.sleep(0.4)


def print_publication_summary(
    args: argparse.Namespace,
    py: str,
    host: str,
    port: int,
    scheme: str,
    ready: bool,
    *,
    prod: bool,
    requested_host: str = "",
) -> None:
    local_url = build_url(scheme, "localhost", port)
    urls = [f"  Local     : {local_url}"]
    if host in WILDCARD_HOSTS:
        for address in local_ipv4_addresses():
            urls.append(f"  Network   : {build_url(scheme, address, port)}")
    elif host not in {"127.0.0.1", "localhost", "::1"}:
        urls.append(f"  Bind host : {build_url(scheme, host, port)}")
    if requested_host and requested_host != host and requested_host not in WILDCARD_HOSTS:
        urls.append(
            f"  Published : {build_url(scheme, requested_host, port)}  (after port forwarding)"
        )

    if prod:
        api_line = f"  API       : {build_url(scheme, 'localhost', port)}/api/health"
    else:
        api_line = f"  API       : {build_url(scheme, 'localhost', args.api_port)}/api/health"

    status = "ready" if ready else "still starting (check the log above)"
    print(
        "\nWave 2.0 is running"
        f" [{'prod' if prod else 'dev'}, {scheme.upper()}] - {status}\n"
        + "\n".join(urls)
        + f"\n{api_line}"
    )

    if scheme == "https":
        print(
            "\nTLS note: the certificate is self-signed, so the first visit shows a warning.\n"
            "          Choose Advanced -> Proceed to continue (required for microphone access)."
        )
    elif host not in WILDCARD_HOSTS and host not in {"127.0.0.1", "localhost", "::1"}:
        print(
            "\nWarning: plain HTTP on a non-localhost address is NOT a secure context, so\n"
            "         Chrome/Edge/Safari will block the microphone and Live sessions cannot\n"
            "         connect. Re-run with --https to publish with TLS."
        )

    if host in WILDCARD_HOSTS and not args.no_worker:
        print(
            "\nSecurity: you are listening on every interface. Set STUDIO_ACCESS_TOKEN in\n"
            "          .env.local before exposing this beyond your own network."
        )


if __name__ == "__main__":
    raise SystemExit(main())
