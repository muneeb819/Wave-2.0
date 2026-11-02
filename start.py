#!/usr/bin/env python3
"""Cross-platform launcher for Wave 2.0 Studio (API + UI, optional agent worker).

Modes
-----
dev   Vite hot-reload UI on `--port` (5173) + FastAPI on `--api-port` (8000).
prod  Single FastAPI process serving the built `dist/` bundle on `--port` (8000).

Examples
--------
    python start.py                                     # localhost dev, hot reload
    python start.py --host 0.0.0.0                      # LAN dev server, HTTP
    python start.py --mode prod --https --host 0.0.0.0 --port 8443
    python start.py --preflight --json                  # machine-readable readiness check
"""

from __future__ import annotations

import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

from backend.launcher_net import (
    CERTS_DIR,
    ROOT,
    WILDCARD_HOSTS,
    build_redirect_handler,
    build_url,
    certificate_hosts_for,
    ensure_certificate,
    is_bindable,
    local_ipv4_addresses,
    non_local_host_note,
    normalise_host,
    publishing_risks,
    start_http_redirect,
    stop_http_redirects,
)

DEFAULT_DEV_UI_PORT = 5173
DEFAULT_API_PORT = 8000
DEFAULT_PROD_PORT = 8000

__all__ = [
    "CERTS_DIR",
    "DEFAULT_API_PORT",
    "DEFAULT_DEV_UI_PORT",
    "DEFAULT_PROD_PORT",
    "ROOT",
    "WILDCARD_HOSTS",
    "build_redirect_handler",
    "build_url",
    "certificate_hosts_for",
    "ensure_certificate",
    "is_bindable",
    "local_ipv4_addresses",
    "main",
    "non_local_host_note",
    "normalise_host",
    "parse_args",
    "publishing_risks",
    "start_http_redirect",
    "stop_http_redirects",
]


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


def studio_token() -> str:
    """STUDIO_ACCESS_TOKEN from the environment or .env.local (never printed)."""
    if os.environ.get("STUDIO_ACCESS_TOKEN"):
        return os.environ["STUDIO_ACCESS_TOKEN"].strip()
    env_file = ROOT / ".env.local"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            key, _, value = line.strip().partition("=")
            if key.strip() == "STUDIO_ACCESS_TOKEN":
                return value.strip().strip("'\"")
    return ""


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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Launch the Wave 2.0 LiveKit Studio locally or on a LAN/public IP.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python start.py\n"
            "  python start.py --host 0.0.0.0\n"
            "  python start.py --mode prod --https --host 0.0.0.0 --port 8443\n"
            "  python start.py --preflight --json\n"
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
    parser.add_argument(
        "--http-port",
        type=int,
        default=None,
        help="Also listen on this plain-HTTP port and redirect to https (needs --https).",
    )
    parser.add_argument(
        "--preflight",
        action="store_true",
        help="Run deployment readiness checks (env, token, port, TLS, build) and exit.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit preflight output as structured JSON (used with --preflight).",
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

    if args.preflight:
        from preflight import exit_code, format_json_report, format_report, run_preflight

        report = run_preflight(host=host, port=port, https=args.https, mode=args.mode)
        print(format_json_report(report) if args.json else format_report(report))
        return exit_code(report)

    if args.http_port is not None and not args.https:
        print("--http-port only makes sense with --https (it redirects plain HTTP to TLS).")
        return 2

    if args.http_port is not None and args.mode != "prod":
        print("Note: --http-port is only used in --mode prod; ignoring it here.")

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
        return run_development(args, py, host, port, scheme, requested_host, processes)
    except SystemExit:
        return 0
    finally:
        stop_http_redirects()
        shutdown()


def run_production(
    args: argparse.Namespace,
    py: str,
    host: str,
    port: int,
    scheme: str,
    requested_host: str = "",
    processes: list[subprocess.Popen[bytes]] | None = None,
) -> int:
    ensure_build(force=args.force_build)

    tls: list[str] = []
    if args.https:
        key, cert = ensure_certificate(
            certificate_hosts_for(host, requested_host), args.key, args.cert, CERTS_DIR
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

    if args.https and args.http_port:
        start_http_redirect(requested_host or host, port, args.http_port)

    health_host = "127.0.0.1" if host in WILDCARD_HOSTS else host
    ready = wait_for_http(
        f"{scheme}://{health_host}:{port}/api/health", timeout=45.0, insecure=args.https
    )
    print_publication_summary(
        args, host, port, scheme, ready, prod=True, requested_host=requested_host
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
) -> int:
    api_host = host if host not in WILDCARD_HOSTS else "0.0.0.0"
    tls: list[str] = []
    if args.https:
        key, cert = ensure_certificate(
            certificate_hosts_for(host, requested_host), args.key, args.cert, CERTS_DIR
        )
        os.environ["VITE_HTTPS_KEY"] = str(key)
        os.environ["VITE_HTTPS_CERT"] = str(cert)
        tls = ["--ssl-keyfile", str(key), "--ssl-certfile", str(cert)]

    os.environ["VITE_API_TARGET"] = f"{scheme}://127.0.0.1:{args.api_port}"
    print(f"Starting FastAPI backend on {scheme}://localhost:{args.api_port} ...", flush=True)
    processes.append(
        subprocess.Popen(
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
    )

    if not args.no_worker and has_livekit_credentials(py):
        print("LiveKit credentials detected in .env.local -> starting agent worker ...")
        processes.append(subprocess.Popen([py, "-m", "backend.agent", "dev"], cwd=ROOT))

    try:
        vite_cmd = resolve_vite_cmd()
        print(f"Starting Wave 2.0 Studio dev server on {scheme}://{host}:{port} ...", flush=True)
        env = {**os.environ, "VITE_HOST": host, "VITE_PORT": str(port)}
        processes.append(
            subprocess.Popen(
                [*vite_cmd, "--host", host, "--port", str(port), "--strictPort"],
                cwd=ROOT,
                env=env,
            )
        )
        ready = wait_for_http(f"{scheme}://127.0.0.1:{port}", timeout=30.0, insecure=args.https)
    except RuntimeError as exc:
        print(f"Note: {exc} Falling back to the built bundle on port {args.api_port}.")
        ready = wait_for_http(
            f"{scheme}://127.0.0.1:{args.api_port}/api/health", timeout=20.0, insecure=args.https
        )
        port = args.api_port

    wait_for_http(
        f"{scheme}://127.0.0.1:{args.api_port}/api/health", timeout=20.0, insecure=args.https
    )
    print_publication_summary(
        args, host, port, scheme, ready, prod=False, requested_host=requested_host
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
    host: str,
    port: int,
    scheme: str,
    ready: bool,
    *,
    prod: bool,
    requested_host: str = "",
) -> None:
    urls = [f"  Local     : {build_url(scheme, 'localhost', port)}"]
    if host in WILDCARD_HOSTS:
        for address in local_ipv4_addresses():
            urls.append(f"  Network   : {build_url(scheme, address, port)}")
    elif host not in {"127.0.0.1", "localhost", "::1"}:
        urls.append(f"  Bind host : {build_url(scheme, host, port)}")
    if requested_host and requested_host != host and requested_host not in WILDCARD_HOSTS:
        urls.append(
            f"  Published : {build_url(scheme, requested_host, port)}  (after port forwarding)"
        )

    api_port = port if prod else args.api_port
    api_line = f"  API       : {build_url(scheme, 'localhost', api_port)}/api/health"
    status = "ready" if ready else "still starting (check the log above)"
    print(
        f"\nWave 2.0 is running [{'prod' if prod else 'dev'}, {scheme.upper()}] - {status}\n"
        + "\n".join(urls)
        + f"\n{api_line}",
        flush=True,
    )

    if scheme == "https":
        print(
            "\nTLS note: the certificate is self-signed, so the first visit shows a warning.\n"
            "          Choose Advanced -> Proceed to continue (required for microphone access).",
            flush=True,
        )
    elif host not in WILDCARD_HOSTS and host not in {"127.0.0.1", "localhost", "::1"}:
        print(
            "\nWarning: plain HTTP on a non-localhost address is NOT a secure context, so\n"
            "         Chrome/Edge/Safari will block the microphone and Live sessions cannot\n"
            "         connect. Re-run with --https to publish with TLS.",
            flush=True,
        )

    exposure = host if host not in WILDCARD_HOSTS else (requested_host or "0.0.0.0")
    for message in publishing_risks(exposure, studio_token()):
        print(f"\nWarning: {message}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
