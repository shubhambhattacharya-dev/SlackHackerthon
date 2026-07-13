/**
 * @deprecated Use `callLLM` / `callLLMSafe` from `./llm.js` instead.
 *
 * This file now delegates to the unified LLM module which provides
 * automatic fallback across Groq → OpenRouter → Gemini.
 */
export { callLLM as callGroq, callLLMSafe as callGroqSafe, LLMError as GroqError } from './llm.js';
export type { LLMOptions as CallGroqOptions } from './llm.js';
