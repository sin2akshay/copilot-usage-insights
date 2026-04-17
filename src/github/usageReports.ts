import type { ApiErrorCode, BillingData, BillingUsageItem, QuotaSnapshot, UsageData } from '../core/models';
import { PLAN_LABELS } from '../core/models';

const COPILOT_INTERNAL_USER_URL = 'https://api.github.com/copilot_internal/user';
const REQUEST_TIMEOUT_MS = 15_000;

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
        'User-Agent': 'copilot-usage-insights',
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

  // Parse individual quota snapshots
  const chatQuota = parseQuotaSnapshot('chat', quotaSnapshots?.chat as Record<string, unknown> | undefined);
  const completionsQuota = parseQuotaSnapshot('completions', quotaSnapshots?.completions as Record<string, unknown> | undefined);
  const premiumQuota = parseQuotaSnapshot('premium_interactions', pi);

  // Parse account-level fields
  const chatEnabled = data.chat_enabled === true;
  const mcpEnabled = data.is_mcp_enabled === true;
  const assignedDate = typeof data.assigned_date === 'string' ? parseDateOrFallbackNull(data.assigned_date) : null;
  const accessType = (data.access_type_sku as string) ?? 'unknown';

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
      chatQuota,
      completionsQuota,
      premiumQuota,
      chatEnabled,
      mcpEnabled,
      assignedDate,
      accessType,
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
    chatQuota,
    completionsQuota,
    premiumQuota,
    chatEnabled,
    mcpEnabled,
    assignedDate,
    accessType,
  };
}

function parseQuotaSnapshot(id: string, raw: Record<string, unknown> | undefined): QuotaSnapshot | null {
  if (!raw) { return null; }
  return {
    id,
    unlimited: !!raw.unlimited,
    percentRemaining: Number(raw.percent_remaining) || 0,
    remaining: (raw.remaining as number) ?? 0,
    entitlement: (raw.entitlement as number) ?? 0,
    overageCount: (raw.overage_count as number) ?? 0,
    overagePermitted: !!raw.overage_permitted,
  };
}

function parseDateOrFallbackNull(raw: string): Date | null {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function parseDateOrFallback(raw: string): Date {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? getNextMonthReset() : d;
}

const BILLING_BASE_URL = 'https://api.github.com/users';
const LOGIN_PATTERN = /^[a-zA-Z0-9-]+$/;

/**
 * Fetch per-model billing usage for the current billing period.
 */
export async function fetchBillingUsage(token: string, login: string): Promise<BillingData> {
  if (!LOGIN_PATTERN.test(login)) {
    throw new ApiError('API_ERROR', 'Invalid login for billing endpoint');
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const url = `${BILLING_BASE_URL}/${login}/settings/billing/premium_request/usage?year=${year}&month=${month}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'copilot-usage-insights',
      },
    });
  } catch (e: unknown) {
    clearTimeout(timeout);
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      isTimeout ? 'Billing request timed out' : 'Billing network error',
    );
  }
  clearTimeout(timeout);

  if (res.status === 401) { throw new ApiError('AUTH', 'Billing: Not signed in (401)'); }
  if (res.status === 403) { throw new ApiError('FORBIDDEN', 'Billing: Forbidden (403) — user scope may be required'); }
  if (res.status === 429) { throw new ApiError('RATE_LIMIT', 'Billing: Rate limited'); }
  if (!res.ok) {
    throw new ApiError(
      res.status >= 500 ? 'SERVER_ERROR' : 'API_ERROR',
      `Billing API error: ${res.status}`,
    );
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError('API_ERROR', 'Invalid JSON from billing API');
  }

  const timePeriod = data.timePeriod as Record<string, unknown> | undefined;
  const user = (data.user as string) ?? login;
  const rawItems = data.usageItems as Array<Record<string, unknown>> | undefined;

  const items: BillingUsageItem[] = (rawItems ?? [])
    .map(item => ({
      model: (item.model as string) ?? 'Unknown',
      pricePerUnit: Number(item.pricePerUnit) || 0,
      grossQuantity: Number(item.grossQuantity) || 0,
      grossAmount: Number(item.grossAmount) || 0,
      discountQuantity: Number(item.discountQuantity) || 0,
      discountAmount: Number(item.discountAmount) || 0,
      netQuantity: Number(item.netQuantity) || 0,
      netAmount: Number(item.netAmount) || 0,
    }))
    .filter(item => item.grossQuantity > 0);

  const totalGross = items.reduce((sum, i) => sum + i.grossAmount, 0);
  const totalNet = items.reduce((sum, i) => sum + i.netAmount, 0);

  return {
    year: Number(timePeriod?.year) || year,
    month: Number(timePeriod?.month) || month,
    user,
    items,
    totalGross,
    totalNet,
  };
}