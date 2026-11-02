import { describe, expect, it } from 'vitest';
import { DEFAULT_NODE_SESSION, JobMetadataSchema, resolveJobConfig } from './main.ts';

describe('Node Agent JobMetadataSchema & resolveJobConfig', () => {
  it('returns DEFAULT_NODE_SESSION on empty or malformed metadata JSON', () => {
    expect(resolveJobConfig(undefined)).toEqual(DEFAULT_NODE_SESSION);
    expect(resolveJobConfig('{corrupt-json')).toEqual(DEFAULT_NODE_SESSION);
  });

  it('rejects unknown fields or unsafe keyterm characters via strict Zod validation', () => {
    const unknownKey = JobMetadataSchema.safeParse({ api_key: 'sk-leak' });
    expect(unknownKey.success).toBe(false);

    const badKeyterm = resolveJobConfig(JSON.stringify({ keyterms: ['bad$term!'] }));
    expect(badKeyterm).toEqual(DEFAULT_NODE_SESSION);
  });

  it('applies valid realtime and language overrides cleanly', () => {
    const resolved = resolveJobConfig(
      JSON.stringify({
        pipeline: 'realtime',
        realtime_model: 'openai/gpt-realtime-2.1',
        language: 'es',
        noise_cancellation: false,
      }),
    );
    expect(resolved.pipeline).toBe('realtime');
    expect(resolved.realtime_model).toBe('openai/gpt-realtime-2.1');
    expect(resolved.language).toBe('es');
    expect(resolved.noise_cancellation).toBe(false);
  });
});
