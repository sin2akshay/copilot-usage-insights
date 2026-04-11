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

/** Available status bar display modes. */
export type StatusBarMode =
  | 'count'
  | 'percent'
  | 'countPercent'
  | 'remaining'
  | 'segmented'
  | 'blocks'
  | 'thinBlocks'
  | 'dots'
  | 'circles'
  | 'hybrid';

/** Usage data parsed from the copilot_internal/user endpoint. */
export interface UsageData {
  used: number;
  quota: number;
  usedPct: number;
  unlimited: boolean;
  noData: boolean;
  overageEnabled: boolean;
  overageUsed: number;
  plan: string;
  resetDate: Date;
}

/** Extension configuration snapshot. */
export interface ExtensionConfig {
  refreshIntervalMinutes: number;
  thresholdEnabled: boolean;
  thresholdWarning: number;
  thresholdCritical: number;
  statusBarMode: StatusBarMode;
  segmentedBarWidth: number;
}

/** Detail view model passed to the webview panel. */
export interface DetailViewModel {
  data: UsageData | null;
  lastUpdatedAt: string | null;
  isOffline: boolean;
  login: string | null;
}