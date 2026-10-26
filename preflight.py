"""Pre-flight readiness checks for a live Wave 2.0 deployment.

Run before going live (or before asking someone else to open the URL):

    python start.py --preflight --mode prod --https --host 182.183.90.63 --port 8443

Every check is a pure function so the suite can prove the checklist still works.
Checks never contact the network and never start the server.
"""

from __future__ import annotations

import importlib.util
import shutil
import socket
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERTS_DIR = ROOT / "certs"
WILDCARD_HOSTS = frozenset({"0.0.0.0", "::", ""})
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
KEY_FILE = "key.pem"
CERT_FILE = "cert.pem"

OK = "ok"
WARN = "warn"
FAIL = "fail"

MIN_PYTHON = (3, 10)
MIN_TOKEN_LENGTH = 16
REQUIRED_MODULES = ("fastapi", "uvicorn", "dotenv", "pydantic", "livekit.api", "cryptography")
PLACEHOLDER_PREFIXES = (
    "your-",
    "your_",
    "replace",
    "changeme",
    "change-me",
    "xxx",
    "todo",
    "<",
)


@dataclass(frozen=True)
class Check:
    """One line of the readiness report."""

    status: str
    name: str
    detail: str

    @property
    def failed(self) -> bool:
        return self.status == FAIL


def read_env_file(path: Path) -> dict[str, str]:
    """Parse a KEY=VALUE file without importing python-dotenv (works on a bare install)."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value.strip().strip("'\"")
    return values


def is_placeholder(value: str) -> bool:
    """Empty, too short, or still one of the .env.example placeholders."""
    lowered = value.strip().lower()
    return len(lowered) < 8 or any(lowered.startswith(prefix) for prefix in PLACEHOLDER_PREFIXES)


def clean_host(value: str) -> str:
    """Strip scheme, path and port so `https://1.2.3.4:8443/` becomes `1.2.3.4`."""
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


def can_bind(host: str) -> bool:
    """True when this machine owns `host` (the OS can bind a socket to it)."""
    host = clean_host(host)
    if host in WILDCARD_HOSTS or host in LOOPBACK_HOSTS:
        return True
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.bind((host, 0))
        return True
    except OSError:
        return False


def certificate_targets(host: str) -> list[str]:
    """Hosts the certificate should cover for a launch on `host`."""
    targets = ["localhost", "127.0.0.1", "::1"]
    try:
        from gen_cert import local_ipv4_addresses
    except ImportError:  # cryptography missing: the dependency check already reports it
        local_ipv4_addresses = lambda: []  # noqa: E731
    targets.extend(address for address in local_ipv4_addresses() if address not in targets)
    cleaned = clean_host(host)
    if cleaned and cleaned not in WILDCARD_HOSTS and cleaned not in targets:
        targets.append(cleaned)
    return targets


def port_is_free(host: str, port: int) -> bool:
    """True when a server could bind the port now.

    SO_REUSEADDR mirrors what uvicorn and http.server do, so sockets left in TIME_WAIT
    by a restart do not produce a false "port already in use"; a real listener still
    makes the bind fail.
    """
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    try:
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
        return True
    except OSError:
        return False


# --------------------------------------------------------------------------------------
# Individual checks
# --------------------------------------------------------------------------------------
def check_python() -> Check:
    if sys.version_info >= MIN_PYTHON:
        return Check(OK, "Python", f"{sys.version.split()[0]} (needs >= 3.10)")
    return Check(
        FAIL,
        "Python",
        f"{sys.version.split()[0]} is too old; install Python 3.10+ from python.org",
    )


def check_dependencies() -> Check:
    missing = [name for name in REQUIRED_MODULES if importlib.util.find_spec(name) is None]
    if not missing:
        return Check(OK, "Python packages", "fastapi, uvicorn, livekit, cryptography present")
    return Check(
        FAIL,
        "Python packages",
        f"missing: {', '.join(missing)} - run `uv sync` (or pip install -e .)",
    )


def check_node_tooling(prebuilt: bool) -> Check:
    node = shutil.which("node")
    package_manager = shutil.which("pnpm") or shutil.which("npm")
    if node and package_manager:
        return Check(OK, "Node tooling", f"{node} + {Path(package_manager).name}")
    if prebuilt:
        return Check(
            WARN,
            "Node tooling",
            "node/pnpm not found, but dist/ is already built - only needed to rebuild the UI",
        )
    return Check(FAIL, "Node tooling", "install Node.js 20+ and pnpm, then `pnpm install`")


def check_ui_build(root: Path, mode: str) -> Check:
    index = root / "dist" / "index.html"
    if not index.is_file():
        if mode == "prod":
            return Check(
                WARN,
                "UI bundle",
                "dist/ is missing - start.py builds it on launch (needs node + pnpm)",
            )
        return Check(OK, "UI bundle", "dev mode uses Vite, no bundle needed")
    newest_source = 0.0
    for candidate in (root / "src").rglob("*"):
        if candidate.is_file():
            newest_source = max(newest_source, candidate.stat().st_mtime)
    if newest_source and index.stat().st_mtime < newest_source:
        return Check(WARN, "UI bundle", "dist/ is older than src/ - rebuild with `pnpm run build`")
    return Check(OK, "UI bundle", f"dist/index.html present ({index.stat().st_size} bytes)")


def check_env_file(env_path: Path, *, public: bool) -> list[Check]:
    """Configuration checks: credentials, placeholder detection, access token strength."""
    checks: list[Check] = []
    values = read_env_file(env_path)
    if not env_path.is_file():
        checks.append(
            Check(
                WARN,
                ".env.local",
                "not found - the Studio starts in Demo mode (copy .env.example to .env.local)",
            )
        )
        if public:
            checks.append(
                Check(
                    FAIL, "Access token", "set STUDIO_ACCESS_TOKEN in .env.local before publishing"
                )
            )
        return checks

    checks.append(Check(OK, ".env.local", str(env_path)))
    missing = [
        name
        for name in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")
        if is_placeholder(values.get(name, ""))
    ]
    configured = not missing
    if configured:
        checks.append(Check(OK, "LiveKit Cloud", "URL, API key and secret are set"))
    else:
        checks.append(
            Check(
                WARN,
                "LiveKit Cloud",
                f"{', '.join(missing)} missing or placeholder - voice sessions will answer 503",
            )
        )

    token = values.get("STUDIO_ACCESS_TOKEN", "")
    if not token:
        checks.append(
            Check(
                FAIL if public else WARN,
                "Access token",
                "STUDIO_ACCESS_TOKEN is empty - remote browsers can only view the UI"
                if public
                else "not set (fine on localhost; required before publishing)",
            )
        )
    elif len(token) < MIN_TOKEN_LENGTH:
        checks.append(
            Check(WARN, "Access token", f"only {len(token)} characters - use 32+ random characters")
        )
    else:
        checks.append(Check(OK, "Access token", f"set ({len(token)} characters)"))
    return checks


def check_bind_host(host: str, wildcard_hosts: frozenset[str]) -> Check:
    if host in wildcard_hosts:
        return Check(OK, "Bind address", f"{host} (every interface)")
    if can_bind(host):
        return Check(OK, "Bind address", f"{host} belongs to this machine")
    return Check(
        WARN,
        "Bind address",
        f"{host} is not on this machine (router/ISP address) - start.py binds 0.0.0.0 "
        "and the router must forward the port",
    )


def check_port(host: str, port: int, wildcard_hosts: frozenset[str]) -> Check:
    probe_host = "0.0.0.0" if host in wildcard_hosts or not can_bind(host) else host
    if port_is_free(probe_host, port):
        return Check(OK, "Port", f"TCP {port} is free on {probe_host}")
    return Check(
        FAIL,
        "Port",
        f"TCP {port} is already in use on {probe_host} - stop the other process "
        "(another Studio?) or pick a different --port",
    )


def check_certificate(certs_dir: Path, hosts: list[str], *, https: bool) -> Check:
    if not https:
        return Check(
            WARN,
            "TLS certificate",
            "publishing without --https - browsers will block the microphone on an IP address",
        )
    key, cert = certs_dir / KEY_FILE, certs_dir / CERT_FILE
    if not (key.is_file() and cert.is_file()):
        return Check(OK, "TLS certificate", "not created yet - start.py generates one on launch")

    try:
        from gen_cert import certificate_hosts

        covered = certificate_hosts(cert)
    except Exception as exc:  # corrupt PEM, wrong file, ...
        return Check(FAIL, "TLS certificate", f"{cert} cannot be read ({exc}) - delete certs/")
    missing = [host for host in hosts if host not in covered]
    if missing:
        return Check(
            WARN,
            "TLS certificate",
            f"covers {', '.join(covered)}; {', '.join(missing)} will trigger a browser warning",
        )
    return Check(OK, "TLS certificate", f"covers {', '.join(covered)}")


def check_public_exposure(host: str, wildcard_hosts: frozenset[str], token: str) -> Check:
    local_only = host in wildcard_hosts | LOOPBACK_HOSTS
    if local_only:
        return Check(OK, "Exposure", "local only")
    if token:
        return Check(OK, "Exposure", f"reachable from the network at {host}, token required")
    return Check(
        FAIL,
        "Exposure",
        f"{host} is reachable from the network without STUDIO_ACCESS_TOKEN - "
        "anyone could open sessions and spend LiveKit credits",
    )


# --------------------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------------------
def run_preflight(
    *,
    host: str,
    port: int,
    https: bool,
    mode: str,
    root: Path = ROOT,
    certs_dir: Path | None = None,
    env_path: Path | None = None,
) -> list[Check]:
    """Run every readiness check against the configuration about to be served."""
    cleaned = clean_host(host)
    hosts = certificate_targets(cleaned)
    env_file = env_path or root / ".env.local"
    values = read_env_file(env_file)
    public = cleaned not in WILDCARD_HOSTS | LOOPBACK_HOSTS

    checks = [
        check_python(),
        check_dependencies(),
        check_node_tooling(prebuilt=(root / "dist" / "index.html").is_file()),
        check_ui_build(root, mode),
    ]
    checks.extend(check_env_file(env_file, public=public))
    checks.append(
        check_public_exposure(cleaned, WILDCARD_HOSTS, values.get("STUDIO_ACCESS_TOKEN", ""))
    )
    checks.append(check_bind_host(cleaned, WILDCARD_HOSTS))
    checks.append(check_port(cleaned, port, WILDCARD_HOSTS))
    checks.append(check_certificate(certs_dir or root / "certs", hosts, https=https))
    return checks


def format_report(checks: list[Check], *, title: str = "Wave 2.0 deployment pre-flight") -> str:
    labels = {OK: "[ OK ]", WARN: "[WARN]", FAIL: "[FAIL]"}
    width = max((len(check.name) for check in checks), default=8)
    lines = ["", title, "=" * len(title), ""]
    for check in checks:
        lines.append(f"  {labels[check.status]}  {check.name.ljust(width)}  {check.detail}")
    failures = sum(1 for check in checks if check.failed)
    warnings = sum(1 for check in checks if check.status == WARN)
    lines.append("")
    if failures:
        lines.append(
            f"  {failures} blocking problem(s), {warnings} warning(s). Fix the [FAIL] lines first."
        )
    elif warnings:
        lines.append(f"  Ready to launch, with {warnings} warning(s) to review.")
    else:
        lines.append("  All checks passed - ready for live deployment.")
    lines.append("")
    return "\n".join(lines)


def exit_code(checks: list[Check]) -> int:
    return 1 if any(check.failed for check in checks) else 0
