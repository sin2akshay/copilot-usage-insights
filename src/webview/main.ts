declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  setState(value: unknown): void;
  getState(): unknown;
};

type UsageDataSerialized = {
  used: number;
  quota: number;
  usedPct: number;
  unlimited: boolean;
  noData: boolean;
  overageEnabled: boolean;
  overageUsed: number;
  plan: string;
  resetDate: string; // ISO string from host
};

type DetailViewModelSerialized = {
  data: UsageDataSerialized | null;
  lastUpdatedAt: string | null;
  isOffline: boolean;
  login: string | null;
};

const vscode = acquireVsCodeApi();
const root = document.getElementById('app');

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

  const data = model.data;
  const login = model.login;
  const isConnected = !!login;
  const billingUrl = 'https://github.com/settings/billing/premium_requests_usage';

  if (!isConnected || !data) {
    root.innerHTML = `
      <main class="shell">
        <header class="hero">
          <div>
            <p class="eyebrow">Copilot Usage Insights</p>
            <h1>Not connected</h1>
            <p class="subtle">Sign in with GitHub to see your premium request usage.</p>
          </div>
          <div class="actions">
            <button data-action="signIn">Sign in with GitHub</button>
          </div>
        </header>
      </main>
    `;
    bindButtons();
    return;
  }

  const resetDate = data.resetDate ? new Date(data.resetDate) : null;
  const resetStr = resetDate
    ? resetDate.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  const updatedStr = model.lastUpdatedAt
    ? new Date(model.lastUpdatedAt).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  let usageDisplay: string;
  let usageSubtitle: string;

  if (data.noData) {
    usageDisplay = '—';
    usageSubtitle = 'No premium quota data available';
  } else if (data.unlimited) {
    usageDisplay = '∞';
    usageSubtitle = 'Unlimited premium requests';
  } else {
    usageDisplay = `${data.used} / ${data.quota}`;
    usageSubtitle = `${data.usedPct}% used`;
  }

  root.innerHTML = `
    <main class="shell">
      <header class="hero">
        <div>
          <p class="eyebrow">Copilot Usage Insights</p>
          <h1>${escapeHtml(usageDisplay)}</h1>
          <p class="subtle">${escapeHtml(usageSubtitle)} · Plan: ${escapeHtml(data.plan)} · ${escapeHtml(login)}</p>
        </div>
        <div class="actions">
          <button data-action="refresh">Refresh</button>
          <button data-action="openSettings">Settings</button>
        </div>
      </header>

      <section class="grid two-up">
        <section class="card accent">
          <h2>Premium Requests</h2>
          <div class="metric-grid">
            <div class="metric"><span>Used</span><strong>${data.noData ? '—' : data.unlimited ? '∞' : String(data.used)}</strong><small>${data.noData ? 'N/A' : data.unlimited ? 'Unlimited' : `of ${data.quota}`}</small></div>
            <div class="metric"><span>Usage</span><strong>${data.noData ? '—' : data.unlimited ? '∞' : `${data.usedPct}%`}</strong><small><a href="${escapeHtml(billingUrl)}">View on GitHub</a></small></div>
          </div>
          ${data.overageEnabled && data.overageUsed > 0 ? `<p class="note">Overage: ${data.overageUsed} additional requests beyond quota</p>` : ''}
        </section>

        <section class="card">
          <h2>Details</h2>
          <div class="metric-grid">
            <div class="metric"><span>Plan</span><strong>${escapeHtml(data.plan)}</strong></div>
            <div class="metric"><span>Resets</span><strong>${escapeHtml(resetStr)}</strong></div>
            <div class="metric"><span>Updated</span><strong>${escapeHtml(updatedStr)}</strong>${model.isOffline ? '<small>Offline · data may be stale</small>' : ''}</div>
            <div class="metric"><span>Account</span><strong>${escapeHtml(login)}</strong></div>
          </div>
        </section>
      </section>

      <section class="card">
        <div class="section-header">
          <h2>Account</h2>
          <div class="actions">
            <button data-action="disconnect">Disconnect</button>
          </div>
        </div>
        <p class="note">Signed in as ${escapeHtml(login)}. Disconnect to clear your session.</p>
      </section>
    </main>
  `;

  bindButtons();
}

function bindButtons(): void {
  if (!root) { return; }
  root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      vscode.postMessage({ type: button.dataset.action });
    });
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}