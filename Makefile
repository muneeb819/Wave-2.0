.PHONY: setup api web agent build test test-ui

setup:
	python -m pip install -r requirements.txt
	npm ci
	python -m livekit.agents download-files

api:
	python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers

web:
	npm run dev

agent:
	python -m backend.agent dev

build:
	npm run build

test:
	python -m pytest tests/test_api.py -q
	npm run test:ui

test-ui:
	npm run test:ui
