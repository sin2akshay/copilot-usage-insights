import type { ChatSession, CreditsAggregate, ModelBreakdown } from '../core/models';

const LOGIN_PATTERN = /^[a-zA-Z0-9-]+$/;
const REQUEST_TIMEOUT_MS = 15_000;

interface RawUsageItem {
  product?: string;
  sku?: string;
  model?: string;
  unitType?: string;
  pricePerUnit?: number;
  grossQuantity?: number;
  grossAmount?: number;
  netQuantity?: number;
  netAmount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}

export async function fetchCreditsAggregate(
  token: string,
  username: string,
  allowance: number,
): Promise<CreditsAggregate | null> {
  if (!LOGIN_PATTERN.test(username)) {
    throw new Error('Invalid login for credits endpoint');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = `https://api.github.com/users/${username}/settings/billing/usage`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': 'copilot-usage-insights',
      },
    });
  } catch (error: unknown) {
    clearTimeout(timeout);
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    throw new Error(isTimeout ? 'Credits request timed out' : 'Credits network error');
  }
  clearTimeout(timeout);

  if (response.status === 403 || response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Credits fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as { usageItems?: RawUsageItem[]; usage_items?: RawUsageItem[] };
  const items = data.usageItems ?? data.usage_items ?? [];
  const copilot = items.filter(item => !item.product || item.product.toLowerCase() === 'copilot');
  const byModelMap = new Map<string, ModelBreakdown>();

  for (const item of copilot) {
    const modelId = item.model || item.sku || 'unknown';
    const dollars = finiteNumber(item.netAmount) ?? finiteNumber(item.grossAmount) ?? 0;
    const unitType = item.unitType?.toLowerCase() ?? '';
    const credits = unitType.includes('credit') && finiteNumber(item.netQuantity) !== null
      ? finiteNumber(item.netQuantity) ?? 0
      : dollars * 100;
    const requestCount = finiteNumber(item.netQuantity) ?? finiteNumber(item.grossQuantity) ?? 0;
    const existing = byModelMap.get(modelId);

    if (existing) {
      existing.credits += credits;
      existing.dollars += dollars;
      existing.requestCount = (existing.requestCount ?? 0) + requestCount;
      existing.inputTokens = addOptional(existing.inputTokens, item.inputTokens);
      existing.outputTokens = addOptional(existing.outputTokens, item.outputTokens);
      existing.cachedTokens = addOptional(existing.cachedTokens, item.cachedTokens);
    } else {
      byModelMap.set(modelId, {
        modelId,
        displayName: humanizeModelId(modelId),
        credits,
        dollars,
        requestCount,
        inputTokens: finiteNumber(item.inputTokens) ?? undefined,
        outputTokens: finiteNumber(item.outputTokens) ?? undefined,
        cachedTokens: finiteNumber(item.cachedTokens) ?? undefined,
      });
    }
  }

  return aggregateFromModelMap('github-api', byModelMap, allowance, Date.now());
}

export function sessionsToCreditsAggregate(
  sessions: ChatSession[],
  allowance: number,
  nowMs = Date.now(),
): CreditsAggregate {
  const { startMs, endMs } = cycleBounds(nowMs);
  const byModelMap = new Map<string, ModelBreakdown>();

  for (const session of sessions) {
    if (session.lastTurnAt < startMs || session.lastTurnAt >= endMs) { continue; }
    const modelUsage = Object.entries(session.modelUsage ?? {});

    if (modelUsage.length > 0) {
      for (const [modelId, usage] of modelUsage) {
        addLocalModelUsage(byModelMap, modelId, usage.credits, usage.dollars, usage.inputTokens, usage.outputTokens, usage.cachedTokens, usage.requestCount);
      }
    } else {
      const modelId = session.models[0] ?? 'unknown';
      const requestCount = session.tokens.input + session.tokens.output + session.tokens.cached > 0 ? Math.max(1, session.turnCount) : 0;
      addLocalModelUsage(
        byModelMap,
        modelId,
        session.estimatedCredits,
        session.estimatedDollars,
        session.tokens.input,
        session.tokens.output,
        session.tokens.cached,
        requestCount,
      );
    }
  }

  return aggregateFromModelMap('local-estimate', byModelMap, allowance, nowMs);
}

export function humanizeModelId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || trimmed === 'unknown' || trimmed === '_fallback') { return 'Unknown model'; }
  return trimmed
    .replace(/[_-]/g, ' ')
    .replace(/\bgpt\b/gi, 'GPT')
    .replace(/\b([a-z])/g, char => char.toUpperCase());
}

function aggregateFromModelMap(
  source: CreditsAggregate['source'],
  byModelMap: Map<string, ModelBreakdown>,
  allowance: number,
  nowMs: number,
): CreditsAggregate {
  const { startIso, endIso } = cycleBounds(nowMs);
  const byModel = [...byModelMap.values()]
    .map(model => ({
      ...model,
      credits: roundCredits(model.credits),
      dollars: roundDollars(model.dollars),
    }))
    .sort((a, b) => b.credits - a.credits);
  const creditsUsed = roundCredits(byModel.reduce((sum, model) => sum + model.credits, 0));
  const dollarsSpent = roundDollars(byModel.reduce((sum, model) => sum + model.dollars, 0));

  return {
    source,
    fetchedAt: nowMs,
    cycleStart: startIso,
    cycleEnd: endIso,
    creditsUsed,
    creditsAllowance: allowance,
    dollarsSpent,
    byModel,
  };
}

function cycleBounds(nowMs: number): { startMs: number; endMs: number; startIso: string; endIso: string } {
  const now = new Date(nowMs);
  const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const endMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function finiteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function addOptional(current: number | undefined, next: unknown): number | undefined {
  const numeric = finiteNumber(next);
  if (numeric === null) { return current; }
  return (current ?? 0) + numeric;
}

function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundDollars(value: number): number {
  return Math.round(value * 100) / 100;
}

function addLocalModelUsage(
  byModelMap: Map<string, ModelBreakdown>,
  modelId: string,
  credits: number,
  dollars: number,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  requestCount: number,
): void {
  const existing = byModelMap.get(modelId);
  if (existing) {
    existing.credits += credits;
    existing.dollars += dollars;
    existing.inputTokens = (existing.inputTokens ?? 0) + inputTokens;
    existing.outputTokens = (existing.outputTokens ?? 0) + outputTokens;
    existing.cachedTokens = (existing.cachedTokens ?? 0) + cachedTokens;
    existing.requestCount = (existing.requestCount ?? 0) + requestCount;
    return;
  }

  byModelMap.set(modelId, {
    modelId,
    displayName: humanizeModelId(modelId),
    credits,
    dollars,
    inputTokens,
    outputTokens,
    cachedTokens,
    requestCount,
  });
}