import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';

import { estimateTokensFromChars, tokensToCredits } from '../billing/costCalculator';
import type { ChatSession } from '../core/models';

export interface ParsedLogLine {
  type: 'turn' | 'usage' | 'tool' | 'sub-agent' | 'unknown';
  timestamp: number;
  metadataCharCount: number;
  model?: string;
  mode?: ChatSession['mode'];
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  toolName?: string;
}

const STRIPPED_FIELDS = new Set([
  'prompt',
  'response',
  'content',
  'message',
  'text',
  'input',
  'output',
  'arguments',
  'args',
  'result',
  'reasoning',
  'file_contents',
  'userRequest',
  'inputMessages',
  'systemPrompt',
  'requestOptions',
  'details',
]);

export async function parseLogFile(filePath: string): Promise<ChatSession | null> {
  const raw = await fs.readFile(filePath, 'utf8');
  return parseLogContent(raw, filePath);
}

export function parseLogContent(raw: string, filePath = ''): ChatSession | null {
  const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) { return null; }

  const parsed = lines
    .map(line => parseLogLine(line))
    .filter((line): line is ParsedLogLine => line !== null);

  if (parsed.length === 0) { return null; }

  let inputTotal = 0;
  let outputTotal = 0;
  let cachedTotal = 0;
  let estimatedCredits = 0;
  let estimatedDollars = 0;
  let turnCount = 0;
  let subAgentCount = 0;
  let startedAt = Number.POSITIVE_INFINITY;
  let lastTurnAt = 0;
  let mode: ChatSession['mode'] = 'unknown';
  const models = new Set<string>();
  const modelUsage: NonNullable<ChatSession['modelUsage']> = {};
  const toolCallSummary: Record<string, number> = {};

  for (const event of parsed) {
    if (Number.isFinite(event.timestamp)) {
      startedAt = Math.min(startedAt, event.timestamp);
      lastTurnAt = Math.max(lastTurnAt, event.timestamp);
    }

    if (event.type === 'turn') {
      turnCount++;
      if (event.mode && event.mode !== 'unknown') { mode = event.mode; }
    }

    if (event.type === 'usage') {
      const inputTokens = event.inputTokens ?? 0;
      const outputTokens = event.outputTokens ?? 0;
      const cachedTokens = event.cachedTokens ?? 0;
      const cacheWriteTokens = event.cacheWriteTokens ?? 0;
      inputTotal += inputTokens;
      outputTotal += outputTokens;
      cachedTotal += cachedTokens + cacheWriteTokens;

      const modelId = event.model ?? 'unknown';
      if (event.model) { models.add(event.model); }
      const cost = tokensToCredits(modelId, inputTokens, outputTokens, cachedTokens, cacheWriteTokens);
      estimatedCredits += cost.credits;
      estimatedDollars += cost.dollars;
      const existing = modelUsage[modelId] ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0, credits: 0, dollars: 0, requestCount: 0 };
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cachedTokens += cachedTokens + cacheWriteTokens;
      existing.credits += cost.credits;
      existing.dollars += cost.dollars;
      existing.requestCount++;
      modelUsage[modelId] = existing;
    }

    if (event.type === 'tool' && event.toolName) {
      toolCallSummary[event.toolName] = (toolCallSummary[event.toolName] ?? 0) + 1;
    }

    if (event.type === 'sub-agent') {
      subAgentCount++;
    }
  }

  if (mode === 'unknown' && Object.keys(toolCallSummary).length > 0) {
    mode = 'agent';
  }

  if (inputTotal === 0 && outputTotal === 0 && cachedTotal === 0) {
    const metadataCharCount = parsed.reduce((sum, event) => sum + event.metadataCharCount, 0);
    const estimatedTokens = estimateTokensFromChars(metadataCharCount);
    inputTotal = Math.floor(estimatedTokens * 0.7);
    outputTotal = estimatedTokens - inputTotal;
    const modelId = [...models][0] ?? 'unknown';
    const cost = tokensToCredits(modelId, inputTotal, outputTotal, cachedTotal);
    estimatedCredits = cost.credits;
    estimatedDollars = cost.dollars;
    modelUsage[modelId] = {
      inputTokens: inputTotal,
      outputTokens: outputTotal,
      cachedTokens: cachedTotal,
      credits: estimatedCredits,
      dollars: estimatedDollars,
      requestCount: 1,
    };
  }

  if (turnCount === 0 && (inputTotal > 0 || outputTotal > 0)) {
    turnCount = 1;
  }

  const now = Date.now();
  if (!Number.isFinite(startedAt)) { startedAt = now; }
  if (lastTurnAt === 0) { lastTurnAt = startedAt; }

  return {
    id: hashPath(filePath || raw.slice(0, 256)),
    filePath,
    workspaceName: '',
    editor: 'vscode',
    mode,
    startedAt,
    lastTurnAt,
    turnCount,
    models: [...models],
    tokens: { input: inputTotal, output: outputTotal, cached: cachedTotal },
    modelUsage,
    estimatedCredits,
    estimatedDollars,
    toolCallSummary,
    subAgentCount,
  };
}

export function parseLogLine(rawLine: string): ParsedLogLine | null {
  try {
    const event = JSON.parse(rawLine) as Record<string, unknown>;
    stripSensitiveFields(event);
    const metadataCharCount = JSON.stringify(event).length;

    const attrs = asRecord(event.attrs);
    const timestamp = parseTimestamp(event.timestamp ?? event.ts ?? attrs?.timestamp);
    const eventName = String(event.event ?? event.type ?? '').toLowerCase();

    if (isUsageEvent(event, attrs, eventName)) {
      const model = normalizeModelId(
        stringValue(event.model ?? event.modelId ?? attrs?.model ?? attrs?.debugName) ??
        modelFromName(stringValue(event.name)),
      );
      const rawInput = numberValue(getNested(event, ['usage', 'prompt_tokens']) ?? attrs?.inputTokens ?? attrs?.prompt_tokens ?? attrs?.input_tokens) ?? 0;
      // OpenAI reports cached at usage.prompt_tokens_details.cached_tokens (or flattened to usage.cached_tokens in some contexts).
      // Anthropic reports them separately in usage.cache_read_input_tokens — input_tokens already excludes cache reads.
      const openAICachedNested = getNested(event, ['usage', 'prompt_tokens_details', 'cached_tokens']);
      const openAICachedFlat = getNested(event, ['usage', 'cached_tokens']);
      const anthropicCached = getNested(event, ['usage', 'cache_read_input_tokens']) ?? attrs?.cache_read_input_tokens;
      const cachedTokens = numberValue(
        anthropicCached ??
        openAICachedNested ?? openAICachedFlat ??
        attrs?.cachedTokens ?? attrs?.cached_tokens ?? attrs?.cache_tokens,
      ) ?? 0;
      // For OpenAI format, inputTokens/prompt_tokens is the TOTAL (cached + uncached) — subtract to avoid double-billing.
      // Copilot debug logs (llm_request attrs) use this same convention: attrs.inputTokens includes attrs.cachedTokens.
      // For Anthropic format, input_tokens is already non-cached (cache_read_input_tokens is separate).
      const isOpenAIFormat = anthropicCached == null && (openAICachedNested != null || openAICachedFlat != null || attrs?.cachedTokens != null || attrs?.cached_tokens != null || attrs?.cache_tokens != null);
      const inputTokens = isOpenAIFormat ? Math.max(0, rawInput - cachedTokens) : rawInput;
      return {
        type: 'usage',
        timestamp,
        metadataCharCount,
        model,
        inputTokens,
        outputTokens: numberValue(getNested(event, ['usage', 'completion_tokens']) ?? attrs?.outputTokens ?? attrs?.completion_tokens ?? attrs?.output_tokens),
        cachedTokens,
        cacheWriteTokens: numberValue(
          getNested(event, ['usage', 'cache_creation_input_tokens']) ??
          getNested(event, ['usage', 'cache_write_tokens']) ??
          attrs?.cache_creation_input_tokens ?? attrs?.cache_write_tokens ?? attrs?.cacheWriteTokens,
        ),
      };
    }

    if (eventName === 'turn.start' || eventName === 'turn_start' || eventName.startsWith('turn_start')) {
      return {
        type: 'turn',
        timestamp,
        metadataCharCount,
        mode: parseMode(event.mode ?? attrs?.mode ?? attrs?.requestMode),
      };
    }

    if (eventName === 'tool.call' || eventName === 'tool_call') {
      const toolName = stringValue(event.toolName ?? attrs?.toolName ?? event.name);
      return toolName ? { type: 'tool', timestamp, metadataCharCount, toolName } : null;
    }

    if (eventName === 'sub-agent.start' || eventName === 'sub_agent_start' || eventName === 'child_session_ref') {
      return { type: 'sub-agent', timestamp, metadataCharCount };
    }

    return null;
  } catch {
    return null;
  }
}

function isUsageEvent(
  event: Record<string, unknown>,
  attrs: Record<string, unknown> | null,
  eventName: string,
): boolean {
  return !!getNested(event, ['usage', 'prompt_tokens']) ||
    eventName === 'llm_request' ||
    attrs?.inputTokens !== undefined ||
    attrs?.outputTokens !== undefined;
}

function stripSensitiveFields(value: unknown): void {
  if (!value || typeof value !== 'object') { return; }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (STRIPPED_FIELDS.has(key)) {
      delete (value as Record<string, unknown>)[key];
      continue;
    }
    stripSensitiveFields((value as Record<string, unknown>)[key]);
  }
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) { return parseTimestamp(numeric); }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) { return parsed; }
  }
  return Date.now();
}

function parseMode(value: unknown): ChatSession['mode'] {
  const normalized = stringValue(value)?.toLowerCase();
  if (normalized === 'ask' || normalized === 'edit' || normalized === 'agent') { return normalized; }
  return 'unknown';
}

function getNested(value: Record<string, unknown>, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') { return undefined; }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function modelFromName(value: string | undefined): string | undefined {
  if (!value) { return undefined; }
  const parts = value.split(':');
  return parts.length > 1 ? parts.at(-1) : value;
}

const MODEL_ALIASES: Record<string, string> = {
  'claude-3-5-sonnet': 'claude-3.7-sonnet',
  'claude-3-7-sonnet': 'claude-3.7-sonnet',
  'gemini-3-flash-preview': 'gemini-3-flash',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro',
  'gemini-2.5-pro-preview': 'gemini-2.5-pro',
};

function normalizeModelId(value: string | undefined): string | undefined {
  if (!value) { return undefined; }
  const normalized = value.trim().toLowerCase();
  return MODEL_ALIASES[normalized] ?? normalized;
}

function hashPath(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}