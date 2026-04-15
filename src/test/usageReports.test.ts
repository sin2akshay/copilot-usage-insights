import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchBillingUsage, fetchUsage } from '../github/usageReports';

// Stub global fetch
const fakeFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', fakeFetch);

// Disable AbortController timeout in tests
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

beforeEach(() => fakeFetch.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('fetchUsage', () => {
  it('parses a normal Pro response', async () => {
    fakeFetch.mockResolvedValue(
      jsonResponse({
        copilot_plan: 'individual',
        quota_reset_date: '2026-02-01T00:00:00Z',
        quota_snapshots: {
          premium_interactions: {
            percent_remaining: 50,
            entitlement: 300,
            unlimited: false,
            overage_permitted: true,
            overage_count: 0,
          },
        },
      }),
    );

    const data = await fetchUsage('tok');
    expect(data.plan).toBe('Pro');
    expect(data.used).toBe(150);
    expect(data.quota).toBe(300);
    expect(data.usedPct).toBe(50);
    expect(data.unlimited).toBe(false);
    expect(data.noData).toBe(false);
    expect(data.overageEnabled).toBe(true);
    expect(data.overageUsed).toBe(0);
  });

  it('handles unlimited plans', async () => {
    fakeFetch.mockResolvedValue(
      jsonResponse({
        copilot_plan: 'business',
        quota_snapshots: {
          premium_interactions: {
            unlimited: true,
          },
        },
      }),
    );

    const data = await fetchUsage('tok');
    expect(data.unlimited).toBe(true);
    expect(data.noData).toBe(false);
    expect(data.plan).toBe('Business');
  });

  it('returns noData when no premium_interactions', async () => {
    fakeFetch.mockResolvedValue(
      jsonResponse({
        copilot_plan: 'free',
        quota_snapshots: {},
      }),
    );

    const data = await fetchUsage('tok');
    expect(data.noData).toBe(true);
    expect(data.plan).toBe('Free');
  });

  it('throws AUTH on 401', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchUsage('tok')).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('throws FORBIDDEN on 403', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 403));
    await expect(fetchUsage('tok')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws RATE_LIMIT on 429', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 429));
    await expect(fetchUsage('tok')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('throws SERVER_ERROR on 500+', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 502));
    await expect(fetchUsage('tok')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('throws NETWORK_ERROR on fetch failure', async () => {
    fakeFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchUsage('tok')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('maps copilot_plan labels correctly', async () => {
    for (const [raw, label] of [
      ['free', 'Free'],
      ['individual', 'Pro'],
      ['individual_pro', 'Pro+'],
      ['business', 'Business'],
      ['enterprise', 'Enterprise'],
    ]) {
      fakeFetch.mockResolvedValue(
        jsonResponse({
          copilot_plan: raw,
          quota_snapshots: {
            premium_interactions: { percent_remaining: 100, entitlement: 100 },
          },
        }),
      );
      const data = await fetchUsage('tok');
      expect(data.plan).toBe(label);
    }
  });
});

describe('fetchBillingUsage', () => {
  it('parses a normal billing response', async () => {
    fakeFetch.mockResolvedValue(
      jsonResponse({
        timePeriod: { year: 2026, month: 4 },
        user: 'testuser',
        usageItems: [
          { model: 'Claude Opus 4.6', pricePerUnit: 0.04, grossQuantity: 33, grossAmount: 1.32, discountQuantity: 33, discountAmount: 1.32, netQuantity: 0, netAmount: 0 },
          { model: 'GPT-5.4', pricePerUnit: 0.04, grossQuantity: 29, grossAmount: 1.16, discountQuantity: 29, discountAmount: 1.16, netQuantity: 0, netAmount: 0 },
        ],
      }),
    );

    const data = await fetchBillingUsage('tok', 'testuser');
    expect(data.year).toBe(2026);
    expect(data.month).toBe(4);
    expect(data.user).toBe('testuser');
    expect(data.items).toHaveLength(2);
    expect(data.items[0].model).toBe('Claude Opus 4.6');
    expect(data.items[0].grossQuantity).toBe(33);
    expect(data.totalGross).toBeCloseTo(2.48, 2);
    expect(data.totalNet).toBe(0);
  });

  it('handles empty usageItems', async () => {
    fakeFetch.mockResolvedValue(
      jsonResponse({
        timePeriod: { year: 2026, month: 4 },
        user: 'testuser',
        usageItems: [],
      }),
    );

    const data = await fetchBillingUsage('tok', 'testuser');
    expect(data.items).toHaveLength(0);
    expect(data.totalGross).toBe(0);
    expect(data.totalNet).toBe(0);
  });

  it('throws AUTH on 401', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 401));
    await expect(fetchBillingUsage('tok', 'testuser')).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('throws FORBIDDEN on 403', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 403));
    await expect(fetchBillingUsage('tok', 'testuser')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws RATE_LIMIT on 429', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 429));
    await expect(fetchBillingUsage('tok', 'testuser')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
  });

  it('throws SERVER_ERROR on 500+', async () => {
    fakeFetch.mockResolvedValue(jsonResponse({}, 502));
    await expect(fetchBillingUsage('tok', 'testuser')).rejects.toMatchObject({ code: 'SERVER_ERROR' });
  });

  it('throws NETWORK_ERROR on fetch failure', async () => {
    fakeFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchBillingUsage('tok', 'testuser')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('rejects invalid login (path traversal)', async () => {
    await expect(fetchBillingUsage('tok', '../evil')).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('handles malformed response (missing usageItems)', async () => {
    fakeFetch.mockResolvedValue(
      jsonResponse({
        timePeriod: { year: 2026, month: 4 },
        user: 'testuser',
      }),
    );

    const data = await fetchBillingUsage('tok', 'testuser');
    expect(data.items).toHaveLength(0);
    expect(data.totalGross).toBe(0);
  });
});