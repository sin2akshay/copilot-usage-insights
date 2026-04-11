import type { ApiErrorCode, UsageData } from '../core/models';
import { PLAN_LABELS } from '../core/models';

const COPILOT_INTERNAL_USER_URL = 'https://api.github.com/copilot_internal/user';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetch the raw JSON from the copilot_internal/user endpoint for debugging.
 * Returns the raw parsed object without any transformation.
 */
export async function fetchRawJson(token: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(COPILOT_INTERNAL_USER_URL, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'copilot-premium-request-tracker',
      },
    });
    clearTimeout(timeout);
    return { status: res.status, ok: res.ok, body: await res.json() };
  } catch (e: unknown) {
    clearTimeout(timeout);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

class ApiError extends Error {
  code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Fetch Copilot premium-request usage from the internal GitHub API.
 * Uses the same endpoint as the euxx/github-copilot-usage extension.
 */
export async function fetchUsage(token: string): Promise<UsageData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(COPILOT_INTERNAL_USER_URL, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'copilot-premium-request-tracker',
      },
    });
  } catch (e: unknown) {
    clearTimeout(timeout);
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      isTimeout ? 'Request timed out' : 'Network error',
    );
  }
  clearTimeout(timeout);

  if (res.status === 401) {
    throw new ApiError('AUTH', 'Not signed in (401)');
  }
  if (res.status === 403) {
    throw new ApiError('FORBIDDEN', 'Forbidden (403)');
  }
  if (res.status === 429) {
    throw new ApiError('RATE_LIMIT', 'Rate limited');
  }
  if (!res.ok) {
    throw new ApiError(
      res.status >= 500 ? 'SERVER_ERROR' : 'API_ERROR',
      `API error: ${res.status}`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError('API_ERROR', 'Invalid JSON from GitHub API');
  }

  const plan = PLAN_LABELS[data.copilot_plan as string] ?? (data.copilot_plan as string) ?? 'Unknown';

  const quotaSnapshots = data.quota_snapshots as Record<string, unknown> | undefined;
  const pi = quotaSnapshots?.premium_interactions as Record<string, unknown> | undefined;

  if (!pi || (pi.percent_remaining == null)) {
    const unlimited = !!pi?.unlimited;
    return {
      used: 0,
      quota: (pi?.entitlement as number) ?? 0,
      usedPct: 0,
      unlimited,
      noData: !unlimited,
      overageEnabled: !!pi?.overage_permitted,
      overageUsed: (pi?.overage_count as number) ?? 0,
      plan,
      resetDate: data.quota_reset_date
        ? parseDateOrFallback(data.quota_reset_date as string)
        : getNextMonthReset(),
    };
  }

  const entitlement = (pi.entitlement as number) ?? 0;
  const percentRemaining = Number(pi.percent_remaining);
  if (!Number.isFinite(percentRemaining)) {
    throw new ApiError('API_ERROR', 'Invalid percent_remaining from GitHub API');
  }

  const usedPct = Math.max(0, Math.round((100 - percentRemaining) * 10) / 10);
  const used = entitlement > 0
    ? Math.max(0, Math.round((entitlement * (100 - percentRemaining)) / 100))
    : 0;

  const resetDate = data.quota_reset_date
    ? parseDateOrFallback(data.quota_reset_date as string)
    : getNextMonthReset();

  return {
    used,
    quota: entitlement,
    usedPct,
    unlimited: !!pi.unlimited,
    noData: false,
    overageEnabled: !!pi.overage_permitted,
    overageUsed: (pi.overage_count as number) ?? 0,
    plan,
    resetDate,
  };
}

function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function parseDateOrFallback(raw: string): Date {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? getNextMonthReset() : d;
}