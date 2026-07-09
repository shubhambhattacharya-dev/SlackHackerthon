import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

// ---------- Types ----------

export interface MultilingualResult {
  isCommitment: boolean;
  task: string | null;
  deadline: string | null;          // ISO 8601 when resolvable, else raw phrase
  deadlineRaw: string | null;       // original phrase e.g. "tomorrow 5pm"
  language: string;                 // ISO 639-1 code, e.g. "en", "es", "hi"
  languageName: string;             // human readable, e.g. "English"
  confidence: number;               // 0..1
  priority: 'low' | 'medium' | 'high' | null;
  assignee: string | null;          // who is committing, if mentioned
  category: string | null;          // e.g. "work", "personal", "finance"
  reasoning: string | null;         // short model justification
}

export interface DetectOptions {
  referenceDate?: Date;             // for resolving relative deadlines
  timeoutMs?: number;               // request timeout
  maxRetries?: number;              // retry attempts on transient failure
  model?: string;
}

// ---------- Constants ----------

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

// ---------- Prompt building ----------

function buildSystemPrompt(referenceDate: Date): string {
  const iso = referenceDate.toISOString();
  return [
    'You are a precise multilingual commitment-extraction engine.',
    'A "commitment" is a statement where someone promises, agrees, or intends to do a specific action, often with a time reference.',
    'Work in ANY language. Detect the language of the message.',
    `The current reference date/time is ${iso} (UTC). Resolve relative deadlines ("tomorrow", "next Friday", "in 2 hours") against it and output ISO 8601.`,
    'If a field is unknown, use null. Never invent facts.',
    'Return ONLY valid JSON, no markdown, no commentary.',
  ].join(' ');
}

function buildUserPrompt(text: string): string {
  return `Analyze this message and extract commitment data.

Message: """${text}"""

Return JSON exactly matching this schema:
{
  "isCommitment": boolean,
  "task": string | null,
  "deadline": string | null,        // ISO 8601 if resolvable, else null
  "deadlineRaw": string | null,     // the original time phrase as written
  "language": string,               // ISO 639-1 code, e.g. "en"
  "languageName": string,           // e.g. "English"
  "confidence": number,             // 0.0 to 1.0
  "priority": "low" | "medium" | "high" | null,
  "assignee": string | null,        // person who will do the task
  "category": string | null,        // e.g. "work", "personal", "finance", "health"
  "reasoning": string | null        // one short sentence explaining your decision
}`;
}

// ---------- Utilities ----------

/** Extract the first balanced JSON object from a string (handles code fences / stray text). */
function extractJson(raw: string): string | null {
  if (!raw) return null;

  // Strip common markdown code fences.
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

/** Normalize + validate the parsed object into a safe MultilingualResult. */
function normalizeResult(parsed: any): MultilingualResult | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const priorityRaw = asStringOrNull(parsed.priority)?.toLowerCase() ?? null;
  const priority =
    priorityRaw && VALID_PRIORITIES.has(priorityRaw)
      ? (priorityRaw as MultilingualResult['priority'])
      : null;

  const language = asStringOrNull(parsed.language)?.toLowerCase().slice(0, 5) ?? 'unknown';

  return {
    isCommitment: parsed.isCommitment === true,
    task: asStringOrNull(parsed.task),
    deadline: asStringOrNull(parsed.deadline),
    deadlineRaw: asStringOrNull(parsed.deadlineRaw),
    language,
    languageName: asStringOrNull(parsed.languageName) ?? 'Unknown',
    confidence: clamp01(parsed.confidence),
    priority,
    assignee: asStringOrNull(parsed.assignee),
    category: asStringOrNull(parsed.category),
    reasoning: asStringOrNull(parsed.reasoning),
  };
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- Core call with timeout + retry ----------

async function callGroq(
  prompt: { system: string; user: string },
  opts: Required<Pick<DetectOptions, 'timeoutMs' | 'maxRetries' | 'model'>>,
): Promise<any> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.ai.groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: 0.1,          // low temp => more deterministic extraction
          response_format: { type: 'json_object' }, // force JSON if supported
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        if (isTransientStatus(response.status) && attempt < opts.maxRetries) {
          const backoff = 300 * 2 ** attempt;
          logger.warn(
            { status: response.status, attempt, backoff },
            'Groq transient error, retrying',
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(`Groq API ${response.status}: ${bodyText.slice(0, 300)}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (attempt < opts.maxRetries) {
        const backoff = 300 * 2 ** attempt;
        logger.warn(
          { err: error, attempt, aborted, backoff },
          'Groq request failed, retrying',
        );
        await sleep(backoff);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Groq request failed');
}

// ---------- Public API ----------

export async function detectMultilingual(
  text: string,
  options: DetectOptions = {},
): Promise<MultilingualResult | null> {
  // Input guards.
  if (typeof text !== 'string' || text.trim().length === 0) {
    logger.debug('detectMultilingual: empty input');
    return null;
  }
  if (!config.ai.groqKey) {
    logger.error('detectMultilingual: missing Groq API key');
    return null;
  }

  const trimmed = text.trim().slice(0, 4000); // guard against oversized input
  const referenceDate = options.referenceDate ?? new Date();

  const opts = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    model: options.model ?? DEFAULT_MODEL,
  };

  const prompt = {
    system: buildSystemPrompt(referenceDate),
    user: buildUserPrompt(trimmed),
  };

  try {
    const data = await callGroq(prompt, opts);
    const content: string | undefined = data?.choices?.[0]?.message?.content;

    if (!content) {
      logger.warn({ data }, 'Groq returned no content');
      return null;
    }

    const jsonStr = extractJson(content) ?? content;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      logger.warn({ err: parseErr, content }, 'Failed to parse model JSON');
      return null;
    }

    const result = normalizeResult(parsed);
    if (!result) {
      logger.warn({ parsed }, 'Normalization rejected model output');
      return null;
    }

    logger.debug(
      { language: result.language, isCommitment: result.isCommitment, confidence: result.confidence },
      'Multilingual detection succeeded',
    );
    return result;
  } catch (error) {
    logger.error({ err: error }, 'Multilingual detection failed');
    return null;
  }
}
