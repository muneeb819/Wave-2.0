@echo off
cd /d "%~dp0"

if not exist node_modules (
  where pnpm >nul 2>nul
  if %errorlevel%==0 (
    call pnpm install
  ) else (
    call npm install
  )
)

where uv >nul 2>nul
if %errorlevel%==0 (
  if not exist .venv (
    call uv sync
  )
)

python start.py %*
