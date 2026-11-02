"""Startup summary banner formatting and TLS/exposure warnings for start.py."""

from __future__ import annotations

import argparse

from .launcher_net import WILDCARD_HOSTS, build_url, local_ipv4_addresses, publishing_risks


def format_publication_summary(
    args: argparse.Namespace,
    host: str,
    port: int,
    scheme: str,
    ready: bool,
    *,
    prod: bool,
    requested_host: str = "",
    token: str = "",
) -> str:
    """Format the startup summary banner and security/TLS guidance."""
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
    chunks = [
        f"\nWave 2.0 is running [{'prod' if prod else 'dev'}, {scheme.upper()}] - {status}\n"
        + "\n".join(urls)
        + f"\n{api_line}"
    ]

    if scheme == "https":
        chunks.append(
            "TLS note: the certificate is self-signed, so the first visit shows a warning.\n"
            "          Choose Advanced -> Proceed to continue (required for microphone access)."
        )
    elif host not in WILDCARD_HOSTS and host not in {"127.0.0.1", "localhost", "::1"}:
        chunks.append(
            "Warning: plain HTTP on a non-localhost address is NOT a secure context, so\n"
            "         Chrome/Edge/Safari will block the microphone and Live sessions cannot\n"
            "         connect. Re-run with --https to publish with TLS."
        )

    exposure = host if host not in WILDCARD_HOSTS else (requested_host or "0.0.0.0")
    for message in publishing_risks(exposure, token):
        chunks.append(f"Warning: {message}")

    return "\n\n".join(chunks)
