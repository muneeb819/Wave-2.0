import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { EnhancerModel, audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type NodeAgentConfig, createAgent } from './agent.ts';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, '../.env.local') });
dotenv.config({ path: path.resolve(currentDir, '../../.env.local') });

export interface FullSessionConfig extends NodeAgentConfig {
  stt: string;
  tts: string;
  voice: string;
  noise_cancellation: boolean;
  preemptive_generation: boolean;
  expressive: boolean;
  keyterms: string[];
}

export const DEFAULT_NODE_SESSION: FullSessionConfig = {
  pipeline: (process.env.LIVEKIT_PIPELINE as 'stt-llm-tts' | 'realtime') || 'stt-llm-tts',
  stt: 'assemblyai/universal-3-6-pro',
  llm: 'google/gemma-4-31b-it',
  tts: 'fishaudio/s2.1-pro',
  voice: 'fa4c9eb3dccc4806b382b40d61c6b10a',
  realtime_model: process.env.LIVEKIT_REALTIME_MODEL || 'openai/gpt-live-1',
  realtime_voice: process.env.LIVEKIT_REALTIME_VOICE || 'marin',
  language: 'en',
  noise_cancellation: process.env.LIVEKIT_NOISE_CANCELLATION !== 'false',
  preemptive_generation: true,
  expressive: true,
  keyterms: ['LiveKit', 'Wave 2.0'],
};

export function resolveJobConfig(metadata?: string): FullSessionConfig {
  if (!metadata) return { ...DEFAULT_NODE_SESSION };
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...DEFAULT_NODE_SESSION, ...parsed };
    }
  } catch {
    // Ignore malformed metadata and fall back cleanly to defaults.
  }
  return { ...DEFAULT_NODE_SESSION };
}

export default defineAgent({
  entry: async (ctx) => {
    const config = resolveJobConfig(ctx.job.metadata);
    const isRealtime = config.pipeline === 'realtime';

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
            turnDetection: new inference.TurnDetector(),
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
