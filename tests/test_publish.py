"""Offline tests for LAN / public-IP publishing: certificate SANs and launcher helpers.

Nothing here opens a socket to the network, forwards a port, or contacts LiveKit.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

from gen_cert import (
    certificate_hosts,
    generate_self_signed_cert,
    normalise_hosts,
    san_entries,
)

ROOT = Path(__file__).resolve().parent.parent
PUBLISH_IP = "182.183.90.63"


def _load_launcher() -> ModuleType:
    """Import start.py by path (it is a launcher script, not an installed module)."""
    spec = importlib.util.spec_from_file_location("wave_launcher", ROOT / "start.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


launcher = _load_launcher()


# --- Certificate SAN coverage ---------------------------------------------------------
def test_certificate_includes_loopback_by_default(tmp_path):
    _, cert_file = generate_self_signed_cert(tmp_path)
    hosts = certificate_hosts(cert_file)
    assert "localhost" in hosts
    assert "127.0.0.1" in hosts
    assert "::1" in hosts


def test_certificate_covers_published_public_ip_and_dns_name(tmp_path):
    key_file, cert_file = generate_self_signed_cert(
        tmp_path,
        extra_hosts=[PUBLISH_IP, "studio.example.com"],
    )
    hosts = certificate_hosts(cert_file)
    assert PUBLISH_IP in hosts
    assert "studio.example.com" in hosts
    assert key_file.stat().st_mode & 0o777 == 0o600


def test_certificate_normalises_user_supplied_urls(tmp_path):
    _, cert_file = generate_self_signed_cert(
        tmp_path,
        extra_hosts=[
            "https://182.183.90.63:8443/studio",
            "192.168.1.20",
            "192.168.1.20",
            " studio.local ",
        ],
    )
    hosts = certificate_hosts(cert_file)
    assert hosts.count("192.168.1.20") == 1
    assert "studio.local" in hosts


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://182.183.90.63:8443/path", ["182.183.90.63"]),
        ("http://192.168.1.20", ["192.168.1.20"]),
        ("wss://example.com/rtc", ["example.com"]),
        ("[::1]:8443", ["::1"]),
        ("localhost", ["localhost"]),
    ],
)
def test_normalise_hosts(raw, expected):
    assert normalise_hosts([raw]) == expected


def test_san_entries_use_ip_for_addresses_and_dns_for_names():
    import ipaddress

    from cryptography import x509

    entries = san_entries([PUBLISH_IP, "studio.local"])
    by_value = {str(entry.value): entry for entry in entries}
    assert isinstance(by_value[PUBLISH_IP], x509.IPAddress)
    assert isinstance(by_value[PUBLISH_IP].value, (ipaddress.IPv4Address, ipaddress.IPv6Address))
    assert isinstance(by_value["studio.local"], x509.DNSName)


# --- Launcher helpers -----------------------------------------------------------------
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("182.183.90.63", "182.183.90.63"),
        ("https://182.183.90.63:8443/", "182.183.90.63"),
        ("0.0.0.0", "0.0.0.0"),
        ("[::1]:8000", "::1"),
        ("localhost:5173", "localhost"),
        ("  ", ""),
    ],
)
def test_launcher_normalise_host(raw, expected):
    assert launcher.normalise_host(raw) == expected


@pytest.mark.parametrize(
    ("scheme", "host", "port", "expected"),
    [
        ("http", "127.0.0.1", 5173, "http://127.0.0.1:5173"),
        ("https", "0.0.0.0", 8443, "https://localhost:8443"),
        ("https", "182.183.90.63", 443, f"https://{PUBLISH_IP}"),
        ("http", "::1", 8000, "http://[::1]:8000"),
    ],
)
def test_build_url(scheme, host, port, expected):
    assert launcher.build_url(scheme, host, port) == expected


def test_wildcard_and_loopback_are_bindable():
    assert launcher.is_bindable("0.0.0.0")
    assert launcher.is_bindable("127.0.0.1")
    assert launcher.is_bindable("localhost")


def test_unassigned_public_address_is_not_bindable():
    """TEST-NET-1 (RFC 5737) can never be assigned to a local interface."""
    assert launcher.is_bindable("192.0.2.1") is False
    assert launcher.is_bindable(PUBLISH_IP) is False or launcher.local_ipv4_addresses()


def test_non_local_host_note_explains_port_forwarding_and_cgnat():
    note = launcher.non_local_host_note(PUBLISH_IP, 8443, https=True)
    assert PUBLISH_IP in note
    assert "8443" in note
    assert "forward" in note.lower()
    assert "CGNAT" in note
    assert "STUDIO_ACCESS_TOKEN" in note


def test_certificate_hosts_for_includes_requested_public_ip():
    hosts = launcher.certificate_hosts_for("0.0.0.0", PUBLISH_IP)
    assert PUBLISH_IP in hosts
    assert "0.0.0.0" not in hosts


def test_cli_help_lists_publishing_flags():
    result = subprocess.run(
        [sys.executable, "start.py", "--help"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    for flag in ("--host", "--port", "--mode", "--https", "--cert", "--key"):
        assert flag in result.stdout


def test_unbindable_host_exits_with_guidance():
    """A non-TTY run without --yes must stop with guidance instead of binding silently."""
    result = subprocess.run(
        [sys.executable, "start.py", "--host", "192.0.2.1", "--no-open"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        stdin=subprocess.DEVNULL,
        timeout=120,
    )
    assert result.returncode == 2
    assert "192.0.2.1" in result.stdout
    assert "0.0.0.0" in result.stdout
