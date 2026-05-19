import { describe, expect, it, vi } from 'vitest';

const vscodeConfig = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, fallback: unknown) => vscodeConfig.values.get(key) ?? fallback,
    }),
  },
}));

import { loadPricingFromJson } from '../billing/pricing';
import { parseLogContent } from '../logs/parser';

loadPricingFromJson({
  models: {
    'gpt-5': { displayName: 'GPT-5', inputPerM: 100, outputPerM: 500, cachedPerM: 10 },
    'claude-sonnet-4.6': { displayName: 'Claude Sonnet 4.6', inputPerM: 300, outputPerM: 1500, cachedPerM: 30, cacheWritePerM: 375 },
    _fallback: { displayName: 'Unknown model', inputPerM: 200, outputPerM: 1000, cachedPerM: 20 },
  },
});

describe('parseLogContent', () => {
  it('parses turn, usage, tool, and sub-agent metadata', () => {
    const content = [
      JSON.stringify({ event: 'turn.start', timestamp: '2026-05-13T10:00:00Z', mode: 'agent' }),
      JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 50, cached_tokens: 10 }, model: 'gpt-5', timestamp: '2026-05-13T10:00:01Z' }),
      JSON.stringify({ event: 'tool.call', timestamp: '2026-05-13T10:00:02Z', toolName: 'read_file', arguments: { path: 'secret.ts' } }),
      JSON.stringify({ event: 'sub-agent.start', timestamp: '2026-05-13T10:00:03Z' }),
    ].join('\n');

    const session = parseLogContent(content, '/tmp/simple.jsonl');
    expect(session?.mode).toBe('agent');
    expect(session?.turnCount).toBe(1);
    expect(session?.models).toEqual(['gpt-5']);
    // prompt_tokens (100) includes cached_tokens (10) in OpenAI format; non-cached input = 90
    expect(session?.tokens).toEqual({ input: 90, output: 50, cached: 10 });
    expect(session?.toolCallSummary).toEqual({ read_file: 1 });
    expect(session?.subAgentCount).toBe(1);
  });

  it('parses current VS Code debug log event names without storing bodies', () => {
    const content = [
      JSON.stringify({ type: 'turn_start', ts: '2026-05-13T10:00:00Z', attrs: { turnId: 0 } }),
      JSON.stringify({ type: 'llm_request', name: 'chat:gpt-5', ts: '2026-05-13T10:00:01Z', attrs: { model: 'gpt-5', inputTokens: 200, outputTokens: 75, cachedTokens: 25, userRequest: 'SECRET_USER_REQUEST' } }),
      JSON.stringify({ type: 'tool_call', name: 'grep_search', ts: '2026-05-13T10:00:02Z', attrs: { args: 'SECRET_ARGS', result: 'SECRET_RESULT' } }),
      JSON.stringify({ type: 'agent_response', name: 'agent_response', ts: '2026-05-13T10:00:03Z', attrs: { response: 'SECRET_RESPONSE' } }),
    ].join('\n');

    const session = parseLogContent(content, '/tmp/current.jsonl');
    const serialized = JSON.stringify(session);
    expect(session?.models).toEqual(['gpt-5']);
    // inputTokens (200) includes cachedTokens (25) per Copilot telemetry convention — non-cached input = 175
    expect(session?.tokens.input).toBe(175);
    expect(session?.toolCallSummary).toEqual({ grep_search: 1 });
    expect(serialized).not.toContain('SECRET_USER_REQUEST');
    expect(serialized).not.toContain('SECRET_ARGS');
    expect(serialized).not.toContain('SECRET_RESULT');
    expect(serialized).not.toContain('SECRET_RESPONSE');
  });

  it('strips prompt and response content from parsed output', () => {
    const content = [
      JSON.stringify({ event: 'turn.start', timestamp: '2026-05-13T10:00:00Z', mode: 'ask', prompt: 'SECRET_PROMPT_TOKEN_xyz' }),
      JSON.stringify({ usage: { prompt_tokens: 100, completion_tokens: 50, cached_tokens: 0 }, model: 'gpt-5', timestamp: '2026-05-13T10:00:05Z', response: 'SECRET_RESPONSE_TOKEN_abc' }),
    ].join('\n');

    const session = parseLogContent(content, '/tmp/privacy.jsonl');
    const serialized = JSON.stringify(session);
    expect(serialized).not.toContain('SECRET_PROMPT_TOKEN_xyz');
    expect(serialized).not.toContain('SECRET_RESPONSE_TOKEN_abc');
  });

  it('ignores malformed lines without throwing', () => {
    const content = [
      'not json',
      JSON.stringify({ event: 'turn.start', timestamp: '2026-05-13T10:00:00Z', mode: 'ask' }),
    ].join('\n');

    expect(parseLogContent(content, '/tmp/malformed.jsonl')?.turnCount).toBe(1);
  });

  it('keeps per-model token usage for mixed-model sessions', () => {
    const content = [
      JSON.stringify({ type: 'llm_request', name: 'chat:gpt-5', ts: '2026-05-13T10:00:01Z', attrs: { model: 'gpt-5', inputTokens: 200, outputTokens: 75, cachedTokens: 25 } }),
      JSON.stringify({ type: 'llm_request', name: 'chat:claude-3.7-sonnet', ts: '2026-05-13T10:00:02Z', attrs: { model: 'claude-3.7-sonnet', inputTokens: 300, outputTokens: 125, cachedTokens: 0 } }),
    ].join('\n');

    const session = parseLogContent(content, '/tmp/multi.jsonl');
    expect(session?.models).toEqual(['gpt-5', 'claude-3.7-sonnet']);
    // gpt-5: inputTokens (200) includes cachedTokens (25) — non-cached stored as 175
    expect(session?.modelUsage?.['gpt-5'].inputTokens).toBe(175);
    expect(session?.modelUsage?.['claude-3.7-sonnet'].outputTokens).toBe(125);
  });

  it('parses Anthropic cache read and cache write token usage', () => {
    const content = [
      JSON.stringify({
        type: 'llm_request',
        name: 'chat:claude-sonnet-4.6',
        ts: '2026-05-13T10:00:01Z',
        model: 'claude-sonnet-4.6',
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          cache_read_input_tokens: 100,
          cache_creation_input_tokens: 200,
        },
      }),
    ].join('\n');

    const session = parseLogContent(content, '/tmp/cache-write.jsonl');
    expect(session?.tokens.cached).toBe(300);
    expect(session?.modelUsage?.['claude-sonnet-4.6'].cachedTokens).toBe(300);
    expect(session?.estimatedCredits).toBeCloseTo(0.078, 5);
  });
});