import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config/env.js', () => ({
  config: { ai: { groqKey: 'test-key' } },
}));
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { detectMultilingual } from './multilingual.js';

function mockGroqResponse(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => content,
  } as unknown as Response;
}

describe('detectMultilingual', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for empty input without calling the API', async () => {
    const spy = vi.spyOn(global, 'fetch');
    const res = await detectMultilingual('   ');
    expect(res).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('parses a clean commitment JSON response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      mockGroqResponse(JSON.stringify({
        isCommitment: true, task: 'send report', deadline: '2026-07-10T17:00:00Z',
        deadlineRaw: 'tomorrow 5pm', language: 'EN', languageName: 'English',
        confidence: 0.92, priority: 'high', assignee: 'me',
        category: 'work', reasoning: 'promise with deadline',
      })),
    );
    const res = await detectMultilingual("I'll send the report tomorrow 5pm");
    expect(res).not.toBeNull();
    expect(res!.isCommitment).toBe(true);
    expect(res!.language).toBe('en');       // lowercased
    expect(res!.priority).toBe('high');
    expect(res!.confidence).toBeCloseTo(0.92);
  });

  it('strips markdown fences and extracts embedded JSON', async () => {
    const fenced = '```json\n' + JSON.stringify({
      isCommitment: false, language: 'en', languageName: 'English', confidence: 0.4,
    }) + '\n```';
    vi.spyOn(global, 'fetch').mockResolvedValue(mockGroqResponse(fenced));
    const res = await detectMultilingual('just a note');
    expect(res!.isCommitment).toBe(false);
  });

  it('clamps out-of-range confidence and rejects invalid priority', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      mockGroqResponse(JSON.stringify({
        isCommitment: true, language: 'es', confidence: 5, priority: 'urgent',
      })),
    );
    const res = await detectMultilingual('haré la tarea');
    expect(res!.confidence).toBe(1);        // clamped
    expect(res!.priority).toBeNull();       // invalid dropped
  });

  it('returns null when model returns non-JSON', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(mockGroqResponse('not json at all'));
    const res = await detectMultilingual('hello');
    expect(res).toBeNull();
  });

  it('retries on 500 then succeeds', async () => {
    const spy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockGroqResponse('err', false, 500))
      .mockResolvedValueOnce(mockGroqResponse(JSON.stringify({
        isCommitment: true, language: 'en', confidence: 0.8,
      })));
    const res = await detectMultilingual('I will do it', { maxRetries: 1 });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res!.isCommitment).toBe(true);
  });

  it('handles missing content gracefully', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, json: async () => ({ choices: [] }), text: async () => '',
    } as unknown as Response);
    const res = await detectMultilingual('hello');
    expect(res).toBeNull();
  });
});
