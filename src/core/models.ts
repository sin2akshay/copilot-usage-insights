/** Error codes returned by API calls. */
export type ApiErrorCode =
  | 'AUTH'
  | 'FORBIDDEN'
  | 'RATE_LIMIT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'API_ERROR';

/** Plan name map from API raw values to display labels. */
export const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  individual: 'Pro',
  individual_pro: 'Pro+',
  business: 'Business',
  enterprise: 'Enterprise',
};

export function isManagedPlan(plan: string): boolean {
  return plan === 'Business' || plan === 'Enterprise';
}

/** Text portion of the status bar display. */
export type StatusBarTextMode = 'none' | 'count' | 'percent' | 'countPercent' | 'remaining' | 'billedOnly';

/** Graphic/visual portion of the status bar display. */
export type StatusBarGraphicMode = 'none' | 'segmented' | 'blocks' | 'thinBlocks' | 'dots' | 'circles' | 'braille' | 'rectangles';

/** Whether the text label appears to the left or right of the graphic. */
export type StatusBarTextPosition = 'left' | 'right';

/** Snapshot of a single quota category from the API. */
export interface QuotaSnapshot {
  id: string;
  unlimited: boolean;
  percentRemaining: number;
  remaining: number;
  entitlement: number;
  overageCount: number;
  overagePermitted: boolean;
}

/** Usage data parsed from the copilot_internal/user endpoint. */
export interface UsageData {
  used: number;
  remaining: number;
  quota: number;
  usedPct: number;
  unlimited: boolean;
  noData: boolean;
  overageEnabled: boolean;
  overageUsed: number;
  plan: string;
  isManagedPlan: boolean;
  resetDate: Date;
  chatQuota: QuotaSnapshot | null;
  completionsQuota: QuotaSnapshot | null;
  premiumQuota: QuotaSnapshot | null;
  chatEnabled: boolean;
  mcpEnabled: boolean;
  assignedDate: Date | null;
  accessType: string;
}

/** Extension configuration snapshot. */
export interface ExtensionConfig {
  refreshIntervalMinutes: number;
  thresholdEnabled: boolean;
  thresholdWarning: number;
  thresholdCritical: number;
  statusBarTextMode: StatusBarTextMode;
  statusBarGraphicMode: StatusBarGraphicMode;
  statusBarTextPosition: StatusBarTextPosition;
  segmentedBarWidth: number;
  showBillingDetails: boolean;
  showBillingRequestBreakdown: boolean;
  showCostInStatusBar: boolean;
}

/** A single model's usage from the billing endpoint. */
export interface BillingUsageItem {
  model: string;
  pricePerUnit: number;
  grossQuantity: number;
  grossAmount: number;
  discountQuantity: number;
  discountAmount: number;
  netQuantity: number;
  netAmount: number;
}

/** Billing data from the premium request usage endpoint. */
export interface BillingData {
  year: number;
  month: number;
  user: string;
  items: BillingUsageItem[];
  totalGross: number;
  totalNet: number;
}

/** Detail view model passed to the webview panel. */
export interface DetailViewModel {
  data: UsageData | null;
  lastUpdatedAt: string | null;
  isOffline: boolean;
  login: string | null;
  config: ExtensionConfig;
  billing: BillingData | null;
}