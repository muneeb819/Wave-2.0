import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { EnhancerModel, audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { type NodeAgentConfig, createAgent } from './agent.ts';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../.env.local') });
dotenv.config({ path: path.resolve(currentDir, '../../.env.local') });

export type TurnDetectionOption = 'turn_detector' | 'multilingual' | 'vad' | 'stt';

export interface FullSessionConfig extends NodeAgentConfig {
  stt: string;
  tts: string;
  voice: string;
  turn_detection: TurnDetectionOption;
  noise_cancellation: boolean;
  preemptive_generation: boolean;
  expressive: boolean;
  keyterms: string[];
}

const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const SAFE_VOICE_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_KEYTERM_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&/_-]{0,63}$/;

export const JobMetadataSchema = z
  .object({
    pipeline: z.enum(['stt-llm-tts', 'realtime']).optional(),
    stt: z.string().regex(SAFE_ID_RE).optional(),
    llm: z.string().regex(SAFE_ID_RE).optional(),
    tts: z.string().regex(SAFE_ID_RE).optional(),
    voice: z.string().regex(SAFE_VOICE_RE).optional(),
    realtime_model: z.string().regex(SAFE_ID_RE).optional(),
    realtime_voice: z.string().regex(SAFE_VOICE_RE).optional(),
    language: z.enum(['en', 'es', 'fr', 'de', 'pt', 'it']).optional(),
    turn_detection: z.enum(['turn_detector', 'multilingual', 'vad', 'stt']).optional(),
    noise_cancellation: z.boolean().optional(),
    preemptive_generation: z.boolean().optional(),
    expressive: z.boolean().optional(),
    keyterms: z.array(z.string().trim().regex(SAFE_KEYTERM_RE)).max(32).optional(),
    instructions: z.string().trim().min(10).max(8000).optional(),
  })
  .strict();

export const DEFAULT_NODE_SESSION: FullSessionConfig = {
  pipeline: (process.env.LIVEKIT_PIPELINE as 'stt-llm-tts' | 'realtime') || 'stt-llm-tts',
  stt: 'assemblyai/universal-3-6-pro',
  llm: 'google/gemma-4-31b-it',
  tts: 'fishaudio/s2.1-pro',
  voice: 'fa4c9eb3dccc4806b382b40d61c6b10a',
  realtime_model: process.env.LIVEKIT_REALTIME_MODEL || 'openai/gpt-live-1',
  realtime_voice: process.env.LIVEKIT_REALTIME_VOICE || 'marin',
  language: 'en',
  turn_detection: 'turn_detector',
  noise_cancellation: process.env.LIVEKIT_NOISE_CANCELLATION !== 'false',
  preemptive_generation: true,
  expressive: true,
  keyterms: ['LiveKit', 'Wave 2.0'],
};

export function resolveJobConfig(metadata?: string): FullSessionConfig {
  if (!metadata) return { ...DEFAULT_NODE_SESSION };
  try {
    const raw = JSON.parse(metadata);
    const validated = JobMetadataSchema.safeParse(raw);
    if (!validated.success) {
      return { ...DEFAULT_NODE_SESSION };
    }
    const definedOverrides = Object.fromEntries(
      Object.entries(validated.data).filter(([, value]) => value !== undefined),
    );
    return { ...DEFAULT_NODE_SESSION, ...definedOverrides };
  } catch {
    return { ...DEFAULT_NODE_SESSION };
  }
}

export default defineAgent({
  entry: async (ctx) => {
    const config = resolveJobConfig(ctx.job.metadata);
    const isRealtime = config.pipeline === 'realtime';
    const turnDetection =
      config.turn_detection === 'vad'
        ? 'vad'
        : config.turn_detection === 'stt'
          ? 'stt'
          : new inference.TurnDetector();

    const session = isRealtime
      ? new voice.AgentSession({})
      : new voice.AgentSession({
          stt: new inference.STT({
            model: config.stt,
            language: config.language ?? 'en',
          }),
          keytermsOptions: {
            keyterms: config.keyterms,
            keytermDetection: { enabled: true },
          },
          tts: new inference.TTS({
            model: config.tts,
            voice: config.voice,
          }),
          turnHandling: {
            turnDetection,
            preemptiveGeneration: { enabled: config.preemptive_generation },
          },
          expressive: config.expressive,
        });

    await session.start({
      agent: createAgent(config),
      room: ctx.room,
      inputOptions: config.noise_cancellation
        ? {
            noiseCancellation: audioEnhancement({ model: EnhancerModel.QuailVfS }),
          }
        : undefined,
    });

    await ctx.connect();

    session.generateReply({
      instructions: 'Greet the user and offer your assistance.',
    });
  },
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: process.env.LIVEKIT_AGENT_NAME || 'my-agent',
    }),
  );
}
