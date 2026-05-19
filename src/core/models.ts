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

/** User setting for which billing model the UI should show. */
export type BillingViewSetting = 'auto' | 'premium-requests' | 'ai-credits';

/** Resolved billing view used by renderers. */
export type BillingView = 'premium-requests' | 'ai-credits';

/** Status bar format when AI Credits mode is active. */
export type StatusBarCreditsFormat = 'percent' | 'used-over-allowance' | 'dollars' | 'credits';

export interface PlanInfo {
  type: 'free' | 'pro' | 'pro-plus' | 'business' | 'enterprise' | 'unknown';
  billingCycle: 'monthly' | 'annual' | 'unknown';
  creditsAllowance: number;
}

export interface CreditsAggregate {
  source: 'github-api' | 'local-estimate';
  fetchedAt: number;
  cycleStart: string;
  cycleEnd: string;
  creditsUsed: number;
  creditsAllowance: number;
  dollarsSpent: number;
  byModel: ModelBreakdown[];
}

export interface ModelBreakdown {
  modelId: string;
  displayName: string;
  credits: number;
  dollars: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  requestCount?: number;
}

export interface ChatSession {
  id: string;
  filePath: string;
  title?: string;
  workspaceName: string;
  editor: 'vscode' | 'vscode-insiders';
  mode: 'ask' | 'edit' | 'agent' | 'unknown';
  startedAt: number;
  lastTurnAt: number;
  turnCount: number;
  models: string[];
  tokens: {
    input: number;
    output: number;
    cached: number;
  };
  modelUsage?: Record<string, SessionModelUsage>;
  estimatedCredits: number;
  estimatedDollars: number;
  toolCallSummary: Record<string, number>;
  subAgentCount: number;
}

export interface SessionModelUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  dollars: number;
  requestCount: number;
}

export interface TopSessionSummary {
  workspaceShort: string;
  lastTurnAt: number;
  estimatedCredits: number;
}

export interface ModelPricing {
  modelId: string;
  displayName: string;
  inputPerM: number;
  outputPerM: number;
  cachedPerM: number;
  /** Optional cache-write rate (Anthropic models charge this separately from cached input reads). */
  cacheWritePerM?: number;
}

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
  creditsAllowance?: number;
}

/** Extension configuration snapshot. */
export interface ExtensionConfig {
  refreshIntervalMinutes: number;
  billingView: BillingViewSetting;
  thresholdEnabled: boolean;
  thresholdWarning: number;
  thresholdCritical: number;
  statusBarTextMode: StatusBarTextMode;
  statusBarGraphicMode: StatusBarGraphicMode;
  statusBarTextPosition: StatusBarTextPosition;
  statusBarCreditsFormat: StatusBarCreditsFormat;
  segmentedBarWidth: number;
  showBillingDetails: boolean;
  showBillingRequestBreakdown: boolean;
  showCostInStatusBar: boolean;
  localLogsEnabled: boolean;
  localLogsIncludeInsiders: boolean;
  localLogsLookbackDays: number;
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
  activeBillingView: BillingView;
  isCreditsPreview: boolean;
  credits: CreditsAggregate | null;
  sessions: ChatSession[];
  agentDebugLogEnabled: boolean;
  showEstimateNotice: boolean;
  billing: BillingData | null;
}