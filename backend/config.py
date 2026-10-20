"""Shared, allow-listed model configuration. No provider-specific keys are needed."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal

from dotenv import dotenv_values
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ROOT = Path(__file__).resolve().parent.parent
CATALOG = json.loads((ROOT / "shared" / "models.json").read_text())
DEFAULTS = CATALOG["defaults"]
CREDENTIAL_NAMES = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")


def environment() -> dict[str, str]:
    """Read .env.local without exposing credentials to the frontend or mutating os.environ."""
    file_values = dotenv_values(ROOT / ".env.local")
    names = (*CREDENTIAL_NAMES, "LIVEKIT_AGENT_NAME", "STUDIO_ACCESS_TOKEN")
    return {
        name: (os.environ.get(name) or file_values.get(name) or "").strip()
        for name in names
    }


def agent_name() -> str:
    return environment().get("LIVEKIT_AGENT_NAME") or "inference-studio"


class SessionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    stt: str = DEFAULTS["stt"]
    llm: str = DEFAULTS["llm"]
    tts: str = DEFAULTS["tts"]
    language: Literal["en", "es", "fr", "de", "pt", "it"] = DEFAULTS["language"]
    voice: str = Field(
        default=DEFAULTS["voice"],
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    instructions: str = Field(
        default=DEFAULTS["instructions"], min_length=10, max_length=8000
    )

    @field_validator("stt", "llm", "tts")
    @classmethod
    def allow_listed_model(cls, value: str, info):
        if value not in {model["id"] for model in CATALOG[info.field_name]}:
            raise ValueError(f"Unsupported {info.field_name.upper()} model")
        return value

    @model_validator(mode="after")
    def check_language(self):
        model = next(model for model in CATALOG["stt"] if model["id"] == self.stt)
        if self.language not in model["languages"]:
            raise ValueError(
                f"{model['name']} does not support {self.language}. Select a multilingual model."
            )
        return self
