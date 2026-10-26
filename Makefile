.PHONY: setup setup-uv setup-node api web agent agent-console agent-start agent-realtime agent-node build lint test test-dom test-ui cert start serve publish

setup:
	uv sync
	pnpm install
	uv run python -m livekit.agents download-files

setup-uv:
	uv sync
	uv run python -m livekit.agents download-files

setup-node:
	cd agent-node && pnpm install

api:
	uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers

web:
	pnpm run dev

agent:
	uv run python -m backend.agent dev

agent-console:
	uv run agent.py console

agent-start:
	uv run python -m backend.agent start

agent-realtime:
	LIVEKIT_PIPELINE=realtime uv run agent.py dev

agent-node:
	cd agent-node && pnpm run start:dev

build:
	npm run build

lint:
	uv run ruff check .
	uv run ruff format --check .

test:
	uv run pytest -q
	npm run test:dom

test-dom:
	npm run test:dom

test-ui:
	npm run test:ui

cert:
	uv run python gen_cert.py

start:
	uv run python start.py

serve:
	uv run python start.py --mode prod --host 0.0.0.0 --port 8000

publish:
	uv run python start.py --mode prod --https --host 0.0.0.0 --port 8443

publish-ip:
	uv run python start.py --mode prod --https --host $(IP) --yes --port $(or $(PORT),8443)
