# AGENTS.md — Wave 2.0 Node.js LiveKit Agents Starter (`agent-node`)

Built on `@livekit/agents` (`^1.9`) and `@livekit/plugins-ai-coustics` (`^0.3`) with TypeScript, `pnpm` (`>= 10.15.0`), and Node.js (`>= 20`).

## Commands

```console
pnpm install
pnpm run typecheck
pnpm test
pnpm run start:dev     # Run worker in dev mode via jiti
lk agent dev           # Run worker via LiveKit CLI
pnpm start             # Run worker in production mode
```

Set `LIVEKIT_PIPELINE=realtime` to switch from the default `assemblyai/universal-3-6-pro` → `google/gemma-4-31b-it` → `fishaudio/s2.1-pro` pipeline to full-duplex `openai/gpt-live-1`, and `LIVEKIT_NOISE_CANCELLATION=false` when self-hosting LiveKit Server.
