import { config } from '../config/env.js';
import { logger } from './logger.js';

// ─── Types ────────────────────────────────────────────────────────────

export interface LLMOptions {
  system: string;
  user: string;
  temperature?: number;
  signal?: AbortSignal;
  responseFormat?: 'json_object' | 'text';
}

export interface ProviderResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export class LLMError extends Error {
  provider: string;
  status?: number;

  constructor(message: string, provider: string, status?: number) {
    super(message);
    this.name = 'LLMError';
    this.provider = provider;
    this.status = status;
  }
}

// ─── Provider configurations ─────────────────────────────────────────

interface ProviderConfig {
  name: string;
  key: string | undefined;
  url: string;
  defaultModel: string;
  timeoutMs: number;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'groq',
    key: config.ai.groqKey,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.1-8b-instant',
    timeoutMs: 15_000,
  },
  {
    name: 'openrouter',
    key: config.ai.openRouterKey,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct',
    timeoutMs: 20_000,
  },
  {
    name: 'gemini',
    key: config.ai.googleKey,
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    defaultModel: 'gemini-1.5-flash',
    timeoutMs: 25_000,
  },
];

// ─── Individual provider callers ─────────────────────────────────────

/** Shared caller for OpenAI-compatible APIs (Groq & OpenRouter). */
async function callOpenAICompatible(
  opts: LLMOptions,
  provider: ProviderConfig,
  signal: AbortSignal,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: provider.defaultModel,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(provider.url, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LLMError(
      `${provider.name} request failed with status ${res.status}: ${detail}`,
      provider.name,
      res.status,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content ?? '';
}

/** Calls Google Gemini with proper system_instruction field. */
async function callGeminiProvider(
  opts: LLMOptions,
  provider: ProviderConfig,
  signal: AbortSignal,
): Promise<string> {
  // key is guaranteed by caller, but be defensive
  const apiKey = provider.key ?? '';

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: opts.user }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
    },
  };

  // Gemini supports system_instruction as a top-level field
  if (opts.system) {
    body.system_instruction = { parts: [{ text: opts.system }] };
  }

  // For JSON mode, instruct via prompt addition + set responseMimeType
  if (opts.responseFormat === 'json_object') {
    body.generationConfig = {
      ...(body.generationConfig as object),
      response_mime_type: 'application/json',
    };
    // Append instruction to the user message
    const parts = (body.contents as Array<{ parts: Array<{ text: string }> }>)[0].parts;
    parts[0].text += '\n\nRespond ONLY with valid JSON. No markdown, no explanation.';
  }

  const res = await fetch(`${provider.url}?key=${apiKey}`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new LLMError(
      `Gemini request failed with status ${res.status}: ${detail}`,
      provider.name,
      res.status,
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── Provider call dispatch ───────────────────────────────────────────

const PROVIDER_CALLERS: Record<
  string,
  (opts: LLMOptions, provider: ProviderConfig, signal: AbortSignal) => Promise<string>
> = {
  groq: callOpenAICompatible,
  openrouter: callOpenAICompatible,
  gemini: callGeminiProvider,
};

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Call an LLM with automatic fallback across providers:
 *
 *   1. Groq (llama-3.1-8b-instant) — fastest, primary
 *   2. OpenRouter (meta-llama/llama-3.1-8b-instruct) — backup
 *   3. Google Gemini (gemini-1.5-flash) — last resort
 *
 * Each provider gets its own timeout. If all fail, throws LLMError
 * with details of every failure.
 */
export async function callLLM(opts: LLMOptions): Promise<ProviderResult> {
  const failures: Array<{ provider: string; error: string }> = [];

  for (const provider of PROVIDERS) {
    // Skip providers with no key configured
    if (!provider.key) {
      logger.debug({ provider: provider.name }, 'Skipping LLM provider — no API key configured');
      continue;
    }

    const start = performance.now();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), provider.timeoutMs);

    const { signal: combinedSignal, cleanup } = combineSignals(
      opts.signal,
      timeoutController.signal,
    );

    try {
      const caller = PROVIDER_CALLERS[provider.name];
      const content = await caller(opts, provider, combinedSignal);
      const latencyMs = Math.round(performance.now() - start);

      clearTimeout(timeoutId);
      cleanup();

      logger.info(
        { provider: provider.name, latencyMs, model: provider.defaultModel },
        'LLM call succeeded',
      );

      return { content, provider: provider.name, model: provider.defaultModel, latencyMs };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      cleanup();
      const latencyMs = Math.round(performance.now() - start);
      const message = error instanceof Error ? error.message : String(error);

      logger.warn(
        { provider: provider.name, latencyMs, error: message },
        'LLM provider failed, trying next fallback...',
      );

      failures.push({ provider: provider.name, error: message });
      // Continue to next provider
    }
  }

  // All providers failed
  const summary = failures.map((f) => `[${f.provider}] ${f.error}`).join('; ');
  throw new LLMError(
    `All LLM providers failed: ${summary}`,
    'all',
  );
}

/**
 * Higher-level helper: calls callLLM, returns empty string on total failure.
 * Useful when you want best-effort AI without crashing.
 */
export async function callLLMSafe(
  system: string,
  user: string,
  temperature = 0.3,
): Promise<string> {
  try {
    const result = await callLLM({ system, user, temperature });
    return result.content;
  } catch (error) {
    logger.error({ error }, 'All LLM providers failed (safe fallback)');
    return '';
  }
}

// ─── Utility: combine two AbortSignals ────────────────────────────────

function combineSignals(
  userSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (!userSignal) {
    return { signal: timeoutSignal, cleanup: () => {} };
  }

  if (userSignal.aborted) {
    timeoutSignal = AbortSignal.timeout(1); // immediate abort
    return { signal: timeoutSignal, cleanup: () => {} };
  }

  const controller = new AbortController();

  const onUserAbort = () => controller.abort(userSignal.reason);
  const onTimeoutAbort = () => controller.abort(timeoutSignal.reason);

  userSignal.addEventListener('abort', onUserAbort, { once: true });
  timeoutSignal.addEventListener('abort', onTimeoutAbort, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      userSignal.removeEventListener('abort', onUserAbort);
      timeoutSignal.removeEventListener('abort', onTimeoutAbort);
      // Don't abort — the operation already completed
    },
  };
}
