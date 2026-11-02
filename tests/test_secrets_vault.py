"""End-to-end loopback HTTP integration tests for HashiCorp Vault KV v2/v1 and Doppler."""

from __future__ import annotations

import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import jwt
import pytest

from backend.secrets import active_secret_provider, clear_secret_cache

VAULT_SECRET_V1 = "vault-livekit-secret-version-one-32chars!!"
VAULT_SECRET_V2 = "vault-livekit-secret-rotated-two-32chars!!"
DOPPLER_SECRET = "doppler-livekit-secret-thirty-two-chars!!"


class _SecretServerState:
    def __init__(self) -> None:
        self.vault_token = "s.wave2-vault-token"
        self.vault_namespace = "eng/wave"
        self.doppler_token = "dp.st.prod_wave2"
        self.kv_version = 2
        self.requests: list[tuple[str, str, dict[str, str]]] = []
        self.secrets: dict[str, str] = {
            "LIVEKIT_URL": "wss://vault-managed.livekit.cloud",
            "LIVEKIT_API_KEY": "APIvaultKey01",
            "LIVEKIT_API_SECRET": VAULT_SECRET_V1,
        }


@pytest.fixture
def live_secret_server():
    state = _SecretServerState()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args) -> None:  # noqa: ARG002
            return

        def _send_json(self, code: int, body: dict) -> None:
            raw = json.dumps(body).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self) -> None:  # noqa: N802
            hdrs = {k.lower(): v for k, v in self.headers.items()}
            state.requests.append((self.command, self.path, hdrs))

            if self.path == "/v1/secret/data/wave-studio":
                if hdrs.get("x-vault-token") != state.vault_token:
                    self._send_json(403, {"errors": ["permission denied"]})
                    return
                if state.vault_namespace and hdrs.get("x-vault-namespace") != state.vault_namespace:
                    self._send_json(403, {"errors": ["invalid namespace"]})
                    return
                if state.kv_version == 2:
                    self._send_json(
                        200,
                        {"data": {"data": dict(state.secrets), "metadata": {"version": 1}}},
                    )
                else:
                    self._send_json(200, {"data": dict(state.secrets)})
                return

            if self.path.startswith("/v3/configs/config/secrets/download"):
                expected_basic = base64.b64encode(f"{state.doppler_token}:".encode()).decode()
                if hdrs.get("authorization") != f"Basic {expected_basic}":
                    self._send_json(401, {"messages": ["Invalid service token"]})
                    return
                self._send_json(
                    200,
                    {
                        "LIVEKIT_URL": "wss://doppler-managed.livekit.cloud",
                        "LIVEKIT_API_KEY": "APIdopplerKey02",
                        "LIVEKIT_API_SECRET": DOPPLER_SECRET,
                    },
                )
                return

            self._send_json(404, {"errors": ["not found"]})

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]
    try:
        yield f"http://{host}:{port}", state
    finally:
        server.shutdown()
        server.server_close()


def test_vault_kv_v2_mints_real_session_jwt_and_supports_key_rotation(
    client, monkeypatch, live_secret_server
):
    base_url, state = live_secret_server
    monkeypatch.setenv("VAULT_ADDR", base_url)
    monkeypatch.setenv("VAULT_TOKEN", state.vault_token)
    monkeypatch.setenv("VAULT_NAMESPACE", state.vault_namespace)
    monkeypatch.setenv("VAULT_SECRET_PATH", "secret/data/wave-studio")

    assert active_secret_provider() == "vault"
    health = client.get("/api/health").json()
    assert health["secret_provider"] == "vault"

    status = client.get("/api/status").json()
    assert status["configured"] is True
    assert status["server_host"] == "vault-managed.livekit.cloud"

    first_res = client.post("/api/sessions", json={"config": {}})
    assert first_res.status_code == 200
    decoded_v1 = jwt.decode(
        first_res.json()["participant_token"], VAULT_SECRET_V1, algorithms=["HS256"]
    )
    assert decoded_v1["iss"] == "APIvaultKey01"
    # Second request hits TTL cache without a redundant Vault roundtrip.
    vault_calls_before_cached = len(state.requests)
    assert client.get("/api/status").status_code == 200
    assert len(state.requests) == vault_calls_before_cached

    # Rotate LIVEKIT_API_SECRET in Vault and clear cache -> new JWT signs with rotated key.
    state.secrets["LIVEKIT_API_SECRET"] = VAULT_SECRET_V2
    clear_secret_cache()
    rotated_res = client.post("/api/sessions", json={"config": {}})
    assert rotated_res.status_code == 200
    decoded_v2 = jwt.decode(
        rotated_res.json()["participant_token"], VAULT_SECRET_V2, algorithms=["HS256"]
    )
    assert decoded_v2["iss"] == "APIvaultKey01"


def test_vault_kv_v1_and_invalid_token_fallback_gracefully(client, monkeypatch, live_secret_server):
    base_url, state = live_secret_server
    state.kv_version = 1
    state.vault_namespace = ""
    monkeypatch.setenv("VAULT_ADDR", base_url)
    monkeypatch.setenv("VAULT_TOKEN", state.vault_token)

    assert client.get("/api/status").json()["configured"] is True

    clear_secret_cache()
    monkeypatch.setenv("VAULT_TOKEN", "wrong-vault-token")
    denied_status = client.get("/api/status").json()
    assert denied_status["configured"] is False


def test_doppler_http_basic_auth_resolves_secrets_end_to_end(
    client, monkeypatch, live_secret_server
):
    base_url, state = live_secret_server
    monkeypatch.setenv("SECRET_PROVIDER", "doppler")
    monkeypatch.setenv("DOPPLER_TOKEN", state.doppler_token)
    monkeypatch.setenv("DOPPLER_API_URL", f"{base_url}/v3/configs/config/secrets/download")

    assert active_secret_provider() == "doppler"
    res = client.post("/api/sessions", json={"config": {}})
    assert res.status_code == 200
    body = res.json()
    assert body["server_url"] == "wss://doppler-managed.livekit.cloud"
    claims = jwt.decode(body["participant_token"], DOPPLER_SECRET, algorithms=["HS256"])
    assert claims["iss"] == "APIdopplerKey02"
