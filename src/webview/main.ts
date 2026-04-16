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
  quota: number;
  usedPct: number;
  unlimited: boolean;
  noData: boolean;
  overageEnabled: boolean;
  overageUsed: number;
  plan: string;
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
  thresholdEnabled: boolean;
  thresholdWarning: number;
  thresholdCritical: number;
  statusBarTextMode: string;
  statusBarGraphicMode: string;
  statusBarTextPosition: string;
  segmentedBarWidth: number;
  showBillingDetails: boolean;
  showBillingRequestBreakdown: boolean;
  showCostInStatusBar: boolean;
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

interface DetailViewModelSerialized {
  data: UsageDataSerialized | null;
  lastUpdatedAt: string | null;
  isOffline: boolean;
  login: string | null;
  config: ConfigSerialized;
  billing: BillingDataSerialized | null;
}

const vscode = acquireVsCodeApi();
const root = document.getElementById('app');

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

window.addEventListener('message', event => {
  const message = event.data as { type?: string; value?: DetailViewModelSerialized };
  if (message.type === 'state' && message.value) {
    render(message.value);
    vscode.setState(message.value);
  }
});

const savedState = vscode.getState() as DetailViewModelSerialized | undefined;
if (savedState) {
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

  // Pacing calculation
  const remaining = data.noData || data.unlimited ? null : Math.max(0, data.quota - data.used);
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
    gaugeLabel = `${data.usedPct}%`;
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
      <header class="header">
        <div class="header-left">
          <h1 class="title">Copilot Usage Insights</h1>
          <p class="subtitle">
            <span class="tag">${esc(data.plan)}</span>
            <span class="dot">·</span>
            <span>${esc(login)}</span>
            ${isOffline ? '<span class="dot">·</span><span class="offline-badge">Offline</span>' : ''}
          </p>
        </div>
        <div class="header-actions">
          <button class="btn btn-icon" data-action="refresh" title="Refresh">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M13.451 5.609l-.579-.939-1.068.812-.076.094a4.373 4.373 0 0 1 .554 1.9l.009.24A4.382 4.382 0 0 1 7.913 12.1a4.382 4.382 0 0 1-4.378-4.378A4.382 4.382 0 0 1 7.913 3.338c.554 0 1.085.103 1.571.291l.088.04V2.2l-.208-.065A5.557 5.557 0 0 0 7.913 1.9 5.536 5.536 0 0 0 1.784 7.722a6.129 6.129 0 0 0 6.129 6.128c3.382 0 6.128-2.746 6.128-6.128a6.09 6.09 0 0 0-.995-3.367l-.006-.01z"/><path d="M10.5 1.5L8.25 5h4.5L10.5 1.5z"/></svg>
          </button>
        </div>
      </header>

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
            <span class="stat-value mono">${data.noData ? '—' : data.unlimited ? '∞' : String(data.quota - data.used)}</span>
            <span class="stat-label">Remaining</span>
          </div>
          <div class="stat-item${pacingPerDay !== null && pacingPerDay <= 5 ? ' warn-bg' : ''}">
            <span class="stat-value mono">${pacingPerDay !== null ? `~${pacingPerDay}/day` : '—'}</span>
            <span class="stat-label">Daily Budget</span>
          </div>
          ${data.overageEnabled && data.overageUsed > 0 ? `
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

      ${renderBillingSection(model.billing, config)}
      ${renderRequestBreakdownSection(model.billing, config)}

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
        </div>
      </section>

      <footer class="footer">
        <div class="footer-left">
          <span class="muted">Updated ${esc(updatedStr)}</span>
          <span class="dot">·</span>
          ${pacingPerDay !== null ? `<span class="muted">~${pacingPerDay} req/day to stay on pace</span><span class="dot">·</span>` : ''}
          <a href="https://github.com/settings/billing/premium_requests_usage">View on GitHub</a>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="disconnect">Disconnect</button>
      </footer>
    </main>
  `;

  bindActions();
  bindSettings();
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
        <p class="muted">Sign in with GitHub to track your premium request usage.</p>
        <button class="btn btn-primary" data-action="signIn">Sign in with GitHub</button>
      </div>
    </main>
  `;
  bindActions();
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
  const pctUsed = quota.entitlement > 0 ? Math.round((used / quota.entitlement) * 100) : 0;
  return `
    <div class="quota-card">
      <div class="quota-header">
        <div class="quota-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="${iconPath}"/></svg></div>
        <h3 class="quota-title">${esc(title)}</h3>
      </div>
      <span class="quota-value mono">${used} <span class="muted">/ ${quota.entitlement}</span></span>
      ${renderQuotaBar(Math.min(pctUsed, 100) / 100, false)}
      <span class="quota-sub muted">${quota.remaining} remaining · ${pctUsed}% used</span>
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

function renderBillingSection(billing: BillingDataSerialized | null, config: ConfigSerialized): string {
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
        <span class="overage-icon">$(warning)</span>
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

function renderRequestBreakdownSection(billing: BillingDataSerialized | null, config: ConfigSerialized): string {
  if (!config.showBillingRequestBreakdown) {
    return '';
  }

  if (!billing) {
    return `
      <section class="card billing-card">
        <h2 class="card-title">Requests by Model</h2>
        <div class="billing-grant-access">
          <p class="muted">Requests by Model uses the same GitHub billing usage endpoint. Grant access to view per-model request counts even when billed overage is still $0.00.</p>
          <button class="btn btn-primary btn-sm" data-action="grantBillingAccess">Grant Access</button>
        </div>
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