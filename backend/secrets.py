"""Pluggable secret resolution supporting Docker *_FILE mounts, HashiCorp Vault, and Doppler."""

from __future__ import annotations

import os
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx
import structlog

logger = structlog.get_logger("inference-studio.secrets")

SUPPORTED_PROVIDERS = frozenset({"env", "file", "vault", "doppler"})
LOCAL_VAULT_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_CACHE_TTL_SECONDS = 60.0
_provider_cache: dict[str, tuple[float, dict[str, str]]] = {}


def clear_secret_cache() -> None:
    """Clear cached remote secret payloads (used in tests and key rotation)."""
    _provider_cache.clear()


def active_secret_provider() -> str:
    """Return the normalized secret backend identifier."""
    configured = os.environ.get("SECRET_PROVIDER", "").strip().lower()
    if configured in SUPPORTED_PROVIDERS:
        return configured
    if os.environ.get("VAULT_ADDR", "").strip() and os.environ.get("VAULT_TOKEN", "").strip():
        return "vault"
    if os.environ.get("DOPPLER_TOKEN", "").strip():
        return "doppler"
    return "env"


def _read_secret_file(path_str: str) -> str:
    if not path_str:
        return ""
    candidate = Path(path_str)
    try:
        if candidate.is_file():
            return candidate.read_text(encoding="utf-8").strip()
    except OSError as exc:
        logger.warning("secret_file_unreadable", error_type=type(exc).__name__)
    return ""


def _valid_vault_addr(addr: str) -> bool:
    try:
        parsed = urlparse(addr)
        if not parsed.hostname or parsed.username or parsed.password:
            return False
        if parsed.scheme == "https":
            return True
        return parsed.scheme == "http" and parsed.hostname in LOCAL_VAULT_HOSTS
    except ValueError:
        return False


def _fetch_vault_secrets() -> dict[str, str]:
    addr = os.environ.get("VAULT_ADDR", "").strip().rstrip("/")
    token = os.environ.get("VAULT_TOKEN", "").strip()
    secret_path = (
        os.environ.get("VAULT_SECRET_PATH", "").strip() or "secret/data/wave-studio"
    ).lstrip("/")
    namespace = os.environ.get("VAULT_NAMESPACE", "").strip()
    if not addr or not token or not _valid_vault_addr(addr):
        logger.warning("vault_configuration_invalid")
        return {}

    headers = {"X-Vault-Token": token}
    if namespace:
        headers["X-Vault-Namespace"] = namespace
    try:
        response = httpx.get(f"{addr}/v1/{secret_path}", headers=headers, timeout=5.0)
        response.raise_for_status()
        payload = response.json()
        # Support both KV v2 (`data.data`) and KV v1 (`data`).
        outer = payload.get("data", {})
        inner = outer.get("data", outer) if isinstance(outer, dict) else {}
        if isinstance(inner, dict):
            return {str(k): str(v).strip() for k, v in inner.items() if v is not None}
    except Exception as exc:
        logger.warning("vault_fetch_failed", error_type=type(exc).__name__)
    return {}


def _fetch_doppler_secrets() -> dict[str, str]:
    token = os.environ.get("DOPPLER_TOKEN", "").strip()
    api_url = (
        os.environ.get("DOPPLER_API_URL", "").strip()
        or "https://api.doppler.com/v3/configs/config/secrets/download"
    )
    if not token or not _valid_vault_addr(api_url):
        return {}
    try:
        response = httpx.get(
            api_url,
            params={"format": "json"},
            auth=(token, ""),
            timeout=5.0,
        )
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, dict):
            return {str(k): str(v).strip() for k, v in payload.items() if v is not None}
    except Exception as exc:
        logger.warning("doppler_fetch_failed", error_type=type(exc).__name__)
    return {}


def _remote_provider_secrets(provider: str) -> dict[str, str]:
    if provider not in ("vault", "doppler"):
        return {}
    now = time.monotonic()
    cached = _provider_cache.get(provider)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]
    fetched = _fetch_vault_secrets() if provider == "vault" else _fetch_doppler_secrets()
    _provider_cache[provider] = (now, fetched)
    return fetched


def resolve_configuration(
    names: tuple[str, ...],
    dotenv_fallback: dict[str, str | None],
) -> dict[str, str]:
    """Resolve configuration keys across env vars, *_FILE mounts, Vault/Doppler, and .env.local."""
    provider = active_secret_provider()
    remote_values = _remote_provider_secrets(provider)
    resolved: dict[str, str] = {}
    for name in names:
        env_val = os.environ.get(name, "").strip()
        if env_val:
            resolved[name] = env_val
            continue
        file_val = _read_secret_file(os.environ.get(f"{name}_FILE", "").strip())
        if file_val:
            resolved[name] = file_val
            continue
        remote_val = remote_values.get(name, "").strip()
        if remote_val:
            resolved[name] = remote_val
            continue
        resolved[name] = (dotenv_fallback.get(name) or "").strip()
    return resolved
