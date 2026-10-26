# syntax=docker/dockerfile:1
#
# Wave 2.0 has two runnable pieces. Build the one you need:
#
#   docker build -t wave-2-studio .                 # Studio: UI + API  (default target)
#   docker build -t wave-2-agent --target agent .   # LiveKit agent worker
#
# The Studio image contains the production bundle (dist/) and serves it together with
# the API from one uvicorn process. TLS can be terminated by a proxy in front of it, or
# enabled inside the container with start.py (see docker-compose.yml, profile "tls").
ARG PYTHON_VERSION=3.12
ARG NODE_VERSION=22

# ---------------------------------------------------------------------------- UI bundle
FROM node:${NODE_VERSION}-bookworm-slim AS ui

WORKDIR /app
RUN corepack enable

# Manifests first so `pnpm install` is cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY shared ./shared
COPY src ./src

RUN pnpm install --frozen-lockfile \
  && pnpm run build

# ------------------------------------------------------------------------ Python runtime
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS python

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    HF_HOME=/app/.cache/huggingface \
    TORCH_HOME=/app/.cache/torch

WORKDIR /app

# Dependencies first (they change far less often than the source).
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY agent.py gen_cert.py preflight.py start.py README.md LICENSE ./
COPY backend ./backend
COPY shared ./shared
RUN uv sync --locked --no-dev

# ------------------------------------------------------------------------- agent worker
FROM python AS agent

# Pre-download local VAD & ai-coustics ONNX assets into the image.
RUN uv run --module livekit.agents download-files

CMD ["uv", "run", "python", "-m", "backend.agent", "start"]

# ------------------------------------------------------------------------ Studio (default)
FROM python AS studio

COPY --from=ui /app/dist ./dist

RUN useradd --create-home --uid 10001 --shell /sbin/nologin appuser \
  && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status == 200 else 1)"]

CMD ["/app/.venv/bin/python", "-m", "uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
