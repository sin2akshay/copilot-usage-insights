import { workspace } from 'vscode';

import type { BillingView, BillingViewSetting, PlanInfo, UsageData } from '../core/models';

const CONFIG_SECTION = 'copilotUsageInsights';
export const JUNE_1_2026_UTC = Date.parse('2026-06-01T00:00:00Z');

export function resolveView(plan: PlanInfo, setting?: BillingViewSetting, nowMs = Date.now()): BillingView {
  const configured = setting ?? workspace
    .getConfiguration(CONFIG_SECTION)
    .get<BillingViewSetting>('billingView', 'auto');

  if (configured === 'premium-requests') { return 'premium-requests'; }
  if (configured === 'ai-credits') { return 'ai-credits'; }

  if (nowMs < JUNE_1_2026_UTC) { return 'premium-requests'; }
  if (plan.billingCycle === 'annual') { return 'premium-requests'; }
  if (plan.billingCycle === 'monthly') { return 'ai-credits'; }
  return 'premium-requests';
}

export function isPreviewMode(nowMs = Date.now()): boolean {
  return nowMs < JUNE_1_2026_UTC;
}

export function planInfoFromUsage(data: UsageData | null): PlanInfo {
  if (!data) {
    return { type: 'unknown', billingCycle: 'unknown', creditsAllowance: 0 };
  }

  const type = planTypeFromLabel(data.plan);
  return {
    type,
    billingCycle: billingCycleFromAccessType(data.accessType),
    creditsAllowance: data.creditsAllowance ?? creditsAllowanceForPlan(type),
  };
}

export function creditsAllowanceForPlan(type: PlanInfo['type']): number {
  switch (type) {
    case 'free': return 100;
    case 'pro': return 1000;
    case 'pro-plus': return 3900;
    case 'business': return 1900;
    case 'enterprise': return 3900;
    case 'unknown': default: return 0;
  }
}

function planTypeFromLabel(plan: string): PlanInfo['type'] {
  const normalized = plan.trim().toLowerCase();
  if (normalized === 'free') { return 'free'; }
  if (normalized === 'pro') { return 'pro'; }
  if (normalized === 'pro+' || normalized === 'pro plus' || normalized === 'individual_pro') { return 'pro-plus'; }
  if (normalized === 'business') { return 'business'; }
  if (normalized === 'enterprise') { return 'enterprise'; }
  return 'unknown';
}

function billingCycleFromAccessType(accessType: string): PlanInfo['billingCycle'] {
  const normalized = accessType.toLowerCase();
  if (normalized.includes('annual') || normalized.includes('yearly') || normalized.includes('year')) {
    return 'annual';
  }
  if (normalized.includes('monthly') || normalized.includes('month')) {
    return 'monthly';
  }
  return 'unknown';
}