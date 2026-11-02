"""Unit tests for backend.launcher_net and backend.launcher_summary."""

from __future__ import annotations

import argparse

import pytest

from backend.launcher_net import (
    build_url,
    certificate_hosts_for,
    ensure_certificate,
    is_bindable,
    normalise_host,
)
from backend.launcher_summary import format_publication_summary


def test_normalise_host_and_ipv6_url_formatting():
    assert normalise_host("https://[::1]:8443/app") == "::1"
    assert build_url("https", "::1", 443) == "https://[::1]"
    assert build_url("http", "0.0.0.0", 80) == "http://localhost"
    assert is_bindable("203.0.113.199") is False


def test_ensure_certificate_reuses_valid_cert_and_rejects_missing_explicit_paths(tmp_path):
    certs_dir = tmp_path / "certs"
    hosts = certificate_hosts_for("0.0.0.0", "203.0.113.10")
    assert "203.0.113.10" in hosts

    key1, cert1 = ensure_certificate(["127.0.0.1"], None, None, certs_dir)
    mtime_before = cert1.stat().st_mtime_ns
    key2, cert2 = ensure_certificate(["127.0.0.1"], None, None, certs_dir)
    assert (key1, cert1) == (key2, cert2)
    assert cert2.stat().st_mtime_ns == mtime_before

    with pytest.raises(SystemExit):
        ensure_certificate([], tmp_path / "missing.key", tmp_path / "missing.crt", certs_dir)


def test_format_publication_summary_warns_on_non_tls_and_missing_token():
    args = argparse.Namespace(api_port=8000)
    text = format_publication_summary(
        args,
        "192.168.1.50",
        8443,
        "http",
        ready=True,
        prod=False,
        requested_host="203.0.113.10",
        token="",
    )
    assert "Bind host : http://192.168.1.50:8443" in text
    assert "Published : http://203.0.113.10:8443" in text
    assert "NOT a secure context" in text
    assert "STUDIO_ACCESS_TOKEN is empty" in text
