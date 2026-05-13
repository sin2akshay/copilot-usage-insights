import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { fetchCreditsAggregate, sessionsToCreditsAggregate } from '../billing/creditsData';
import { tokensToCredits } from '../billing/costCalculator';
import { creditsAllowanceForPlan, isPreviewMode, resolveView } from '../billing/modeResolver';
import { getPricing, loadPricingFromJson } from '../billing/pricing';
import type { ChatSession, PlanInfo } from '../core/models';

const fakeFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

vi.stubGlobal('fetch', fakeFetch);
vi.stubGlobal('AbortController', class {
  signal = {} as AbortSignal;
  abort = vi.fn();
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const monthlyPlan: PlanInfo = { type: 'pro', billingCycle: 'monthly', creditsAllowance: 1000 };
const annualPlan: PlanInfo = { type: 'pro', billingCycle: 'annual', creditsAllowance: 1000 };

beforeEach(() => {
  fakeFetch.mockReset();
  vscodeConfig.values.clear();
  loadPricingFromJson({
    models: {
      'gpt-5': { displayName: 'GPT-5', inputPerM: 100, outputPerM: 500, cachedPerM: 10 },
      'claude-sonnet-4.6': { displayName: 'Claude Sonnet 4.6', inputPerM: 300, outputPerM: 1500, cachedPerM: 30, cacheWritePerM: 375 },
      _fallback: { displayName: 'Unknown model', inputPerM: 200, outputPerM: 1000, cachedPerM: 20 },
    },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('billing mode resolver', () => {
  it('keeps auto on premium requests before June 1', () => {
    expect(resolveView(monthlyPlan, 'auto', Date.parse('2026-05-13T12:00:00Z'))).toBe('premium-requests');
  });

  it('switches monthly auto users to AI Credits on June 1', () => {
    expect(resolveView(monthlyPlan, 'auto', Date.parse('2026-06-01T00:00:00Z'))).toBe('ai-credits');
  });

  it('keeps annual auto users on premium requests after June 1', () => {
    expect(resolveView(annualPlan, 'auto', Date.parse('2026-06-01T00:00:00Z'))).toBe('premium-requests');
  });

  it('keeps unknown billing cycles on premium requests after June 1', () => {
    expect(resolveView({ ...monthlyPlan, billingCycle: 'unknown' }, 'auto', Date.parse('2026-06-01T00:00:00Z'))).toBe('premium-requests');
  });

  it('detects preview mode before June 1', () => {
    expect(isPreviewMode(Date.parse('2026-05-31T23:59:59Z'))).toBe(true);
    expect(isPreviewMode(Date.parse('2026-06-01T00:00:00Z'))).toBe(false);
  });

  it('returns configured plan allowances', () => {
    expect(creditsAllowanceForPlan('free')).toBe(100);
    expect(creditsAllowanceForPlan('pro-plus')).toBe(3900);
    expect(creditsAllowanceForPlan('business')).toBe(1900);
  });
});

describe('pricing and cost calculation', () => {
  it('converts tokens to credits', () => {
    const cost = tokensToCredits('gpt-5', 1_000_000, 2_000_000, 500_000);
    expect(cost.credits).toBe(1105);
    expect(cost.dollars).toBeCloseTo(11.05, 5);
  });

  it('includes model-specific cache-write token rates', () => {
    const cost = tokensToCredits('claude-sonnet-4.6', 0, 0, 0, 1_000_000);
    expect(cost.credits).toBe(375);
    expect(cost.dollars).toBeCloseTo(3.75, 5);
  });

  it('merges user overrides with bundled pricing', () => {
    vscodeConfig.values.set('pricing.overrides', {
      'gpt-5': { outputPerM: 750 },
    });

    expect(getPricing('gpt-5')).toMatchObject({ inputPerM: 100, outputPerM: 750, cachedPerM: 10 });
  });

  it('uses fallback pricing for unknown models', () => {
    expect(getPricing('new-model')).toMatchObject({ modelId: 'new-model', displayName: 'Unknown model', inputPerM: 200 });
  });
});

describe('credits aggregate API', () => {
  it('parses Copilot usage items into a credits aggregate', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({
      usageItems: [
        { product: 'Copilot', model: 'gpt-5', unitType: 'credits', netQuantity: 120, netAmount: 1.2 },
        { product: 'Copilot', model: 'claude-3.7-sonnet', unitType: 'credits', netQuantity: 80, netAmount: 0.8 },
        { product: 'Actions', model: 'linux', unitType: 'minutes', netQuantity: 99, netAmount: 9.9 },
      ],
    }));

    const aggregate = await fetchCreditsAggregate('tok', 'testuser', 1000);
    expect(aggregate?.source).toBe('github-api');
    expect(aggregate?.creditsUsed).toBe(200);
    expect(aggregate?.dollarsSpent).toBe(2);
    expect(aggregate?.byModel.map(model => model.modelId)).toEqual(['gpt-5', 'claude-3.7-sonnet']);
  });

  it('uses gross AI Credits usage when net billing is discounted to zero', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({
      usageItems: [
        { product: 'Copilot', model: 'gpt-5', unitType: 'credits', grossQuantity: 42, grossAmount: 0.42, netQuantity: 0, netAmount: 0 },
      ],
    }));

    const aggregate = await fetchCreditsAggregate('tok', 'testuser', 1000);
    expect(aggregate?.creditsUsed).toBe(42);
    expect(aggregate?.dollarsSpent).toBe(0.42);
    expect(aggregate?.byModel[0]?.requestCount).toBe(42);
  });

  it('returns null for users outside enhanced billing access', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchCreditsAggregate('tok', 'testuser', 1000)).resolves.toBeNull();
  });

  it('builds local estimates from sessions in the current cycle', () => {
    const now = Date.UTC(2026, 4, 13, 12);
    const sessions: ChatSession[] = [
      makeSession({ id: 'a', lastTurnAt: Date.UTC(2026, 4, 13), model: 'gpt-5', credits: 12, dollars: 0.12 }),
      makeSession({ id: 'b', lastTurnAt: Date.UTC(2026, 3, 30), model: 'gpt-5', credits: 50, dollars: 0.5 }),
    ];

    const aggregate = sessionsToCreditsAggregate(sessions, 1000, now);
    expect(aggregate.source).toBe('local-estimate');
    expect(aggregate.creditsUsed).toBe(12);
    expect(aggregate.byModel).toHaveLength(1);
  });

  it('uses per-model session usage when available', () => {
    const now = Date.UTC(2026, 4, 13, 12);
    const session = makeSession({ id: 'multi', lastTurnAt: Date.UTC(2026, 4, 13), model: 'gpt-5', credits: 0, dollars: 0 });
    session.modelUsage = {
      'gpt-5': { inputTokens: 100, outputTokens: 50, cachedTokens: 10, credits: 5, dollars: 0.05, requestCount: 1 },
      'claude-3.7-sonnet': { inputTokens: 200, outputTokens: 100, cachedTokens: 0, credits: 9, dollars: 0.09, requestCount: 1 },
    };

    const aggregate = sessionsToCreditsAggregate([session], 1000, now);
    expect(aggregate.creditsUsed).toBe(14);
    expect(aggregate.byModel.map(model => model.modelId)).toEqual(['claude-3.7-sonnet', 'gpt-5']);
  });
});

function makeSession(input: { id: string; lastTurnAt: number; model: string; credits: number; dollars: number }): ChatSession {
  return {
    id: input.id,
    filePath: `/${input.id}.jsonl`,
    workspaceName: 'repo',
    editor: 'vscode',
    mode: 'agent',
    startedAt: input.lastTurnAt - 60_000,
    lastTurnAt: input.lastTurnAt,
    turnCount: 2,
    models: [input.model],
    tokens: { input: 100, output: 50, cached: 25 },
    estimatedCredits: input.credits,
    estimatedDollars: input.dollars,
    toolCallSummary: {},
    subAgentCount: 0,
  };
}