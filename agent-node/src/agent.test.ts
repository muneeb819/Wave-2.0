import { describe, expect, it } from 'vitest';
import { createAgent } from './agent.ts';
import { DEFAULT_NODE_SESSION, resolveJobConfig } from './main.ts';

describe('Wave 2.0 Node.js LiveKit Agent Starter', () => {
  it('exposes exact LiveKit Quickstart default models and voice', () => {
    expect(DEFAULT_NODE_SESSION.pipeline).toBe('stt-llm-tts');
    expect(DEFAULT_NODE_SESSION.stt).toBe('assemblyai/universal-3-6-pro');
    expect(DEFAULT_NODE_SESSION.llm).toBe('google/gemma-4-31b-it');
    expect(DEFAULT_NODE_SESSION.tts).toBe('fishaudio/s2.1-pro');
    expect(DEFAULT_NODE_SESSION.voice).toBe('fa4c9eb3dccc4806b382b40d61c6b10a');
    expect(DEFAULT_NODE_SESSION.noise_cancellation).toBe(true);
    expect(DEFAULT_NODE_SESSION.expressive).toBe(true);
  });

  it('creates an Agent instance for both STT-LLM-TTS and Realtime pipelines', () => {
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret-with-at-least-32-chars-ok';

    const chainedAgent = createAgent({
      pipeline: 'stt-llm-tts',
      llm: 'google/gemma-4-31b-it',
      language: 'en',
    });
    expect(chainedAgent.instructions).toContain('Respond in English.');

    const realtimeAgent = createAgent({
      pipeline: 'realtime',
      realtime_model: 'openai/gpt-live-1',
      realtime_voice: 'marin',
      language: 'es',
    });
    expect(realtimeAgent.instructions).toContain('Respond in Spanish.');
  });

  it('merges room dispatch metadata safely and handles invalid JSON', () => {
    const custom = resolveJobConfig(
      JSON.stringify({
        pipeline: 'realtime',
        realtime_model: 'openai/gpt-live-1',
        noise_cancellation: false,
      }),
    );
    expect(custom.pipeline).toBe('realtime');
    expect(custom.noise_cancellation).toBe(false);
    expect(resolveJobConfig('{invalid-json')).toEqual(DEFAULT_NODE_SESSION);
  });
});
