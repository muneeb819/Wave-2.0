"""Generate local TLS certificates for HTTPS microphone testing and LAN/IP publishing.

Browsers only expose `navigator.mediaDevices.getUserMedia` in a *secure context*: HTTPS or
`localhost`. Serving the Studio at `http://<lan-or-public-ip>:port` therefore silently
disables the microphone and the Live pipeline cannot connect. This module mints a
self-signed certificate whose Subject Alternative Names cover `localhost`, the loopback
addresses, and any extra hosts / IP addresses you publish on.

Usage:
    python gen_cert.py                          # localhost only -> certs/
    python gen_cert.py --host 182.183.90.63     # public IP included in the SAN
    python gen_cert.py --host 192.168.1.20 --host studio.example.com --out certs

The generated key/cert pair lives in `certs/`, which is git-ignored.
"""

from __future__ import annotations

import argparse
import datetime
import ipaddress
import socket
from collections.abc import Iterable, Sequence
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent / "certs"
DEFAULT_COMMON_NAME = "localhost"


def local_ipv4_addresses() -> list[str]:
    """Return the machine's non-loopback IPv4 addresses (LAN addresses included).

    Uses the UDP-connect trick so it works without external tools and never sends a
    packet. Falls back to the resolved hostname when the trick is unavailable.
    """
    addresses: list[str] = []
    for probe in ("10.255.255.255", "192.168.255.255", "172.31.255.255"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.settimeout(0.2)
                sock.connect((probe, 1))
                candidate = sock.getsockname()[0]
            if candidate and not candidate.startswith("127.") and candidate not in addresses:
                addresses.append(candidate)
                break
        except OSError:
            continue

    try:
        for candidate in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not candidate.startswith("127.") and candidate not in addresses:
                addresses.append(candidate)
    except OSError:
        pass
    return addresses


def normalise_hosts(hosts: Iterable[str] | None) -> list[str]:
    """Clean user-supplied hosts: strip scheme/path/port, whitespace, and duplicates."""
    cleaned: list[str] = []
    for raw in hosts or ():
        value = (raw or "").strip()
        for prefix in ("https://", "http://", "wss://", "ws://"):
            if value.lower().startswith(prefix):
                value = value[len(prefix) :]
        value = value.split("/", 1)[0]
        if value.startswith("["):  # bracketed IPv6, e.g. [::1]:8443
            value = value.split("]", 1)[0].lstrip("[")
        elif value.count(":") == 1:  # host:port
            value = value.split(":", 1)[0]
        value = value.strip().rstrip(".")
        if value and value not in cleaned:
            cleaned.append(value)
    return cleaned


def san_entries(extra_hosts: Sequence[str] | None = None) -> list[x509.GeneralName]:
    """Build the Subject Alternative Name list: loopback plus every requested host."""
    values = ["localhost", "127.0.0.1", "::1"]
    for host in normalise_hosts(extra_hosts):
        if host not in values:
            values.append(host)

    entries: list[x509.GeneralName] = []
    for value in values:
        try:
            entries.append(x509.IPAddress(ipaddress.ip_address(value)))
        except ValueError:
            entries.append(x509.DNSName(value))
    return entries


def _common_name(hosts: Sequence[str] | None) -> str:
    """Prefer an explicit DNS name, otherwise `localhost` (CN is a legacy field)."""
    cleaned = normalise_hosts(hosts)
    for value in cleaned:
        try:
            ipaddress.ip_address(value)
        except ValueError:
            return value
    return DEFAULT_COMMON_NAME


def generate_self_signed_cert(
    output_dir: Path | None = None,
    extra_hosts: Sequence[str] | None = None,
    include_local_addresses: bool = False,
) -> tuple[Path, Path]:
    """Write `key.pem` + `cert.pem` into `output_dir` and return their paths."""
    target = output_dir or DEFAULT_OUTPUT_DIR
    target.mkdir(parents=True, exist_ok=True)

    hosts = list(extra_hosts or [])
    if include_local_addresses:
        hosts.extend(local_ipv4_addresses())

    now = datetime.datetime.now(datetime.UTC)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, _common_name(hosts)[:64])]
    )
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(san_entries(hosts)), critical=False)
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    key_path = target / "key.pem"
    cert_path = target / "cert.pem"
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    key_path.chmod(0o600)
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    return key_path, cert_path


def certificate_hosts(cert_path: Path) -> list[str]:
    """Read back every SAN entry from an existing certificate (used by tests/diagnostics)."""
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    extension = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    return [str(value.value) for value in extension]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a self-signed TLS certificate for the Wave 2.0 Studio.",
    )
    parser.add_argument(
        "--host",
        action="append",
        default=[],
        metavar="HOST_OR_IP",
        help="Extra DNS name or IP address to add to the certificate (repeatable).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: ./certs).",
    )
    parser.add_argument(
        "--local-addresses",
        action="store_true",
        help="Also include every local IPv4 address of this machine.",
    )
    args = parser.parse_args(argv)

    key_file, cert_file = generate_self_signed_cert(
        args.out,
        extra_hosts=args.host,
        include_local_addresses=args.local_addresses,
    )
    print("Generated development certificate:")
    print(f"  key:  {key_file}")
    print(f"  cert: {cert_file}")
    print(f"  hosts: {', '.join(certificate_hosts(cert_file))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
