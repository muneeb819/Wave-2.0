"""Shared, allow-listed model & Cloud bot configuration for STT-LLM-TTS and Realtime pipelines."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Literal

from dotenv import dotenv_values
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / "shared" / "models.json").read_text(encoding="utf-8"))
DEFAULTS = CATALOG["defaults"]
CREDENTIAL_NAMES = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")
KEYTERM_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .,'&/_-]{0,63}$")

DEFAULT_CLOUD_AGENT_URL = "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS"
DEFAULT_CLOUD_PROJECT_ID = "p_jg0goo2oksb"
DEFAULT_CLOUD_AGENT_ID = "CA_tBWDFVRz7pZS"
DEFAULT_CLOUD_URL_HINT = "wss://medicare-bot-z2uz9h17.livekit.cloud"

CLOUD_AGENT_URL_RE = re.compile(
    r"^https?://cloud\.livekit\.io/projects/(p_[A-Za-z0-9_-]+)/agents/(CA_[A-Za-z0-9_-]+)/?$"
)


def parse_cloud_agent_url(raw: str) -> tuple[str | None, str | None]:
    """Extract (project_id, agent_id) from a LiveKit Cloud Agent URL if valid."""
    match = CLOUD_AGENT_URL_RE.match(raw.strip())
    if not match:
        return None, None
    return match.group(1), match.group(2)


def environment() -> dict[str, str]:
    """Read .env.local without exposing credentials to the frontend or mutating os.environ."""
    file_values = dotenv_values(ROOT / ".env.local")
    names = (
        *CREDENTIAL_NAMES,
        "LIVEKIT_AGENT_NAME",
        "LIVEKIT_AGENT_URL",
        "LIVEKIT_DISPATCH_MODE",
        "LIVEKIT_SANDBOX_ID",
        "STUDIO_ACCESS_TOKEN",
    )
    return {name: (os.environ.get(name) or file_values.get(name) or "").strip() for name in names}


def agent_name(default: str = "inference-studio") -> str:
    env = environment()
    if env.get("LIVEKIT_AGENT_NAME"):
        return env["LIVEKIT_AGENT_NAME"]
    _, parsed_agent_id = parse_cloud_agent_url(env.get("LIVEKIT_AGENT_URL", ""))
    return parsed_agent_id or default


def write_env_local(updates: dict[str, str]) -> Path:
    """Persist server-only credentials to `.env.local` with mode 0600 without exposing secrets."""
    env_path = ROOT / ".env.local"
    existing = dict(dotenv_values(env_path)) if env_path.is_file() else {}
    for key, value in updates.items():
        if value is not None:
            existing[key] = value.strip()

    lines: list[str] = []
    for key, val in existing.items():
        if val is None or "\n" in val or "\r" in val:
            continue
        lines.append(f"{key}={val}")

    tmp_path = env_path.with_suffix(".local.tmp")
    fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise
    os.replace(tmp_path, env_path)
    try:
        os.chmod(env_path, 0o600)
    except OSError:
        pass
    return env_path


class SessionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    pipeline: Literal["stt-llm-tts", "realtime"] = DEFAULTS["pipeline"]
    stt: str = DEFAULTS["stt"]
    llm: str = DEFAULTS["llm"]
    tts: str = DEFAULTS["tts"]
    voice: str = Field(
        default=DEFAULTS["voice"],
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    realtime_model: str = DEFAULTS["realtime_model"]
    realtime_voice: str = Field(
        default=DEFAULTS["realtime_voice"],
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    language: Literal["en", "es", "fr", "de", "pt", "it"] = DEFAULTS["language"]
    turn_detection: Literal["turn_detector", "vad", "stt"] = DEFAULTS["turn_detection"]
    noise_cancellation: bool = DEFAULTS["noise_cancellation"]
    preemptive_generation: bool = DEFAULTS["preemptive_generation"]
    expressive: bool = DEFAULTS["expressive"]
    keyterms: list[str] = Field(
        default_factory=lambda: list(DEFAULTS["keyterms"]),
        max_length=20,
    )
    instructions: str = Field(default=DEFAULTS["instructions"], min_length=10, max_length=8000)

    @field_validator("stt", "llm", "tts")
    @classmethod
    def allow_listed_model(cls, value: str, info):
        if value not in {model["id"] for model in CATALOG[info.field_name]}:
            raise ValueError(f"Unsupported {info.field_name.upper()} model")
        return value

    @field_validator("realtime_model")
    @classmethod
    def allow_listed_realtime_model(cls, value: str):
        if value not in {model["id"] for model in CATALOG["realtime"]}:
            raise ValueError("Unsupported REALTIME model")
        return value

    @field_validator("keyterms")
    @classmethod
    def validate_keyterms(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            term = item.strip()
            if not term:
                continue
            if not KEYTERM_PATTERN.match(term):
                raise ValueError(f"Invalid keyterm: {term!r}")
            lowered = term.lower()
            if lowered not in seen:
                seen.add(lowered)
                cleaned.append(term)
        return cleaned

    @model_validator(mode="after")
    def check_language(self):
        model = next(model for model in CATALOG["stt"] if model["id"] == self.stt)
        if self.language not in model["languages"]:
            raise ValueError(
                f"{model['name']} does not support {self.language}. Select a multilingual model."
            )
        return self
