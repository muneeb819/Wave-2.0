#!/usr/bin/env python3
"""Cross-platform localhost launcher for Wave 2.0 Studio + API (+ Worker if configured).

Starts:
  1. FastAPI Backend + Static Studio fallback -> http://localhost:8000
  2. Vite Hot-Reload Studio UI                -> http://localhost:5173  (opens browser automatically)
  3. LiveKit Agent Worker (`backend.agent`)   -> auto-started when `.env.local` has Cloud credentials
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def resolve_python() -> str:
    candidates = [
        ROOT / ".venv" / "Scripts" / "python.exe",
        ROOT / ".venv" / "bin" / "python",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return sys.executable


def resolve_vite_cmd() -> list[str]:
    local_bin = ROOT / "node_modules" / ".bin" / ("vite.cmd" if os.name == "nt" else "vite")
    if local_bin.is_file():
        return [str(local_bin), "--host", "0.0.0.0", "--port", "5173"]
    for pm in ("pnpm", "npm"):
        exe = shutil.which(pm)
        if exe:
            return [exe, "run", "dev"]
    raise RuntimeError(
        "Node.js package manager not found. Install Node.js >= 20 and run `npm install`."
    )


def wait_for_http(url: str, timeout: float = 20.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


def has_livekit_credentials(py: str) -> bool:
    code = (
        "from backend.config import CREDENTIAL_NAMES, environment; "
        "env = environment(); "
        "raise SystemExit(0 if all(env[k] for k in CREDENTIAL_NAMES) else 1)"
    )
    return (
        subprocess.run(
            [py, "-c", code],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode
        == 0
    )


def main() -> int:
    py = resolve_python()
    processes: list[subprocess.Popen[bytes]] = []

    def shutdown(*_args: object) -> None:
        print("\nStopping Wave 2.0 localhost services...")
        for proc in reversed(processes):
            if proc.poll() is None:
                proc.terminate()
        deadline = time.monotonic() + 4.0
        for proc in reversed(processes):
            while proc.poll() is None and time.monotonic() < deadline:
                time.sleep(0.1)
            if proc.poll() is None:
                proc.kill()

    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    try:
        print("Starting FastAPI backend on http://localhost:8000 ...")
        api_proc = subprocess.Popen(
            [
                py,
                "-m",
                "uvicorn",
                "backend.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                "8000",
                "--no-proxy-headers",
            ],
            cwd=ROOT,
        )
        processes.append(api_proc)

        if has_livekit_credentials(py):
            print("LiveKit credentials detected in .env.local -> starting worker ...")
            worker_proc = subprocess.Popen(
                [py, "-m", "backend.agent", "dev"],
                cwd=ROOT,
            )
            processes.append(worker_proc)

        vite_url = "http://localhost:5173"
        studio_url = "http://localhost:8000"
        target_url = studio_url

        try:
            vite_cmd = resolve_vite_cmd()
            print(f"Starting Wave 2.0 Studio dev server on {vite_url} ...")
            web_proc = subprocess.Popen(vite_cmd, cwd=ROOT)
            processes.append(web_proc)
            if wait_for_http("http://127.0.0.1:5173", timeout=15.0):
                target_url = vite_url
        except RuntimeError as exc:
            print(f"Note: {exc} Falling back to built bundle on {studio_url}.")

        wait_for_http("http://127.0.0.1:8000/api/health", timeout=15.0)
        print(
            f"\nWave 2.0 is running on localhost!\n  Studio UI : {target_url}\n  API Server: http://localhost:8000\n"
        )

        if "--no-open" not in sys.argv:
            try:
                webbrowser.open(target_url)
            except Exception:
                pass

        while True:
            for proc in processes:
                code = proc.poll()
                if code is not None:
                    return code
            time.sleep(0.4)
    except SystemExit:
        return 0
    finally:
        shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
