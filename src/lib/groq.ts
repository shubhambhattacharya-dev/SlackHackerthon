import { config } from '../config/env.js';
import { logger } from './logger.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant';

export class GroqError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GroqError';
    this.status = status;
  }
}

interface CallGroqOptions {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  signal?: AbortSignal;
  responseFormat?: 'json_object' | 'text';
}

export async function callGroq(opts: CallGroqOptions): Promise<string> {
  const key = config.ai.groqKey;
  if (!key) {
    throw new GroqError('GROQ_API_KEY is not configured');
  }

  const body: Record<string, any> = {
    model: opts.model ?? GROQ_MODEL,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GroqError(`Groq request failed with status ${res.status}: ${detail}`, res.status);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content ?? '';
}

/**
 * Higher-level helper: calls Groq, logs errors, returns empty string on failure.
 */
export async function callGroqSafe(
  system: string,
  user: string,
  temperature = 0.3,
): Promise<string> {
  try {
    return await callGroq({ system, user, temperature });
  } catch (error) {
    logger.error({ error }, 'Groq call failed (safe fallback)');
    return '';
  }
}
