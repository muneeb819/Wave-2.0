"""Offline tests for the live-deployment surface: pre-flight checks and HTTP redirects.

Nothing here binds a public port, contacts LiveKit, or forwards anything on a router.
"""

from __future__ import annotations

import importlib.util
import socket
import urllib.error
import urllib.request
from pathlib import Path
from types import ModuleType

import pytest

import preflight
from preflight import (
    FAIL,
    OK,
    WARN,
    Check,
    check_certificate,
    check_env_file,
    check_port,
    check_public_exposure,
    exit_code,
    format_report,
    is_placeholder,
    port_is_free,
    read_env_file,
    run_preflight,
)

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_IP = "182.183.90.63"


def _load_launcher() -> ModuleType:
    """Import start.py by path (it is a launcher script, not an installed module)."""
    spec = importlib.util.spec_from_file_location("wave_launcher_deploy", ROOT / "start.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def launcher() -> ModuleType:
    return _load_launcher()


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


# ---------------------------------------------------------------------------- env parsing
def test_read_env_file_ignores_comments_and_quotes(tmp_path: Path):
    env = tmp_path / ".env.local"
    env.write_text(
        "# comment\n\nLIVEKIT_URL=wss://demo.livekit.cloud\nSTUDIO_ACCESS_TOKEN='quoted-value'\n",
        encoding="utf-8",
    )
    values = read_env_file(env)
    assert values["LIVEKIT_URL"] == "wss://demo.livekit.cloud"
    assert values["STUDIO_ACCESS_TOKEN"] == "quoted-value"
    assert read_env_file(tmp_path / "missing") == {}


@pytest.mark.parametrize(
    ("value", "placeholder"),
    [
        ("", True),
        ("short", True),
        ("your-livekit-api-key", True),
        ("replace-with-a-long-random-string", True),
        ("<secret>", True),
        ("APIdemo1234567890", False),
        ("secret_demo_1234567890abcdef", False),
    ],
)
def test_placeholder_detection(value: str, placeholder: bool):
    assert is_placeholder(value) is placeholder


# ------------------------------------------------------------------------- env checklist
def test_env_file_missing_is_a_warning_locally_but_fatal_when_public(tmp_path: Path):
    local = check_env_file(tmp_path / ".env.local", public=False)
    assert [check.status for check in local] == [WARN]
    public = check_env_file(tmp_path / ".env.local", public=True)
    assert any(check.status == FAIL for check in public)


def test_env_file_with_credentials_and_strong_token_passes(tmp_path: Path):
    env = tmp_path / ".env.local"
    env.write_text(
        "LIVEKIT_URL=wss://demo.livekit.cloud\n"
        "LIVEKIT_API_KEY=APIdemo1234567890\n"
        "LIVEKIT_API_SECRET=a-real-secret-value-1234567890\n"
        "STUDIO_ACCESS_TOKEN=0123456789abcdef0123456789abcdef\n",
        encoding="utf-8",
    )
    checks = check_env_file(env, public=True)
    assert all(check.status == OK for check in checks), [c.detail for c in checks]


def test_short_token_is_flagged(tmp_path: Path):
    env = tmp_path / ".env.local"
    env.write_text("STUDIO_ACCESS_TOKEN=tooshort\n", encoding="utf-8")
    token_check = [c for c in check_env_file(env, public=False) if c.name == "Access token"][0]
    assert token_check.status == WARN


# ------------------------------------------------------------------------ port + exposure
def test_port_check_detects_a_listening_socket():
    port = free_port()
    assert port_is_free("127.0.0.1", port) is True
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as occupied:
        occupied.bind(("127.0.0.1", port))
        occupied.listen(1)
        assert port_is_free("127.0.0.1", port) is False
        assert check_port("127.0.0.1", port, set()).status == FAIL
    assert check_port("127.0.0.1", port, set()).status == OK


def test_public_exposure_requires_a_token():
    assert check_public_exposure(PUBLIC_IP, set(), "").status == FAIL
    assert check_public_exposure(PUBLIC_IP, set(), "a" * 32).status == OK
    assert check_public_exposure("127.0.0.1", set(), "").status == OK
    assert check_public_exposure("0.0.0.0", {"0.0.0.0"}, "a" * 32).status == OK


# ---------------------------------------------------------------------------- TLS check
def test_certificate_check_accepts_missing_certs_but_flags_plain_http(tmp_path: Path):
    assert check_certificate(tmp_path, ["localhost"], https=True).status == OK
    assert "browsers will block" in check_certificate(tmp_path, ["localhost"], https=False).detail


# ------------------------------------------------------------------------------- report
def test_report_renders_every_status_and_sets_the_exit_code():
    checks = [
        Check(OK, "Python", "3.12"),
        Check(WARN, "Port", "busy"),
        Check(FAIL, "Token", "unset"),
    ]
    report = format_report(checks)
    assert "[ OK ]" in report and "[WARN]" in report and "[FAIL]" in report
    assert "1 blocking problem" in report
    assert exit_code(checks) == 1
    assert exit_code([Check(OK, "Python", "3.12")]) == 0


def test_run_preflight_covers_the_whole_deployment_checklist(tmp_path: Path):
    (tmp_path / "src").mkdir()
    checks = run_preflight(
        host=PUBLIC_IP,
        port=free_port(),
        https=True,
        mode="prod",
        root=tmp_path,
        certs_dir=tmp_path / "certs",
        env_path=tmp_path / ".env.local",
    )
    names = [check.name for check in checks]
    for expected in (
        "Python",
        "Python packages",
        "Node tooling",
        "UI bundle",
        ".env.local",
        "Exposure",
        "Bind address",
        "Port",
        "TLS certificate",
    ):
        assert expected in names, names
    # No .env.local on a public IP: the run must be blocked, not silently allowed.
    assert exit_code(checks) == 1
    assert preflight.FAIL in {check.status for check in checks}


# --------------------------------------------------------------------------- redirects
def test_redirect_handler_preserves_path_and_switches_scheme(launcher):
    port = free_port()
    server = launcher.start_http_redirect(PUBLIC_IP, 8443, port)
    assert server is not None
    try:
        opener = urllib.request.build_opener(_NoRedirect)
        request = urllib.request.Request(f"http://127.0.0.1:{port}/deep/path?x=1")
        request.add_header("Host", f"{PUBLIC_IP}:{port}")
        with pytest.raises(urllib.error.HTTPError) as caught:
            opener.open(request, timeout=5)
        assert caught.value.code == 301
        assert caught.value.headers["Location"] == f"https://{PUBLIC_IP}:8443/deep/path?x=1"
    finally:
        launcher.stop_http_redirects()


def test_redirect_handler_falls_back_to_the_public_host(launcher):
    handler = launcher.build_redirect_handler(PUBLIC_IP, 8443)
    assert handler is not None
    assert launcher.build_url("https", PUBLIC_IP, 8443) == f"https://{PUBLIC_IP}:8443"


def test_redirect_listener_reports_an_unusable_port(launcher, capsys):
    port = free_port()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as blocker:
        blocker.bind(("0.0.0.0", port))
        blocker.listen(1)
        assert launcher.start_http_redirect(PUBLIC_IP, 8443, port) is None
    assert "could not listen on HTTP port" in capsys.readouterr().out


# --------------------------------------------------------------------------- warnings
def test_publishing_risks_explains_credit_abuse_and_router_steps(launcher):
    assert launcher.publishing_risks("127.0.0.1", "") == []
    warnings = launcher.publishing_risks(PUBLIC_IP, "")
    assert any("credits" in warning for warning in warnings)
    assert any("forward" in warning for warning in warnings)
    with_token = launcher.publishing_risks(PUBLIC_IP, "a" * 32)
    assert not any("credits" in warning for warning in with_token)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Turn a 3xx into an HTTPError so the test can read the Location header."""

    def redirect_request(self, *args, **kwargs):  # noqa: D102 - stdlib hook
        return None


# ------------------------------------------------------------------- deployment artifacts
def test_dockerfile_builds_a_studio_image_with_the_ui_bundle():
    """`docker build .` must produce the Studio, not just the agent worker."""
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    assert "AS studio" in dockerfile and "AS agent" in dockerfile
    assert "pnpm run build" in dockerfile  # the UI bundle is compiled inside the image
    assert "backend.main:app" in dockerfile  # the API is what the container serves
    assert "COPY --from=ui /app/dist ./dist" in dockerfile
    # The default (last) stage is the Studio.
    assert dockerfile.rsplit("FROM ", 1)[1].startswith("python AS studio")
    assert "HEALTHCHECK" in dockerfile and "/api/health" in dockerfile


def test_dockerfile_copies_only_files_that_exist():
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    sources: list[str] = []
    for line in dockerfile.splitlines():
        stripped = line.strip()
        if stripped.startswith("COPY ") and "--from=" not in stripped:
            parts = stripped.split()[1:]
            sources.extend(part for part in parts[:-1] if not part.startswith("--"))
    missing = [
        source
        for source in sources
        if source
        not in {
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            "pyproject.toml",
            "uv.lock",
        }
        and not (ROOT / source).exists()
    ]
    assert sources, "no COPY lines found"
    assert not missing, f"Dockerfile copies missing paths: {missing}"


def test_compose_serves_tls_by_default_and_has_an_http_profile():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    # `docker compose up -d` must start the HTTPS Studio without any extra flag,
    # so the default service carries no profile.
    studio_block = compose.split("studio:", 1)[1].split("studio-http:", 1)[0]
    assert "profiles" not in studio_block
    assert 'profiles: ["http"]' in compose
    assert 'profiles: ["agent"]' in compose
    assert "8443:8443" in compose
    assert "--https" in compose
    assert "restart: unless-stopped" in compose
    assert "STUDIO_ACCESS_TOKEN" in compose


def test_systemd_unit_runs_preflight_and_restarts():
    unit = (ROOT / "deploy" / "wave-studio.service").read_text(encoding="utf-8")
    assert "--preflight" in unit  # fails fast instead of serving a broken config
    assert "Restart=always" in unit
    assert "ExecStart=" in unit and "--mode prod --https" in unit
    assert "ReadWritePaths=" in unit and "certs" in unit


def test_deployment_guide_covers_every_supported_path():
    guide = (ROOT / "DEPLOYMENT.md").read_text(encoding="utf-8")
    for topic in (
        "preflight",
        "publish-wave.ps1",
        "systemd",
        "docker compose",
        "STUDIO_ACCESS_TOKEN",
        "token_required",
        "/api/health",
        "CGNAT",
    ):
        assert topic in guide, topic
