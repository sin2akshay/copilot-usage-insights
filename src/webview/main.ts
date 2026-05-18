declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  setState(value: unknown): void;
  getState(): unknown;
};

interface QuotaSnapshotSerialized {
  id: string;
  unlimited: boolean;
  percentRemaining: number;
  remaining: number;
  entitlement: number;
  overageCount: number;
  overagePermitted: boolean;
}

interface UsageDataSerialized {
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
  resetDate: string;
  chatQuota: QuotaSnapshotSerialized | null;
  completionsQuota: QuotaSnapshotSerialized | null;
  premiumQuota: QuotaSnapshotSerialized | null;
  chatEnabled: boolean;
  mcpEnabled: boolean;
  assignedDate: string | null;
  accessType: string;
}

interface ConfigSerialized {
  refreshIntervalMinutes: number;
  billingView: 'auto' | 'premium-requests' | 'ai-credits';
  thresholdEnabled: boolean;
  thresholdWarning: number;
  thresholdCritical: number;
  statusBarTextMode: string;
  statusBarGraphicMode: string;
  statusBarTextPosition: string;
  statusBarCreditsFormat: 'percent' | 'used-over-allowance' | 'dollars' | 'credits';
  segmentedBarWidth: number;
  showBillingDetails: boolean;
  showBillingRequestBreakdown: boolean;
  showCostInStatusBar: boolean;
  localLogsEnabled: boolean;
  localLogsIncludeInsiders: boolean;
  localLogsLookbackDays: number;
}

interface BillingUsageItemSerialized {
  model: string;
  pricePerUnit: number;
  grossQuantity: number;
  grossAmount: number;
  discountQuantity: number;
  discountAmount: number;
  netQuantity: number;
  netAmount: number;
}

interface BillingDataSerialized {
  year: number;
  month: number;
  user: string;
  items: BillingUsageItemSerialized[];
  totalGross: number;
  totalNet: number;
}

interface ModelBreakdownSerialized {
  modelId: string;
  displayName: string;
  credits: number;
  dollars: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  requestCount?: number;
}

interface CreditsAggregateSerialized {
  source: 'github-api' | 'local-estimate';
  fetchedAt: number;
  cycleStart: string;
  cycleEnd: string;
  creditsUsed: number;
  creditsAllowance: number;
  dollarsSpent: number;
  byModel: ModelBreakdownSerialized[];
}

interface ChatSessionSerialized {
  id: string;
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
  modelUsage?: Record<string, SessionModelUsageSerialized>;
  estimatedCredits: number;
  estimatedDollars: number;
  toolCallSummary: Record<string, number>;
  subAgentCount: number;
  sourceAvailable?: boolean;
}

interface SessionModelUsageSerialized {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  dollars: number;
  requestCount: number;
}

interface SessionModelRow {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  credits: number;
  dollars: number;
  requestCount: number;
}

interface DetailViewModelSerialized {
  data: UsageDataSerialized | null;
  lastUpdatedAt: string | null;
  isOffline: boolean;
  login: string | null;
  config: ConfigSerialized;
  activeBillingView: 'premium-requests' | 'ai-credits';
  isCreditsPreview: boolean;
  credits: CreditsAggregateSerialized | null;
  sessions: ChatSessionSerialized[];
  agentDebugLogEnabled: boolean;
  billing: BillingDataSerialized | null;
}

const vscode = acquireVsCodeApi();
const root = document.getElementById('app');
let currentModel: DetailViewModelSerialized | null = null;
let selectedCreditsMonth: string | null = null;

const GAUGE_RADIUS = 56;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS; // ~351.86

const STATUS_BAR_TEXT_MODES = [
  { value: 'none',         label: 'None',        desc: '—' },
  { value: 'count',        label: 'Count',       desc: '150/300' },
  { value: 'percent',      label: 'Percentage',  desc: '50%' },
  { value: 'countPercent', label: 'Count + %',   desc: '150/300 (50%)' },
  { value: 'remaining',    label: 'Remaining',   desc: '150 left' },
  { value: 'billedOnly',   label: 'Billed Only', desc: '+$0.00' },
];

const STATUS_BAR_GRAPHIC_MODES = [
  { value: 'none',       label: 'None',        desc: '—' },
  { value: 'segmented',  label: 'Segments',    desc: '[■■□□]' },
  { value: 'blocks',     label: 'Blocks',      desc: '████░░' },
  { value: 'thinBlocks', label: 'Thin Blocks', desc: '▰▰▱▱' },
  { value: 'dots',       label: 'Dots',        desc: '••··' },
  { value: 'circles',    label: 'Circles',     desc: '●●○○' },
  { value: 'braille',    label: 'Braille',     desc: '⣿⣿⣀⣀' },
  { value: 'rectangles', label: 'Rectangles',  desc: '▮▮▯▯' },
];

const MODEL_COLORS = [
  'hsl(210, 70%, 55%)',
  'hsl(150, 60%, 45%)',
  'hsl(35, 85%, 55%)',
  'hsl(280, 55%, 62%)',
  'hsl(0, 65%, 60%)',
  'hsl(190, 70%, 48%)',
];

const modelColorCache = new Map<string, string>();
let modelColorTopId: string | null = null;

function modelColor(modelId: string, asTopModel?: true): string {
  if (asTopModel) { modelColorTopId = modelId; }
  if (modelId === modelColorTopId) { return MODEL_COLORS[0]; }
  if (modelColorCache.has(modelId)) { return modelColorCache.get(modelId)!; }
  // FNV-1a hash; skip index 0 (reserved for top-credit model)
  let h = 2166136261;
  for (let i = 0; i < modelId.length; i++) { h = Math.imul(h ^ modelId.charCodeAt(i), 16777619) >>> 0; }
  const color = MODEL_COLORS[1 + (h % (MODEL_COLORS.length - 1))];
  modelColorCache.set(modelId, color);
  return color;
}

window.addEventListener('message', event => {
  const message = event.data as { type?: string; value?: DetailViewModelSerialized };
  if (message.type === 'state' && message.value) {
    currentModel = message.value;
    render(message.value);
    vscode.setState(message.value);
  }
});

const savedState = vscode.getState() as DetailViewModelSerialized | undefined;
if (savedState) {
  currentModel = savedState;
  render(savedState);
}

function render(model: DetailViewModelSerialized): void {
  if (!root) { return; }

  const { data, login, config, isOffline, lastUpdatedAt } = model;
  const isConnected = !!login;

  if (!isConnected || !data) {
    renderSignIn();
    return;
  }

  const resetDate = data.resetDate ? new Date(data.resetDate) : null;
  const now = new Date();
  const daysLeft = resetDate
    ? Math.max(0, Math.ceil((resetDate.getTime() - now.getTime()) / 86_400_000))
    : null;
  const resetStr = resetDate
    ? resetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const updatedStr = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  const assignedStr = data.assignedDate
    ? new Date(data.assignedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const githubSettingsUrl = data.isManagedPlan
    ? 'https://github.com/settings/copilot/features'
    : 'https://github.com/settings/billing/premium_requests_usage';

  if (model.activeBillingView === 'ai-credits') {
    root.innerHTML = `
      <main class="dashboard">
        ${renderHeader(data, login, isOffline, model)}
        ${renderCreditsView(model, updatedStr)}
        <footer class="footer">
          <div class="footer-left">
            <span class="muted">Updated ${esc(updatedStr)}</span>
            <span class="dot">·</span>
            <a href="https://github.com/settings/billing/usage">View on GitHub</a>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="disconnect">Disconnect</button>
        </footer>
      </main>
    `;
    bindActions();
    bindSettings();
    bindBillingViewToggle();
    bindCreditsInteractions();
    return;
  }

  // Pacing calculation
  const remaining = data.noData || data.unlimited ? null : data.remaining;
  const pacingPerDay = (remaining !== null && daysLeft !== null && daysLeft > 0)
    ? Math.floor(remaining / daysLeft)
    : null;

  // Gauge values
  let gaugePercent = 0;
  let gaugeLabel = '—';
  let gaugeSubLabel = '';
  let gaugeColorClass = 'ok';

  if (data.noData) {
    gaugeLabel = '—';
    gaugeSubLabel = 'No quota data';
  } else if (data.unlimited) {
    gaugePercent = 100;
    gaugeLabel = '∞';
    gaugeSubLabel = 'Unlimited';
  } else {
    gaugePercent = data.usedPct;
    gaugeLabel = `${formatPercent(data.usedPct)}%`;
    gaugeSubLabel = `${data.used} of ${data.quota} used`;
    if (config.thresholdEnabled) {
      if (data.usedPct >= config.thresholdCritical) { gaugeColorClass = 'crit'; }
      else if (data.usedPct >= config.thresholdWarning) { gaugeColorClass = 'warn'; }
    }
  }

  const gaugeArc = data.unlimited
    ? GAUGE_CIRCUMFERENCE
    : GAUGE_CIRCUMFERENCE * Math.min(gaugePercent, 100) / 100;
  const gaugeGap = GAUGE_CIRCUMFERENCE - gaugeArc;

  const textModeOptions = STATUS_BAR_TEXT_MODES.map(m =>
    `<option value="${m.value}" ${m.value === config.statusBarTextMode ? 'selected' : ''}>${esc(m.label)} — ${esc(m.desc)}</option>`,
  ).join('');

  const graphicModeOptions = STATUS_BAR_GRAPHIC_MODES.map(m =>
    `<option value="${m.value}" ${m.value === config.statusBarGraphicMode ? 'selected' : ''}>${esc(m.label)} — ${esc(m.desc)}</option>`,
  ).join('');

  root.innerHTML = `
    <main class="dashboard">
      ${renderHeader(data, login, isOffline, model)}

      <section class="hero">
        <div class="gauge-container">
          <svg class="gauge" viewBox="0 0 140 140">
            <circle class="gauge-track" cx="70" cy="70" r="${GAUGE_RADIUS}" />
            <circle
              class="gauge-arc ${gaugeColorClass}"
              cx="70" cy="70" r="${GAUGE_RADIUS}"
              stroke-dasharray="${gaugeArc} ${gaugeGap}"
            />
            <text class="gauge-value" x="70" y="${data.unlimited ? 70 : 62}" dominant-baseline="central" text-anchor="middle">
              ${esc(gaugeLabel)}
            </text>
            ${!data.unlimited && !data.noData ? `<text class="gauge-sub" x="70" y="86" text-anchor="middle">${esc(gaugeSubLabel)}</text>` : ''}
            ${data.unlimited ? `<text class="gauge-sub" x="70" y="88" text-anchor="middle">Unlimited</text>` : ''}
          </svg>
        </div>
        <div class="key-stats">
          <div class="stat-item highlight">
            <span class="stat-value mono">${daysLeft !== null ? daysLeft : '—'}</span>
            <span class="stat-label">Days Until Reset</span>
          </div>
          <div class="stat-item">
            <span class="stat-value mono">${data.noData ? '—' : data.unlimited ? '∞' : String(data.remaining)}</span>
            <span class="stat-label">Remaining</span>
          </div>
          <div class="stat-item${pacingPerDay !== null && pacingPerDay <= 5 ? ' warn-bg' : ''}">
            <span class="stat-value mono">${pacingPerDay !== null ? `~${pacingPerDay}/day` : '—'}</span>
            <span class="stat-label">Daily Budget</span>
          </div>
          ${!data.isManagedPlan && data.overageEnabled && data.overageUsed > 0 ? `
          <div class="stat-item warn-bg">
            <span class="stat-value mono">${data.overageUsed}</span>
            <span class="stat-label">Overage Used</span>
          </div>` : `
          <div class="stat-item">
            <span class="stat-value mono">${esc(resetStr)}</span>
            <span class="stat-label">Reset Date</span>
          </div>`}
        </div>
      </section>

      <section class="quota-row">
        ${renderQuotaCard('Chat', data.chatQuota, 'M8 1C4.134 1 1 4.134 1 8V13.5L4.5 10H12C12.8284 10 13.5 9.3284 13.5 8.5V3.5C13.5 2.1193 12.3807 1 11 1H8ZM5 5H11V6H5V5ZM5 7.5H9V8.5H5V7.5Z')}
        ${renderQuotaCard('Completions', data.completionsQuota, 'M1.5 1H6.5L8 2.5V5H7V3H6V5H5V3.5L3.5 2H2V13H5V14H1.5L1 13.5V1.5L1.5 1ZM8 6H14.5L15 6.5V14.5L14.5 15H8.5L8 14.5V6ZM9 7V14H14V7H9ZM10 9H13V10H10V9ZM10 11H13V12H10V11Z')}
        ${renderQuotaCard('Premium', data.premiumQuota, 'M7.5 0.5L9.09 4.63L13.47 4.91L10.06 7.82L11.11 12.09L7.5 9.77L3.89 12.09L4.94 7.82L1.53 4.91L5.91 4.63L7.5 0.5Z')}
      </section>

      <section class="card">
        <h2 class="card-title">Account</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Plan</span>
            <span class="info-value">${esc(data.plan)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Chat</span>
            <span class="info-value">${data.chatEnabled ? '<span class="indicator on"></span> Enabled' : '<span class="indicator off"></span> Disabled'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">MCP</span>
            <span class="info-value">${data.mcpEnabled ? '<span class="indicator on"></span> Enabled' : '<span class="indicator off"></span> Disabled'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Member Since</span>
            <span class="info-value">${esc(assignedStr)}</span>
          </div>
        </div>
      </section>

      ${renderBillingSection(model.billing, config, data)}
      ${renderRequestBreakdownSection(model.billing, config, data)}

      <section class="card">
        <h2 class="card-title">Status Bar Settings</h2>
        <div class="settings-grid">
          <div class="setting-row">
            <label for="setting-text-mode">Text Display</label>
            <select id="setting-text-mode" data-setting="statusBarTextMode">
              ${textModeOptions}
            </select>
          </div>
          <div class="setting-row">
            <label for="setting-graphic-mode">Graphic Display</label>
            <select id="setting-graphic-mode" data-setting="statusBarGraphicMode">
              ${graphicModeOptions}
            </select>
          </div>
          <div class="setting-row">
            <label>Text Position</label>
            <div class="btn-group" data-setting="statusBarTextPosition">
              <button type="button" class="btn-group-opt ${config.statusBarTextPosition === 'left' ? 'active' : ''}" data-value="left">
                ← Left
              </button>
              <button type="button" class="btn-group-opt ${config.statusBarTextPosition === 'right' ? 'active' : ''}" data-value="right">
                Right →
              </button>
            </div>
          </div>
          <div class="setting-row">
            <label for="setting-refresh">Refresh Interval</label>
            <div class="input-suffix">
              <input type="number" id="setting-refresh" data-setting="refreshIntervalMinutes" min="1" max="60" value="${config.refreshIntervalMinutes}" />
              <span class="suffix">min</span>
            </div>
          </div>
          <div class="setting-row">
            <label for="setting-barwidth">Bar Width</label>
            <div class="input-suffix">
              <input type="number" id="setting-barwidth" data-setting="segmentedBarWidth" min="4" max="16" value="${config.segmentedBarWidth}" />
              <span class="suffix">seg</span>
            </div>
          </div>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-grid">
          <div class="setting-row">
            <label for="setting-threshold">Color Thresholds</label>
            <label class="toggle">
              <input type="checkbox" id="setting-threshold" data-setting="threshold.enabled" ${config.thresholdEnabled ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="setting-row ${!config.thresholdEnabled ? 'disabled' : ''}">
            <label for="setting-warn">Warning at</label>
            <div class="input-suffix">
              <input type="number" id="setting-warn" data-setting="threshold.warning" min="0" max="100" value="${config.thresholdWarning}" ${!config.thresholdEnabled ? 'disabled' : ''} />
              <span class="suffix">%</span>
            </div>
          </div>
          <div class="setting-row ${!config.thresholdEnabled ? 'disabled' : ''}">
            <label for="setting-crit">Critical at</label>
            <div class="input-suffix">
              <input type="number" id="setting-crit" data-setting="threshold.critical" min="0" max="100" value="${config.thresholdCritical}" ${!config.thresholdEnabled ? 'disabled' : ''} />
              <span class="suffix">%</span>
            </div>
          </div>
        </div>
        <div class="settings-divider"></div>
        ${data.isManagedPlan ? renderManagedPlanBillingMessage() : `
        <div class="settings-grid">
          <div class="setting-row">
            <label for="setting-billing">Billing Details</label>
            <label class="toggle">
              <input type="checkbox" id="setting-billing" data-setting="showBillingDetails" ${config.showBillingDetails ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="setting-row">
            <label for="setting-billing-models">Show Requests by Model</label>
            <label class="toggle">
              <input type="checkbox" id="setting-billing-models" data-setting="showBillingRequestBreakdown" ${config.showBillingRequestBreakdown ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="setting-row">
            <label for="setting-cost-statusbar">Show Billed Cost in Status Bar</label>
            <label class="toggle">
              <input type="checkbox" id="setting-cost-statusbar" data-setting="showCostInStatusBar" ${config.showCostInStatusBar ? 'checked' : ''} />
              <span class="toggle-track"></span>
            </label>
          </div>
        </div>`}
        ${renderManagedPlanEstimateDisclaimer(config, data)}
      </section>

      <footer class="footer">
        <div class="footer-left">
          <span class="muted">Updated ${esc(updatedStr)}</span>
          <span class="dot">·</span>
          ${pacingPerDay !== null ? `<span class="muted">~${pacingPerDay} req/day to stay on pace</span><span class="dot">·</span>` : ''}
          <a href="${githubSettingsUrl}">View on GitHub</a>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="disconnect">Disconnect</button>
      </footer>
    </main>
  `;

  bindActions();
  bindSettings();
  bindBillingViewToggle();
}

function renderSignIn(): void {
  if (!root) { return; }
  root.innerHTML = `
    <main class="dashboard">
      <div class="sign-in-view">
        <div class="sign-in-icon">
          <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor" opacity="0.25">
            <path d="M7.5 0.5L9.09 4.63L13.47 4.91L10.06 7.82L11.11 12.09L7.5 9.77L3.89 12.09L4.94 7.82L1.53 4.91L5.91 4.63L7.5 0.5Z"/>
          </svg>
        </div>
        <h1 class="sign-in-title">Copilot Usage Insights</h1>
        <p class="muted">Use your GitHub account in VS Code to track premium request usage. VS Code may ask you to authorize this extension or sign in first.</p>
        <button class="btn btn-primary" data-action="signIn">Continue with GitHub</button>
      </div>
    </main>
  `;
  bindActions();
}

function renderHeader(
  data: UsageDataSerialized,
  login: string,
  isOffline: boolean,
  model: DetailViewModelSerialized,
): string {
  let monthPicker = '';
  if (model.activeBillingView === 'ai-credits') {
    const monthOptions = getCreditsMonthOptions(model.credits, model.sessions);
    const selectedMonth = normalizeSelectedCreditsMonth(monthOptions);
    monthPicker = renderCreditsMonthPicker(monthOptions, selectedMonth);
  }
  return `
    <header class="header">
      <div class="header-left">
        <h1 class="title">Copilot Usage Insights</h1>
        <p class="subtitle">
          <span class="tag">${esc(data.plan)}</span>
          <span class="dot">·</span>
          <span>${esc(login)}</span>
          ${isOffline ? '<span class="dot">·</span><span class="offline-badge">Offline</span>' : ''}
          ${model.isCreditsPreview ? '<span class="dot">·</span><span class="preview-badge">Credits preview</span>' : ''}
        </p>
        ${renderBillingViewToggle(model)}
      </div>
      <div class="header-actions">
        ${monthPicker}
        <button class="btn btn-icon" data-action="refresh" title="Refresh">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094a4.373 4.373 0 0 1 .554 1.9l.009.24A4.382 4.382 0 0 1 7.913 12.1a4.382 4.382 0 0 1-4.378-4.378A4.382 4.382 0 0 1 7.913 3.338c.554 0 1.085.103 1.571.291l.088.04V2.2l-.208-.065A5.557 5.557 0 0 0 7.913 1.9 5.536 5.536 0 0 0 1.784 7.722a6.129 6.129 0 0 0 6.129 6.128c3.382 0 6.128-2.746 6.128-6.128a6.09 6.09 0 0 0-.995-3.367l-.006-.01z"/><path d="M10.5 1.5L8.25 5h4.5L10.5 1.5z"/></svg>
        </button>
      </div>
    </header>
  `;
}

function renderBillingViewToggle(model: DetailViewModelSerialized): string {
  const active = model.config.billingView;
  const resolved = model.activeBillingView;
  const options = [
    { value: 'auto', label: 'Auto' },
    { value: 'premium-requests', label: 'Premium Requests' },
    { value: 'ai-credits', label: 'AI Credits' },
  ];

  return `
    <div class="view-toggle" role="group" aria-label="Billing view">
      ${options.map(option => `
        <button
          type="button"
          class="view-toggle-option ${active === option.value ? 'active' : ''} ${option.value === resolved ? 'resolved' : ''}"
          data-billing-view="${option.value}"
          aria-pressed="${active === option.value ? 'true' : 'false'}">
          ${esc(option.label)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderCreditsView(model: DetailViewModelSerialized, updatedStr: string): string {
  const monthOptions = getCreditsMonthOptions(model.credits, model.sessions);
  const selectedMonth = normalizeSelectedCreditsMonth(monthOptions);
  const currentCycleMonth = model.credits ? monthKeyFromIso(model.credits.cycleStart) : monthKeyFromTimestamp(Date.now());
  const monthSessions = filterSessionsByMonth(model.sessions, selectedMonth);
  const credits = model.credits && selectedMonth === currentCycleMonth
    ? model.credits
    : aggregateSessionsForMonth(monthSessions, selectedMonth, model.credits?.creditsAllowance ?? 0);

  const now = Date.now();
  const cycleStartMs = credits ? new Date(credits.cycleStart).getTime() : monthRangeFromKey(selectedMonth).startMs;
  const cycleEndMs = credits ? new Date(credits.cycleEnd).getTime() : monthRangeFromKey(selectedMonth).endMs;
  const daysElapsed = Math.max(1, Math.ceil((now - cycleStartMs) / 86_400_000));
  const daysLeft = Math.max(0, Math.ceil((cycleEndMs - now) / 86_400_000));

  // Seed model color resolver with top-credit model
  const topModelId = credits?.byModel[0]?.modelId;
  if (topModelId) { modelColor(topModelId, true); }

  return `
    ${renderStatusHero(credits, monthSessions, updatedStr, daysLeft)}
    ${renderBurnChart(monthSessions, credits, selectedMonth)}
    <div class="two-col">
      ${renderModelMiniCard(credits, monthSessions)}
      ${renderPaceCard(credits, daysLeft, daysElapsed)}
    </div>
    ${renderSessionTable(model, monthSessions)}
    ${renderCreditsSettings(model.config)}
  `;
}

function renderStatusHero(
  credits: CreditsAggregateSerialized | null,
  monthSessions: ChatSessionSerialized[],
  updatedStr: string,
  daysLeft: number,
): string {
  if (!credits) {
    return `
      <section class="card status-hero">
        <div class="hero-meta">
          <span class="card-title">AI Credits</span>
          <span class="hero-source muted">updated ${esc(updatedStr)}</span>
        </div>
        <div class="credits-empty">
          <strong>Credits data not yet available</strong>
          <p class="muted">Grant billing access for GitHub's official aggregate, or keep local logs enabled for a session-based estimate.</p>
          <button class="btn btn-primary btn-sm" data-action="grantBillingAccess">Grant Access</button>
        </div>
      </section>
    `;
  }

  const pct = credits.creditsAllowance > 0
    ? Math.round((credits.creditsUsed / credits.creditsAllowance) * 100)
    : 0;
  const isOver = credits.creditsAllowance > 0 && credits.creditsUsed > credits.creditsAllowance;
  const tokenTotal = getCreditsTokenTotal(credits) || getSessionTokenTotal(monthSessions);
  const sourceText = credits.source === 'github-api' ? 'Official' : 'Local estimate';
  const overageCredits = isOver ? credits.creditsUsed - credits.creditsAllowance : 0;

  let statusClass = 'hero-status-ok';
  let statusLabel = '✓ On track';
  if (isOver) {
    statusClass = 'hero-status-over';
    statusLabel = '⚠ Over budget';
  } else if (pct >= 80) {
    statusClass = 'hero-status-warn';
    statusLabel = '⚠ Approaching limit';
  }

  return `
    <section class="card status-hero ${isOver ? 'status-hero-over' : ''}">
      <div class="hero-meta">
        <span class="card-title">AI Credits — ${esc(formatCycleRange(credits.cycleStart, credits.cycleEnd))}</span>
        <span class="hero-source muted">${esc(sourceText)} · updated ${esc(updatedStr)}</span>
      </div>
      <div class="hero-body">
        <div class="hero-left">
          <div class="hero-status-badge ${statusClass}">${statusLabel}</div>
          <div class="hero-value mono ${isOver ? 'crit-text' : pct >= 80 ? 'warn-text' : ''}">${formatCreditsValue(credits.creditsUsed)} <span class="hero-unit">AI Credits Used</span></div>
          ${credits.creditsAllowance > 0 ? `<div class="hero-allowance muted">of ${formatCreditsValue(credits.creditsAllowance)} AIC allowance</div>` : ''}
          <div class="hero-bar-wrap">
            <div class="hero-bar">
              <div class="hero-bar-fill ${isOver ? 'hero-bar-over' : ''}" style="width:${Math.min(100, pct)}%"></div>
            </div>
            <span class="hero-pct mono ${isOver ? 'crit-text' : ''}">${pct}%</span>
          </div>
          ${isOver ? `<div class="hero-overage crit-text">+${formatCreditsValue(overageCredits)} AIC over · +$${(overageCredits / 100).toFixed(2)} est.</div>` : ''}
        </div>
        <div class="hero-right">
          <div class="hero-stat">
            <span class="hero-stat-value mono">$${credits.dollarsSpent.toFixed(2)}</span>
            <span class="hero-stat-label">Est. Spent</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value mono">${tokenTotal > 0 ? formatNumber(tokenTotal) : '—'}</span>
            <span class="hero-stat-label">Tokens</span>
          </div>
          <div class="hero-stat">
            <span class="hero-stat-value mono">${daysLeft}</span>
            <span class="hero-stat-label">Days Left</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderCreditsMonthPicker(monthOptions: Array<{ value: string; label: string }>, selectedMonth: string): string {
  if (monthOptions.length <= 1) { return ''; }
  return `
    <label class="month-picker">
      <span>Month</span>
      <select id="credits-month" aria-label="AI Credits month">
        ${monthOptions.map(option => `<option value="${esc(option.value)}" ${option.value === selectedMonth ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderBurnChart(sessions: ChatSessionSerialized[], credits: CreditsAggregateSerialized | null, selectedMonth: string): string {
  const { startMs, endMs } = monthRangeFromKey(selectedMonth);
  const daysInMonth = Math.round((endMs - startMs) / 86_400_000);
  const dailyTotals = new Array<number>(daysInMonth).fill(0);
  for (const s of sessions) {
    const idx = Math.floor((s.lastTurnAt - startMs) / 86_400_000);
    if (idx >= 0 && idx < daysInMonth) { dailyTotals[idx] += s.estimatedCredits; }
  }
  if (!dailyTotals.some(v => v > 0)) { return ''; }

  const allowance = credits?.creditsAllowance ?? 0;

  // Build cumulative per-day totals
  const cumulativeByDay: number[] = [];
  let running = 0;
  for (const v of dailyTotals) { running += v; cumulativeByDay.push(running); }
  const totalUsed = running;

  // Chart scale: peak is 5% above the max so bars never clip the top
  const peak = Math.max(totalUsed, allowance) * 1.05 || 1;
  // Usable bar height is 90% of the SVG (leave room at top for the allowance label)
  const chartH = 90;
  const barW = 100 / daysInMonth;

  const bars = cumulativeByDay.map((cum, i) => {
    if (dailyTotals[i] === 0) { return ''; }   // only draw on days with usage
    const h = (cum / peak) * chartH;
    const isOver = allowance > 0 && cum > allowance;
    const x = (i * barW).toFixed(2);
    const w = (barW - 0.4).toFixed(2);
    return `<rect x="${x}%" y="${(100 - h).toFixed(2)}%" width="${w}%" height="${h.toFixed(2)}%" fill="${isOver ? 'var(--crit)' : 'var(--accent)'}" rx="1"/>`;
  }).join('');

  // Allowance threshold line — rendered as an HTML overlay so it stays crisp
  let allowanceOverlay = '';
  if (allowance > 0 && allowance <= peak) {
    const bottomPct = ((allowance / peak) * chartH).toFixed(2);
    allowanceOverlay = `
      <div class="burn-threshold" style="bottom:${bottomPct}%">
        <span class="burn-threshold-label">${formatCreditsValue(allowance)} AIC</span>
      </div>`;
  }

  // X-axis date labels
  const tickDays = [0, 6, 13, 20, 27].filter(d => d < daysInMonth);
  if (tickDays[tickDays.length - 1] !== daysInMonth - 1) { tickDays.push(daysInMonth - 1); }
  const tickSet = new Set(tickDays);
  const axisSpans = Array.from({ length: daysInMonth }, (_, i) =>
    tickSet.has(i) ? `<span>${i + 1}</span>` : '<span></span>',
  ).join('');

  // Summary line below the chart
  const summaryParts = [`${formatCreditsValue(totalUsed)} AIC used`];
  if (allowance > 0) {
    const overBy = totalUsed - allowance;
    if (overBy > 0) {
      summaryParts.push(`<span class="crit-text">+${formatCreditsValue(overBy)} AIC over budget</span>`);
    } else {
      summaryParts.push(`<span class="ok-text">${formatCreditsValue(allowance - totalUsed)} AIC remaining</span>`);
    }
  }

  return `
    <div class="card burn-card">
      <div class="burn-header">
        <span class="card-title">Cumulative Burn</span>
        <div class="burn-legend">
          <span class="burn-leg burn-leg-ok">within budget</span>
          <span class="burn-leg burn-leg-over">over budget</span>
          ${allowance > 0 ? '<span class="burn-leg burn-leg-threshold">— budget limit</span>' : ''}
        </div>
      </div>
      <div class="burn-chart-wrap">
        <svg class="burn-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Cumulative credit burn chart">${bars}</svg>
        ${allowanceOverlay}
      </div>
      <div class="burn-axis" style="grid-template-columns:repeat(${daysInMonth},1fr)">${axisSpans}</div>
      <div class="burn-summary muted">${summaryParts.join(' · ')}</div>
    </div>
  `;
}

function buildSessionModelBreakdown(sessions: ChatSessionSerialized[]): Array<{ modelId: string; displayName: string; credits: number }> {
  const map = new Map<string, { displayName: string; credits: number }>();
  for (const s of sessions) {
    if (s.modelUsage && Object.keys(s.modelUsage).length > 0) {
      for (const [modelId, usage] of Object.entries(s.modelUsage)) {
        const entry = map.get(modelId);
        if (entry) { entry.credits += usage.credits; }
        else { map.set(modelId, { displayName: humanizeModelName(modelId), credits: usage.credits }); }
      }
    } else if (s.models[0]) {
      const modelId = s.models[0];
      const entry = map.get(modelId);
      if (entry) { entry.credits += s.estimatedCredits; }
      else { map.set(modelId, { displayName: humanizeModelName(modelId), credits: s.estimatedCredits }); }
    }
  }
  return Array.from(map.entries())
    .map(([modelId, d]) => ({ modelId, ...d }))
    .sort((a, b) => b.credits - a.credits);
}

function renderModelMiniCard(credits: CreditsAggregateSerialized | null, monthSessions: ChatSessionSerialized[]): string {
  // Prefer per-model data from session modelUsage (more granular than GitHub API aggregate)
  const sessionBreakdown = buildSessionModelBreakdown(monthSessions);
  const displayModels = sessionBreakdown.length > 0
    ? sessionBreakdown
    : (credits?.byModel ?? []);

  if (displayModels.length === 0) {
    return `<div class="mini-card"><span class="card-title">Credits by Model</span><p class="muted" style="margin-top:8px">No model data yet.</p></div>`;
  }

  const total = displayModels.reduce((s, m) => s + m.credits, 0) || 1;
  const topCredits = displayModels[0].credits || 1;
  const sessionModelIds = new Set(monthSessions.flatMap(s => s.models));

  // Seed top model color from session breakdown
  if (displayModels[0]?.modelId) { modelColor(displayModels[0].modelId, true); }

  const rows = displayModels.map(model => {
    const pct = Math.round((model.credits / total) * 100);
    const barPct = Math.max(2, (model.credits / topCredits) * 100);
    const color = modelColor(model.modelId);
    const isFilterable = sessionModelIds.has(model.modelId);
    const tag = isFilterable ? 'button' : 'div';
    const attrs = isFilterable ? ` type="button" data-filter-model="${esc(model.modelId)}" title="Filter sessions by this model"` : '';
    return `
      <${tag}${attrs} class="hbar-row${isFilterable ? ' hbar-row-btn' : ''}">
        <span class="hbar-swatch" style="background:${color}"></span>
        <span class="hbar-name">${esc(model.displayName)}</span>
        <div class="hbar-track"><div class="hbar-fill" style="width:${barPct.toFixed(1)}%;background:${color}"></div></div>
        <span class="hbar-pct mono">${pct}%</span>
        <span class="hbar-val muted">${formatCreditsValue(model.credits)} AIC</span>
      </${tag}>
    `;
  }).join('');
  return `
    <div class="mini-card">
      <span class="card-title">Credits by Model</span>
      <div class="hbar-list">${rows}</div>
    </div>
  `;
}

function renderPaceCard(credits: CreditsAggregateSerialized | null, daysLeft: number, daysElapsed: number): string {
  if (!credits) {
    return `<div class="mini-card"><span class="card-title">Pace &amp; Projections</span><p class="muted" style="margin-top:8px">No data yet.</p></div>`;
  }
  const allowance = credits.creditsAllowance;
  const used = credits.creditsUsed;
  const avgPerDay = used / daysElapsed;
  const daysInCycle = daysElapsed + daysLeft;
  const projected = avgPerDay * daysInCycle;
  const budgetPerDay = allowance > 0 ? allowance / daysInCycle : 0;
  const overageCredits = Math.max(0, projected - allowance);
  const isOver = used > allowance && allowance > 0;
  const isProjectedOver = projected > allowance && allowance > 0;

  type PaceRow = { label: string; value: string; mono?: boolean };
  const rows: PaceRow[] = [
    { label: 'Status', value: isOver ? '<span class="crit-text">Over budget</span>' : isProjectedOver ? '<span class="warn-text">Projected over</span>' : '<span class="ok-text">On track</span>' },
    { label: 'Avg / day', value: `${formatCreditsValue(avgPerDay)} AIC`, mono: true },
    ...(allowance > 0 ? [{ label: 'Budget / day', value: `${formatCreditsValue(budgetPerDay)} AIC`, mono: true }] : []),
    ...(allowance > 0 ? [{ label: 'Projected', value: `${formatCreditsValue(projected)} AIC${isProjectedOver ? ' <span class="crit-text">▲</span>' : ''}`, mono: true }] : []),
    ...(isProjectedOver ? [{ label: 'Est. overage', value: `<span class="crit-text">+$${(overageCredits / 100).toFixed(2)}</span>` }] : []),
    { label: 'Days left', value: `${daysLeft}d`, mono: true },
  ];

  return `
    <div class="mini-card">
      <span class="card-title">Pace &amp; Projections</span>
      <div class="pace-list">
        ${rows.map(row => `
          <div class="pace-row">
            <span class="pace-key muted">${row.label}</span>
            <span class="pace-val${row.mono ? ' mono' : ''}">${row.value}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderSessionTable(model: DetailViewModelSerialized, monthSessions: ChatSessionSerialized[]): string {
  const debugBanner = !model.agentDebugLogEnabled
    ? `<div class="session-banner"><span>Copilot agent debug logging is off. Enable it to collect future session detail.</span><button class="btn btn-sm" data-action="enableAgentDebugLog">Enable</button></div>`
    : '';

  if (!model.config.localLogsEnabled) {
    return `
      <section class="card session-list">
        <h2 class="card-title">Sessions</h2>
        <p class="muted">Enable local log tracking in settings to see session detail.</p>
      </section>
    `;
  }

  const topSessionId = monthSessions.length > 0
    ? monthSessions.reduce((max, s) => s.estimatedCredits > max.estimatedCredits ? s : max, monthSessions[0]).id
    : null;

  const tableBody = monthSessions.length === 0
    ? `<tr><td colspan="9" class="st-empty muted">No sessions in this time range. Try a wider lookback after debug logging has captured chat activity.</td></tr>`
    : monthSessions.map(s => renderSessionRow(s, s.id === topSessionId)).join('');

  return `
    <section class="card session-list">
      <div class="st-header">
        <div class="st-title-row">
          <h2 class="card-title">Sessions <span class="session-count">(<span id="visible-session-count">${monthSessions.length}</span>)</span></h2>
          <div class="st-legend">
            <span class="st-leg"><span class="st-leg-dot" style="background:var(--token-in)"></span>input</span>
            <span class="st-leg"><span class="st-leg-dot" style="background:var(--token-out)"></span>output</span>
            <span class="st-leg"><span class="st-leg-dot" style="background:var(--token-cache)"></span>cached</span>
          </div>
        </div>
        ${debugBanner}
        ${monthSessions.length > 0 ? renderSessionFilters(model.sessions) : ''}
      </div>
      <div class="session-table-wrap">
        <table class="session-table">
          <thead>
            <tr>
              <th class="td-l">Session</th>
              <th class="td-c">Mode</th>
              <th class="td-l">Models</th>
              <th class="td-l">Tokens</th>
              <th class="td-r">Turns</th>
              <th class="td-r">Credits (AIC)</th>
              <th class="td-r">Cost</th>
              <th class="td-c">Log</th>
              <th class="td-c expand-cell-head"></th>
            </tr>
          </thead>
          <tbody class="session-tbody">
            ${tableBody}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSessionFilters(sessions: ChatSessionSerialized[]): string {
  const workspaces = uniqueSorted(sessions.map(session => session.workspaceName));
  const models = uniqueSorted(sessions.flatMap(session => session.models));
  return `
    <div class="session-filters">
      <select id="filter-time" data-session-filter="time" aria-label="Time range">
        <option value="cycle">Selected month</option>
        <option value="today">Today</option>
        <option value="7d">Last 7 days</option>
        <option value="all">All available</option>
      </select>
      <select id="filter-workspace" data-session-filter="workspace" aria-label="Workspace">
        <option value="all">All workspaces</option>
        ${workspaces.map(workspaceName => `<option value="${esc(workspaceName)}">${esc(workspaceName)}</option>`).join('')}
      </select>
      <select id="filter-model" data-session-filter="model" aria-label="Model">
        <option value="all">All models</option>
        ${models.map(model => `<option value="${esc(model)}">${esc(humanizeModelName(model))}</option>`).join('')}
      </select>
    </div>
  `;
}

function renderSessionRow(session: ChatSessionSerialized, isTopSession: boolean): string {
  const tokenTotal = session.tokens.input + session.tokens.output + session.tokens.cached;
  const isLive = Date.now() - session.lastTurnAt < 120_000;
  const models = session.models.length > 0 ? session.models : ['unknown'];

  const inputPct = tokenTotal > 0 ? (session.tokens.input / tokenTotal) * 100 : 0;
  const outputPct = tokenTotal > 0 ? (session.tokens.output / tokenTotal) * 100 : 0;
  const cachePct = tokenTotal > 0 ? (session.tokens.cached / tokenTotal) * 100 : 0;

  const tokenBarTitle = `${formatNumber(session.tokens.input)} in · ${formatNumber(session.tokens.output)} out · ${formatNumber(session.tokens.cached)} cached`;
  const tokenBar = `
    <div class="token-bar" title="${esc(tokenBarTitle)}">
      <div class="token-seg" style="width:${inputPct.toFixed(1)}%;background:var(--token-in)"></div>
      <div class="token-seg" style="width:${outputPct.toFixed(1)}%;background:var(--token-out)"></div>
      <div class="token-seg" style="width:${cachePct.toFixed(1)}%;background:var(--token-cache)"></div>
    </div>
  `;

  const modelChips = models.slice(0, 2).map(m => {
    const color = modelColor(m);
    return `<span class="model-chip"><span class="model-chip-dot" style="background:${color}"></span>${esc(humanizeModelName(m))}</span>`;
  }).join('');
  const moreChip = models.length > 2 ? `<span class="model-chip model-chip-more">+${models.length - 2}</span>` : '';
  const credClass = session.estimatedCredits >= 1000 ? 'crit-text' : session.estimatedCredits >= 500 ? 'warn-text' : '';

  return `
    <tr class="session-row"
      data-session-id="${esc(session.id)}"
      data-last="${session.lastTurnAt}"
      data-workspace="${esc(session.workspaceName)}"
      data-models="${esc(models.join('|'))}"
      role="button" tabindex="0" aria-expanded="false">
      <td class="td-l">
        ${isLive ? '<span class="live-dot" title="Live"></span> ' : ''}${esc(relativeTime(session.lastTurnAt))}<span class="muted" style="font-size:0.82em"> · ${esc(session.workspaceName)}</span>
      </td>
      <td class="td-c"><span class="mode-pill mode-${session.mode}">${esc(session.mode)}</span></td>
      <td class="td-l"><div class="model-chips">${modelChips}${moreChip}</div></td>
      <td class="td-l">
        <span class="mono muted" style="font-size:0.8em">${formatNumber(tokenTotal)}</span>
        ${tokenBar}
      </td>
      <td class="td-r mono">${session.turnCount}</td>
      <td class="td-r mono ${credClass}">${formatCreditsValue(session.estimatedCredits)}</td>
      <td class="td-r mono muted">$${session.estimatedDollars.toFixed(2)}</td>
      <td class="td-c" data-no-toggle>
        <button type="button" class="btn btn-ghost btn-sm" data-open-session-source="${esc(session.id)}" ${session.sourceAvailable === false ? 'disabled' : ''} title="Open log">Log</button>
      </td>
      <td class="td-c expand-cell">
        <button type="button" class="expand-btn" aria-label="Expand session detail">›</button>
      </td>
    </tr>
    <tr class="detail-row" hidden>
      <td colspan="9" class="detail-cell">
        ${renderExpandedDetail(session, isTopSession)}
      </td>
    </tr>
  `;
}

function renderExpandedDetail(session: ChatSessionSerialized, isTopSession: boolean): string {
  const rows = getSessionModelRows(session);
  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0);
  const duration = Math.max(0, Math.round((session.lastTurnAt - session.startedAt) / 60_000));
  const avgPerTurn = session.turnCount > 0 ? totalCredits / session.turnCount : 0;
  const tokenTotal = session.tokens.input + session.tokens.output + session.tokens.cached;
  const hasModelUsage = !!session.modelUsage && Object.keys(session.modelUsage).length > 0;
  const pills = renderInsightPills(session, rows, isTopSession);

  return `
    <div class="detail-panel">
      ${pills ? `<div class="insight-pills">${pills}</div>` : ''}
      <div class="detail-quickstats">
        <div class="dqs-item"><span class="dqs-val mono">${formatCreditsValue(totalCredits)}</span><span class="dqs-key">AIC</span></div>
        <div class="dqs-item"><span class="dqs-val mono">$${session.estimatedDollars.toFixed(2)}</span><span class="dqs-key">cost</span></div>
        <div class="dqs-item"><span class="dqs-val mono">${formatNumber(tokenTotal)}</span><span class="dqs-key">tokens</span></div>
        <div class="dqs-item"><span class="dqs-val mono">${session.turnCount}</span><span class="dqs-key">turns</span></div>
        <div class="dqs-item"><span class="dqs-val mono">${duration}m</span><span class="dqs-key">duration</span></div>
        <div class="dqs-item"><span class="dqs-val mono">${session.subAgentCount}</span><span class="dqs-key">sub-agents</span></div>
        <div class="dqs-item"><span class="dqs-val mono">${formatCreditsValue(avgPerTurn)}</span><span class="dqs-key">AIC/turn</span></div>
      </div>
      <div class="detail-grid">
        <div class="detail-section">
          <div class="detail-section-title">Model Breakdown</div>
          ${!hasModelUsage ? '<p class="muted" style="font-size:0.82em;margin-bottom:8px">Partial data — no per-model breakdown.</p>' : ''}
          ${renderModelDetailTable(rows, totalCredits)}
          ${renderTokenCompositionBar(session.tokens)}
          ${renderCacheInsight(session.tokens)}
        </div>
        <div class="detail-section">
          <div class="detail-section-title">Tool Calls</div>
          ${renderToolCallChart(session.toolCallSummary)}
          ${session.subAgentCount > 0 ? `<div class="subagent-banner">🤖 ${session.subAgentCount} sub-agent${session.subAgentCount === 1 ? '' : 's'} spawned</div>` : ''}
          <div class="detail-section-title" style="margin-top:14px">Session Info</div>
          ${renderMetaGrid(session, duration, avgPerTurn)}
        </div>
      </div>
      <div class="detail-footer">
        <span class="muted" style="font-size:0.78em">Local estimate · Copilot agent logs</span>
        <button type="button" class="btn btn-ghost btn-sm" data-no-toggle data-open-session-source="${esc(session.id)}" ${session.sourceAvailable === false ? 'disabled' : ''}>Open log file ↗</button>
      </div>
    </div>
  `;
}

function renderInsightPills(session: ChatSessionSerialized, rows: SessionModelRow[], isTopSession: boolean): string {
  const pills: string[] = [];
  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0);
  const tokenTotal = session.tokens.input + session.tokens.output + session.tokens.cached;
  const duration = Math.max(0, Math.round((session.lastTurnAt - session.startedAt) / 60_000));

  if (rows.length > 0 && totalCredits > 0) {
    const topPct = Math.round((rows[0].credits / totalCredits) * 100);
    if (topPct >= 60) {
      pills.push(`<span class="insight-pill ip-orange">${esc(humanizeModelName(rows[0].modelId))} drove ${topPct}% of cost</span>`);
    }
  }
  if (tokenTotal >= 5_000 && session.tokens.cached / tokenTotal >= 0.50) {
    pills.push(`<span class="insight-pill ip-green">${Math.round((session.tokens.cached / tokenTotal) * 100)}% tokens were cached</span>`);
  }
  if (isTopSession && totalCredits >= 500) {
    pills.push(`<span class="insight-pill ip-red">Top session in cycle</span>`);
  }
  if (session.subAgentCount >= 3) {
    pills.push(`<span class="insight-pill ip-purple">${session.subAgentCount} sub-agents spawned</span>`);
  }
  if (duration >= 60) {
    pills.push(`<span class="insight-pill ip-blue">${duration} min session</span>`);
  }
  return pills.slice(0, 3).join('');
}

function renderModelDetailTable(rows: SessionModelRow[], totalCredits: number): string {
  if (rows.length === 0) { return ''; }
  const tableRows = rows.map(row => {
    const credPct = totalCredits > 0 ? Math.round((row.credits / totalCredits) * 100) : 0;
    const color = modelColor(row.modelId);
    return `
      <tr>
        <td class="mdt-model"><span class="model-chip-dot" style="background:${color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;flex-shrink:0"></span>${esc(humanizeModelName(row.modelId))}</td>
        <td class="td-r mono muted">${formatNumber(row.inputTokens)}</td>
        <td class="td-r mono muted">${formatNumber(row.outputTokens)}</td>
        <td class="td-r mono muted">${formatNumber(row.cachedTokens)}</td>
        <td class="td-r mono muted">${row.requestCount}</td>
        <td class="td-r mono">${formatCreditsValue(row.credits)} <span class="muted" style="font-size:0.8em">(${credPct}%)</span></td>
      </tr>
    `;
  }).join('');
  return `
    <table class="model-detail-table">
      <thead><tr>
        <th class="td-l">Model</th>
        <th class="td-r">In</th>
        <th class="td-r">Out</th>
        <th class="td-r">Cached</th>
        <th class="td-r">Req</th>
        <th class="td-r">Credits (AIC)</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  `;
}

function renderTokenCompositionBar(tokens: { input: number; output: number; cached: number }): string {
  const total = tokens.input + tokens.output + tokens.cached;
  if (total === 0) { return ''; }
  const inputPct = Math.round((tokens.input / total) * 100);
  const outputPct = Math.round((tokens.output / total) * 100);
  const cachePct = 100 - inputPct - outputPct;
  return `
    <div class="token-comp">
      <div class="detail-section-title" style="margin-top:10px">Token Composition</div>
      <div class="token-comp-bar">
        <div style="width:${inputPct}%;background:var(--token-in)" title="Input: ${formatNumber(tokens.input)}"></div>
        <div style="width:${outputPct}%;background:var(--token-out)" title="Output: ${formatNumber(tokens.output)}"></div>
        <div style="width:${cachePct}%;background:var(--token-cache)" title="Cached: ${formatNumber(tokens.cached)}"></div>
      </div>
      <div class="token-comp-legend">
        <span><span class="st-leg-dot" style="background:var(--token-in)"></span>${esc(formatNumber(tokens.input))} in (${inputPct}%)</span>
        <span><span class="st-leg-dot" style="background:var(--token-out)"></span>${esc(formatNumber(tokens.output))} out (${outputPct}%)</span>
        <span><span class="st-leg-dot" style="background:var(--token-cache)"></span>${esc(formatNumber(tokens.cached))} cached (${cachePct}%)</span>
      </div>
    </div>
  `;
}

function renderCacheInsight(tokens: { input: number; output: number; cached: number }): string {
  const total = tokens.input + tokens.output + tokens.cached;
  if (total === 0 || tokens.cached / total < 0.20) { return ''; }
  const pct = Math.round((tokens.cached / total) * 100);
  return `<div class="token-insight">💡 ${pct}% of tokens were served from cache — reduces cost vs. fresh input</div>`;
}

function renderToolCallChart(toolCallSummary: Record<string, number>): string {
  const entries = Object.entries(toolCallSummary).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return `<p class="muted" style="font-size:0.84em;margin-top:4px">No tool calls recorded.</p>`;
  }
  const top = entries.slice(0, 8);
  const rest = entries.slice(8);
  const maxCount = top[0][1];
  const bars = top.map(([name, count]) => {
    const barPct = maxCount > 0 ? Math.max(2, (count / maxCount) * 100) : 0;
    return `
      <div class="tool-row">
        <span class="tool-name muted">${esc(name)}</span>
        <div class="tool-bar-track"><div class="tool-bar-fill" style="width:${barPct.toFixed(1)}%"></div></div>
        <span class="tool-count mono">${count}</span>
      </div>
    `;
  }).join('');
  const more = rest.length > 0
    ? `<div class="tool-row tool-more"><span class="muted">+${rest.length} more (${rest.reduce((s, [, c]) => s + c, 0)} calls)</span></div>`
    : '';
  return `<div class="tool-chart">${bars}${more}</div>`;
}

function renderMetaGrid(session: ChatSessionSerialized, duration: number, avgPerTurn: number): string {
  const fmt = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const editorLabel = session.editor === 'vscode-insiders' ? 'VS Code Insiders' : 'VS Code';
  const items = [
    ['Started', fmt(session.startedAt)],
    ['Ended', fmt(session.lastTurnAt)],
    ['Duration', `${duration} min`],
    ['Editor', editorLabel],
    ['Workspace', session.workspaceName],
    ['Mode', session.mode],
    ['Sub-agents', String(session.subAgentCount)],
    ['Avg AIC/turn', formatCreditsValue(avgPerTurn)],
  ];
  return `
    <div class="meta-grid">
      ${items.map(([key, val]) => `<span class="meta-key muted">${key}</span><span class="meta-val mono">${esc(val)}</span>`).join('')}
    </div>
  `;
}

function renderCreditsSettings(config: ConfigSerialized): string {
  const creditsFormatOptions = [
    { value: 'used-over-allowance', label: 'Used / allowance' },
    { value: 'percent', label: 'Percent' },
    { value: 'dollars', label: 'Dollars' },
    { value: 'credits', label: 'Credits' },
  ].map(option => `<option value="${option.value}" ${config.statusBarCreditsFormat === option.value ? 'selected' : ''}>${esc(option.label)}</option>`).join('');

  return `
    <section class="card credits-settings">
      <h2 class="card-title">AI Credits Settings</h2>
      <div class="settings-grid">
        <div class="setting-row">
          <label for="setting-credits-status">Status Bar Format</label>
          <select id="setting-credits-status" data-setting="statusBar.creditsFormat">
            ${creditsFormatOptions}
          </select>
        </div>
        <div class="setting-row">
          <label for="setting-local-logs">Local Session Logs</label>
          <label class="toggle">
            <input type="checkbox" id="setting-local-logs" data-setting="localLogs.enabled" ${config.localLogsEnabled ? 'checked' : ''} />
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-row ${!config.localLogsEnabled ? 'disabled' : ''}">
          <label for="setting-include-insiders">Include Insiders</label>
          <label class="toggle">
            <input type="checkbox" id="setting-include-insiders" data-setting="localLogs.includeInsiders" ${config.localLogsIncludeInsiders ? 'checked' : ''} ${!config.localLogsEnabled ? 'disabled' : ''} />
            <span class="toggle-track"></span>
          </label>
        </div>
        <div class="setting-row ${!config.localLogsEnabled ? 'disabled' : ''}">
          <label for="setting-lookback">Lookback</label>
          <div class="input-suffix">
            <input type="number" id="setting-lookback" data-setting="localLogs.lookbackDays" min="1" max="365" value="${config.localLogsLookbackDays}" ${!config.localLogsEnabled ? 'disabled' : ''} />
            <span class="suffix">days</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderQuotaCard(title: string, quota: QuotaSnapshotSerialized | null, iconPath: string): string {
  if (!quota) {
    return `
      <div class="quota-card">
        <div class="quota-header">
          <div class="quota-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="${iconPath}"/></svg></div>
          <h3 class="quota-title">${esc(title)}</h3>
        </div>
        <span class="quota-value muted">—</span>
        <span class="quota-sub muted">Not available</span>
      </div>
    `;
  }

  if (quota.unlimited) {
    return `
      <div class="quota-card">
        <div class="quota-header">
          <div class="quota-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="${iconPath}"/></svg></div>
          <h3 class="quota-title">${esc(title)}</h3>
        </div>
        <span class="quota-value">∞</span>
        ${renderQuotaBar(1, true)}
        <span class="quota-sub muted">Unlimited</span>
      </div>
    `;
  }

  const used = quota.entitlement - quota.remaining;
  const pctUsed = quota.entitlement > 0
    ? Math.min(100, Math.max(0, Math.round(((used / quota.entitlement) * 100) * 10) / 10))
    : 0;
  return `
    <div class="quota-card">
      <div class="quota-header">
        <div class="quota-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="${iconPath}"/></svg></div>
        <h3 class="quota-title">${esc(title)}</h3>
      </div>
      <span class="quota-value mono">${used} <span class="muted">/ ${quota.entitlement}</span></span>
      ${renderQuotaBar(Math.min(pctUsed, 100) / 100, false)}
      <span class="quota-sub muted">${quota.remaining} remaining · ${formatPercent(pctUsed)}% used</span>
    </div>
  `;
}

function renderQuotaBar(ratio: number, unlimited: boolean): string {
  const trackWidth = 220;
  const fillWidth = Math.round(trackWidth * Math.max(0, Math.min(1, ratio)));
  const fillClass = unlimited ? 'quota-bar-fill unlimited' : 'quota-bar-fill';

  return `
    <svg class="quota-bar" viewBox="0 0 ${trackWidth} 6" aria-hidden="true" preserveAspectRatio="none">
      <rect class="quota-bar-track" x="0" y="0" width="${trackWidth}" height="6" rx="3" ry="3"></rect>
      <rect class="${fillClass}" x="0" y="0" width="${fillWidth}" height="6" rx="3" ry="3"></rect>
    </svg>
  `;
}

function renderManagedPlanBillingMessage(): string {
  return `
    <div class="settings-note settings-note-info">
      <div class="settings-note-kicker">Managed Plan</div>
      <p class="muted">Billing and requests-by-model options are disabled for Copilot Business or Enterprise plans. Only organization admins and billing managers can view usage reports for members.</p>
    </div>
  `;
}

function renderManagedPlanEstimateDisclaimer(config: ConfigSerialized, data: UsageDataSerialized): string {
  if (!data.isManagedPlan || config.statusBarTextMode !== 'billedOnly') {
    return '';
  }

  return `
    <div class="settings-note settings-note-estimate">
      <div class="settings-note-kicker">Estimate</div>
      <p class="muted">Billed Only is shown as an estimate for managed plans. It uses the flat rate of $0.04 per additional premium request described in GitHub Docs, not the exact billed total from your organization or enterprise billing settings.</p>
    </div>
  `;
}

function renderBillingSection(
  billing: BillingDataSerialized | null,
  config: ConfigSerialized,
  data: UsageDataSerialized,
): string {
  if (data.isManagedPlan) {
    return '';
  }

  if (!config.showBillingDetails) {
    return '';
  }

  // No billing data — show grant access message
  if (!billing) {
    return `
      <section class="card billing-card">
        <h2 class="card-title">Billing Details</h2>
        <div class="billing-grant-access">
          <p class="muted">Billing details require the <code>user</code> scope. Grant access to see billing summary and overage details.</p>
          <button class="btn btn-primary btn-sm" data-action="grantBillingAccess">Grant Access</button>
        </div>
      </section>
    `;
  }

  const totalRequests = billing.items.reduce((sum, i) => sum + i.grossQuantity, 0);

  // Overage banner
  const overageBanner = billing.totalNet > 0
    ? `<div class="overage-banner">
        <span class="overage-icon">!</span>
        <span>Overage: <strong>+$${billing.totalNet.toFixed(2)}</strong> billed &nbsp;·&nbsp; ${totalRequests > 0 ? `${Math.round((billing.totalNet / billing.totalGross) * 100)}% of gross` : ''}</span>
      </div>`
    : '';

  // Summary stats
  const pricePerUnit = billing.items.length > 0 ? billing.items[0].pricePerUnit : 0;
  const summaryHtml = `
    <div class="billing-summary">
      <div class="billing-stat">
        <span class="billing-stat-value mono">${formatQuantity(totalRequests)}</span>
        <span class="billing-stat-label">Total Requests</span>
      </div>
      <div class="billing-stat">
        <span class="billing-stat-value mono">$${billing.totalGross.toFixed(2)}</span>
        <span class="billing-stat-label">Gross Cost</span>
      </div>
      <div class="billing-stat">
        <span class="billing-stat-value mono${billing.totalNet > 0 ? ' crit-text' : ''}">$${billing.totalNet.toFixed(2)}</span>
        <span class="billing-stat-label">Billed / Overage</span>
      </div>
      <div class="billing-stat">
        <span class="billing-stat-value mono">$${pricePerUnit.toFixed(2)}</span>
        <span class="billing-stat-label">Price / Unit</span>
      </div>
    </div>
  `;

  return `
    <section class="card billing-card">
      <h2 class="card-title">Billing Details</h2>
      ${overageBanner}
      ${summaryHtml}
    </section>
  `;
}

function renderRequestBreakdownSection(
  billing: BillingDataSerialized | null,
  config: ConfigSerialized,
  data: UsageDataSerialized,
): string {
  if (data.isManagedPlan) {
    return '';
  }

  if (!config.showBillingRequestBreakdown) {
    return '';
  }

  if (!billing) {
    return `
      <section class="card billing-card">
        <h2 class="card-title">Requests by Model</h2>
        <div class="billing-grant-access">
          <p class="muted">Requests by Model uses the same GitHub billing usage endpoint. Grant access to view per-model request counts for models with recorded requests, even when billed overage is still $0.00.</p>
          <button class="btn btn-primary btn-sm" data-action="grantBillingAccess">Grant Access</button>
        </div>
      </section>
    `;
  }

  if (billing.items.length === 0) {
    return `
      <section class="card billing-card">
        <h2 class="card-title">Requests by Model</h2>
        <p class="muted">No model requests recorded for this billing period yet.</p>
      </section>
    `;
  }

  const sorted = [...billing.items].sort((a, b) => b.grossQuantity - a.grossQuantity);
  const maxQty = sorted.length > 0 ? sorted[0].grossQuantity : 1;

  const top5 = sorted.slice(0, 5);
  const rest = sorted.slice(5);

  const top5Rows = top5.map((item, i) => `
    <tr class="${i % 2 === 1 ? 'alt-row' : ''}">
      <td>
        <div class="model-name">${esc(item.model)}</div>
        ${renderModelBar(item.grossQuantity, maxQty)}
      </td>
      <td class="mono right">${formatQuantity(item.grossQuantity)}</td>
      <td class="mono right">$${item.grossAmount.toFixed(2)}</td>
      <td class="mono right">$${item.netAmount.toFixed(2)}</td>
    </tr>
  `).join('');

  const restRows = rest.map((item, i) => `
    <tr class="${(i + top5.length) % 2 === 1 ? 'alt-row' : ''}">
      <td>
        <div class="model-name">${esc(item.model)}</div>
        ${renderModelBar(item.grossQuantity, maxQty)}
      </td>
      <td class="mono right">${formatQuantity(item.grossQuantity)}</td>
      <td class="mono right">$${item.grossAmount.toFixed(2)}</td>
      <td class="mono right">$${item.netAmount.toFixed(2)}</td>
    </tr>
  `).join('');

  const tableHtml = `
    <div class="billing-table-section">
      <div class="billing-table-header" data-toggle="billing-model-table">
        <span class="chevron">▶</span>
        <h3 class="billing-table-title">Requests by Model</h3>
        <span class="muted">${billing.items.length} models</span>
      </div>
      <div class="billing-table-content" id="billing-model-table">
        <table class="billing-table">
          <thead>
            <tr>
              <th>Model</th>
              <th class="right">Requests</th>
              <th class="right">Gross ($)</th>
              <th class="right">Billed ($)</th>
            </tr>
          </thead>
          <tbody>
            ${top5Rows}
            ${rest.length > 0 ? restRows : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return `
    <section class="card billing-card">
      <h2 class="card-title">Requests by Model</h2>
      ${tableHtml}
    </section>
  `;
}

function formatQuantity(qty: number): string {
  return qty % 1 === 0 ? String(qty) : qty.toFixed(1);
}

function formatPercent(value: number): string {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function renderModelBar(quantity: number, maxQuantity: number): string {
  const trackWidth = 180;
  const ratio = maxQuantity > 0 ? Math.max(0, Math.min(1, quantity / maxQuantity)) : 0;
  const fillWidth = Math.round(trackWidth * ratio);

  return `
    <svg class="model-bar" viewBox="0 0 ${trackWidth} 4" aria-hidden="true" preserveAspectRatio="none">
      <rect class="model-bar-track" x="0" y="0" width="${trackWidth}" height="4" rx="2" ry="2"></rect>
      <rect class="model-bar-fill" x="0" y="0" width="${fillWidth}" height="4" rx="2" ry="2"></rect>
    </svg>
  `;
}

function getCreditsTokenTotal(credits: CreditsAggregateSerialized): number {
  return credits.byModel.reduce(
    (sum, model) => sum + (model.inputTokens ?? 0) + (model.outputTokens ?? 0) + (model.cachedTokens ?? 0),
    0,
  );
}

function getSessionTokenTotal(sessions: ChatSessionSerialized[]): number {
  return sessions.reduce(
    (sum, session) => sum + session.tokens.input + session.tokens.output + session.tokens.cached,
    0,
  );
}

function getCreditsMonthOptions(
  credits: CreditsAggregateSerialized | null,
  sessions: ChatSessionSerialized[],
): Array<{ value: string; label: string }> {
  const keys = new Set<string>();
  if (credits) { keys.add(monthKeyFromIso(credits.cycleStart)); }
  for (const session of sessions) {
    keys.add(monthKeyFromTimestamp(session.lastTurnAt));
  }

  return [...keys]
    .sort((left, right) => right.localeCompare(left))
    .map(key => ({ value: key, label: formatMonthKey(key) }));
}

function normalizeSelectedCreditsMonth(monthOptions: Array<{ value: string; label: string }>): string {
  if (monthOptions.length === 0) {
    selectedCreditsMonth = monthKeyFromTimestamp(Date.now());
    return selectedCreditsMonth;
  }
  if (!selectedCreditsMonth || !monthOptions.some(option => option.value === selectedCreditsMonth)) {
    selectedCreditsMonth = monthOptions[0].value;
  }
  return selectedCreditsMonth;
}

function filterSessionsByMonth(sessions: ChatSessionSerialized[], monthKey: string): ChatSessionSerialized[] {
  return sessions.filter(session => monthKeyFromTimestamp(session.lastTurnAt) === monthKey);
}

function aggregateSessionsForMonth(
  sessions: ChatSessionSerialized[],
  monthKey: string,
  allowance: number,
): CreditsAggregateSerialized | null {
  if (sessions.length === 0) { return null; }

  const byModel = new Map<string, ModelBreakdownSerialized>();
  for (const session of sessions) {
    for (const row of getSessionModelRows(session)) {
      const existing = byModel.get(row.modelId);
      if (existing) {
        existing.credits += row.credits;
        existing.dollars += row.dollars;
        existing.inputTokens = (existing.inputTokens ?? 0) + row.inputTokens;
        existing.outputTokens = (existing.outputTokens ?? 0) + row.outputTokens;
        existing.cachedTokens = (existing.cachedTokens ?? 0) + row.cachedTokens;
        existing.requestCount = (existing.requestCount ?? 0) + row.requestCount;
      } else {
        byModel.set(row.modelId, {
          modelId: row.modelId,
          displayName: humanizeModelName(row.modelId),
          credits: row.credits,
          dollars: row.dollars,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          cachedTokens: row.cachedTokens,
          requestCount: row.requestCount,
        });
      }
    }
  }

  const { startIso, endIso } = monthRangeFromKey(monthKey);
  const byModelRows = [...byModel.values()]
    .map(model => ({
      ...model,
      credits: roundCredits(model.credits),
      dollars: roundDollars(model.dollars),
    }))
    .sort((left, right) => right.credits - left.credits);

  return {
    source: 'local-estimate',
    fetchedAt: Date.now(),
    cycleStart: startIso,
    cycleEnd: endIso,
    creditsUsed: roundCredits(byModelRows.reduce((sum, model) => sum + model.credits, 0)),
    creditsAllowance: allowance,
    dollarsSpent: roundDollars(byModelRows.reduce((sum, model) => sum + model.dollars, 0)),
    byModel: byModelRows,
  };
}

function getSessionModelRows(session: ChatSessionSerialized): SessionModelRow[] {
  const usage = Object.entries(session.modelUsage ?? {});
  if (usage.length > 0) {
    return usage
      .map(([modelId, item]) => ({
        modelId,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        cachedTokens: item.cachedTokens,
        credits: item.credits,
        dollars: item.dollars,
        requestCount: item.requestCount,
      }))
      .sort((left, right) => right.credits - left.credits);
  }

  return [{
    modelId: session.models[0] ?? 'unknown',
    inputTokens: session.tokens.input,
    outputTokens: session.tokens.output,
    cachedTokens: session.tokens.cached,
    credits: session.estimatedCredits,
    dollars: session.estimatedDollars,
    requestCount: Math.max(1, session.turnCount),
  }];
}


function monthKeyFromIso(iso: string): string {
  return monthKeyFromTimestamp(new Date(iso).getTime());
}

function monthKeyFromTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}`;
}

function monthRangeFromKey(monthKey: string): { startMs: number; endMs: number; startIso: string; endIso: string } {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const startMs = Date.UTC(year, monthIndex, 1);
  const endMs = Date.UTC(year, monthIndex + 1, 1);
  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function formatMonthKey(monthKey: string): string {
  const { startMs } = monthRangeFromKey(monthKey);
  return new Date(startMs).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundDollars(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatCycleRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(new Date(endIso).getTime() - 86_400_000);
  const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endText = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startText} - ${endText}`;
}

function formatCreditsValue(value: number): string {
  if (Number.isInteger(value)) { return String(value); }
  return value.toFixed(value < 10 ? 2 : 1).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function relativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) { return 'just now'; }
  if (minutes < 60) { return `${minutes}m ago`; }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) { return `${hours}h ago`; }
  const days = Math.floor(hours / 24);
  if (days === 1) { return 'yesterday'; }
  return `${days}d ago`;
}

function humanizeModelName(modelId: string): string {
  if (!modelId || modelId === 'unknown') { return 'Unknown model'; }
  return modelId
    .replace(/[_-]/g, ' ')
    .replace(/\bgpt\b/gi, 'GPT')
    .replace(/\b([a-z])/g, letter => letter.toUpperCase());
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))]
    .sort((left, right) => left.localeCompare(right));
}

function bindBillingViewToggle(): void {
  if (!root) { return; }
  root.querySelectorAll<HTMLButtonElement>('[data-billing-view]').forEach(button => {
    button.addEventListener('click', () => {
      vscode.postMessage({ type: 'setBillingView', value: button.dataset.billingView });
    });
  });
}

function bindCreditsInteractions(): void {
  if (!root) { return; }

  root.querySelector<HTMLSelectElement>('#credits-month')?.addEventListener('change', event => {
    selectedCreditsMonth = (event.currentTarget as HTMLSelectElement).value;
    if (currentModel) { render(currentModel); }
  });

  root.querySelectorAll<HTMLButtonElement>('[data-open-session-source]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const sessionId = button.dataset.openSessionSource;
      if (sessionId) {
        vscode.postMessage({ type: 'openSessionSource', sessionId });
      }
    });
  });

  // Delegated row toggle on tbody
  const tbody = root.querySelector<HTMLElement>('.session-tbody');
  if (tbody) {
    tbody.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-no-toggle]')) { return; }
      const row = target.closest<HTMLTableRowElement>('tr.session-row');
      if (row) { toggleRow(row); }
    });
    tbody.addEventListener('keydown', event => {
      const ke = event as KeyboardEvent;
      if (ke.key !== 'Enter' && ke.key !== ' ') { return; }
      const row = (ke.target as HTMLElement).closest<HTMLTableRowElement>('tr.session-row');
      if (row) { ke.preventDefault(); toggleRow(row); }
    });
  }

  root.querySelectorAll<HTMLSelectElement>('[data-session-filter]').forEach(select => {
    select.addEventListener('change', applySessionFilters);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-filter-model]').forEach(button => {
    button.addEventListener('click', () => {
      const modelSelect = root.querySelector<HTMLSelectElement>('#filter-model');
      const model = button.dataset.filterModel;
      if (!modelSelect || !model) { return; }
      modelSelect.value = model;
      applySessionFilters();
      root.querySelector('.session-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  applySessionFilters();
}

function toggleRow(row: HTMLTableRowElement): void {
  const detailRow = row.nextElementSibling as HTMLTableRowElement | null;
  if (!detailRow?.classList.contains('detail-row')) { return; }
  const expanding = detailRow.hidden;
  detailRow.hidden = !expanding;
  row.classList.toggle('expanded', expanding);
  row.setAttribute('aria-expanded', String(expanding));
  const btn = row.querySelector<HTMLElement>('.expand-btn');
  if (btn) { btn.classList.toggle('open', expanding); }
}

function applySessionFilters(): void {
  if (!root) { return; }
  const timeFilter = root.querySelector<HTMLSelectElement>('#filter-time')?.value ?? 'cycle';
  const workspaceFilter = root.querySelector<HTMLSelectElement>('#filter-workspace')?.value ?? 'all';
  const modelFilter = root.querySelector<HTMLSelectElement>('#filter-model')?.value ?? 'all';
  const range = sessionTimeRange(timeFilter);
  let visibleCount = 0;

  root.querySelectorAll<HTMLTableRowElement>('tr.session-row').forEach(row => {
    const lastTurnAt = Number(row.dataset.last ?? 0);
    const workspaceName = row.dataset.workspace ?? '';
    const models = (row.dataset.models ?? '').split('|');
    const visible =
      lastTurnAt >= range.start && lastTurnAt < range.end &&
      (workspaceFilter === 'all' || workspaceName === workspaceFilter) &&
      (modelFilter === 'all' || models.includes(modelFilter));
    row.hidden = !visible;
    const detailRow = row.nextElementSibling as HTMLTableRowElement | null;
    if (detailRow?.classList.contains('detail-row')) {
      detailRow.hidden = !visible || !row.classList.contains('expanded');
    }
    if (visible) { visibleCount++; }
  });

  const count = root.querySelector<HTMLElement>('#visible-session-count');
  if (count) { count.textContent = String(visibleCount); }
}

function sessionTimeRange(filter: string): { start: number; end: number } {
  const now = new Date();
  if (filter === 'all') { return { start: 0, end: Number.POSITIVE_INFINITY }; }
  if (filter === 'today') {
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return { start, end: start + 86_400_000 };
  }
  if (filter === '7d') {
    return { start: Date.now() - 7 * 24 * 60 * 60 * 1000, end: Number.POSITIVE_INFINITY };
  }
  const monthKey = selectedCreditsMonth ?? monthKeyFromTimestamp(Date.now());
  const { startMs, endMs } = monthRangeFromKey(monthKey);
  return { start: startMs, end: endMs };
}

function bindActions(): void {
  if (!root) { return; }
  root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      vscode.postMessage({ type: btn.dataset.action });
    });
  });
}

function bindSettings(): void {
  if (!root) { return; }
  root.querySelectorAll<HTMLSelectElement>('select[data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      vscode.postMessage({ type: 'updateSetting', key: el.dataset.setting, value: el.value });
    });
  });
  root.querySelectorAll<HTMLInputElement>('input[type="number"][data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      const num = Number(el.value);
      if (Number.isFinite(num)) {
        vscode.postMessage({ type: 'updateSetting', key: el.dataset.setting, value: num });
      }
    });
  });
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      vscode.postMessage({ type: 'updateSetting', key: el.dataset.setting, value: el.checked });
    });
  });
  root.querySelectorAll<HTMLElement>('.btn-group[data-setting]').forEach(group => {
    group.querySelectorAll<HTMLButtonElement>('.btn-group-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.btn-group-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        vscode.postMessage({ type: 'updateSetting', key: group.dataset.setting, value: btn.dataset.value });
      });
    });
  });
  // Collapsible billing table toggle
  root.querySelectorAll<HTMLElement>('.billing-table-header[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const targetId = header.dataset.toggle;
      if (!targetId) { return; }
      const content = document.getElementById(targetId);
      if (!content) { return; }
      const isExpanded = content.classList.toggle('expanded');
      const chevron = header.querySelector('.chevron');
      if (chevron) { chevron.textContent = isExpanded ? '▼' : '▶'; }
    });
  });
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}