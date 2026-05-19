import * as vscode from 'vscode';

import { fetchCreditsAggregate, sessionsToCreditsAggregate } from './billing/creditsData';
import { isPreviewMode, planInfoFromUsage, resolveView } from './billing/modeResolver';
import { loadPricing } from './billing/pricing';
import { getConfig } from './core/config';
import type { BillingData, BillingView, ChatSession, CreditsAggregate, DetailViewModel, ExtensionConfig, PlanInfo, TopSessionSummary, UsageData } from './core/models';
import * as auth from './github/auth';
import { fetchBillingUsage, fetchUsage } from './github/usageReports';
import { getWorkspaceStorageRoots } from './logs/discovery';
import { SessionCache } from './logs/cache';
import { buildSessions } from './logs/sessionBuilder';
import { LogWatcher } from './logs/watcher';
import { DetailPanel } from './ui/detailPanel';
import { StatusBar } from './ui/statusBar';

const CONFIG_SECTION = 'copilotUsageInsights';
const RECOVERY_INTERVAL_MS = 10_000;

let statusBar: StatusBar;
let detailPanel: DetailPanel;
let output: vscode.LogOutputChannel;
let globalState: vscode.Memento;
let sessionCache: SessionCache;
let logWatcher: LogWatcher;

let lastData: UsageData | null = null;
let lastBillingData: BillingData | null = null;
let lastCreditsAggregate: CreditsAggregate | null = null;
let lastSessions: ChatSession[] = [];
let lastUpdatedAt: Date | null = null;
let refreshInFlight = false;
let pendingSignIn = false;
let isOffline = false;
let deactivated = false;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
let recoveryActive = false;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  deactivated = false;
  globalState = context.globalState;
  loadPricing(context);
  output = vscode.window.createOutputChannel('Copilot Usage Insights', { log: true });
  statusBar = new StatusBar();
  sessionCache = new SessionCache(context);
  logWatcher = new LogWatcher();
  detailPanel = new DetailPanel(context.extensionUri, {
    refresh: () => refresh(false, true),
    disconnect: () => doDisconnect(),
    signIn: () => refresh(true, true),
    openSettings: () => void vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION),
    grantBillingAccess: async () => {
      const session = await auth.getBillingSession(globalState, true);
      if (session) {
        void refresh(false, true);
      }
    },
    setBillingView: async (view: string) => {
      if (view !== 'auto' && view !== 'premium-requests' && view !== 'ai-credits') { return; }
      await vscode.workspace.getConfiguration(CONFIG_SECTION).update('billingView', view, vscode.ConfigurationTarget.Global);
      void refresh(false, true);
    },
    enableAgentDebugLog: async () => {
      await vscode.workspace
        .getConfiguration()
        .update('github.copilot.chat.agentDebugLog.fileLogging.enabled', true, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage('Copilot agent debug logging enabled for future sessions.');
      void refresh(false, true);
    },
    openSessionSource: openSessionSource,
    rebuildSessionCache: async () => {
      await sessionCache.clear();
      void refresh(false, true);
    },
    updateSetting: (key: string, value: unknown) => {
      const allowedKeys = [
        'refreshIntervalMinutes',
        'billingView',
        'threshold.enabled',
        'threshold.warning',
        'threshold.critical',
        'statusBarTextMode',
        'statusBarGraphicMode',
        'statusBarTextPosition',
        'statusBar.creditsFormat',
        'segmentedBarWidth',
        'showBillingDetails',
        'showBillingRequestBreakdown',
        'showCostInStatusBar',
        'localLogs.enabled',
        'localLogs.includeInsiders',
        'localLogs.lookbackDays',
      ];
      if (!allowedKeys.includes(key)) { return; }
      const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
      void cfg.update(key, value, vscode.ConfigurationTarget.Global);
    },
  });

  context.subscriptions.push(
    output,
    statusBar,
    detailPanel,
    logWatcher,
    logWatcher.onSessionChanged(() => {
      if (lastData && getResolvedBillingView(lastData, getConfig()) === 'ai-credits') {
        void refresh(false, false);
      }
    }),
    vscode.commands.registerCommand('copilotUsageInsights.signIn', () => refresh(true, true)),
    vscode.commands.registerCommand('copilotUsageInsights.refresh', () => refresh(false, true)),
    vscode.commands.registerCommand('copilotUsageInsights.openDetails', () => {
      detailPanel.show(getDetailViewModel());
    }),
    vscode.commands.registerCommand('copilotUsageInsights.disconnect', () => doDisconnect()),
    vscode.commands.registerCommand('copilotUsageInsights.toggleBillingView', () => toggleBillingView()),
    vscode.commands.registerCommand('copilotUsageInsights.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION),
    ),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        resetTimer();
        resetLogWatcher();
        void refresh();
      }
    }),
    new vscode.Disposable(() => {
      clearTimer();
      clearRecoveryTimer();
    }),
  );

  // Show loading immediately so the status bar item is visible while cache builds
  statusBar.showLoading();

  // First refresh — resolve any existing session silently without prompting on startup
  resetLogWatcher();
  await refresh();
  resetTimer();
}

export function deactivate(): void {
  deactivated = true;
  isOffline = false;
  clearTimer();
  clearRecoveryTimer();
}

// ---------------------------------------------------------------------------
// Core refresh logic
// ---------------------------------------------------------------------------

async function refresh(promptSignIn = false, isManual = false): Promise<void> {
  if (deactivated) { return; }
  if (promptSignIn) { pendingSignIn = true; }
  if (refreshInFlight) { return; }

  const doSignIn = pendingSignIn;
  pendingSignIn = false;
  refreshInFlight = true;
  if (isManual) { statusBar.showLoading(); }

  try {
    const session = await auth.getSession(globalState, doSignIn);
    if (!session) {
      isOffline = false;
      statusBar.showSignIn();
      return;
    }

    const data = await fetchUsage(session.accessToken);
    lastData = data;
    lastUpdatedAt = new Date();
    isOffline = false;
    clearRecoveryTimer();

    // Persist login
    await globalState.update('copilotUsage.login', session.account.label);

    const config = getConfig();
    const plan = planInfoFromUsage(data);
    const activeBillingView = resolveView(plan, config.billingView);

    if (activeBillingView === 'ai-credits') {
      await refreshCreditsData(session, config, plan, doSignIn);
      lastBillingData = null;
    } else {
      lastCreditsAggregate = null;
      lastSessions = [];
    }

    const needsBillingData = activeBillingView === 'premium-requests'
      && !data.isManagedPlan
      && (config.showBillingDetails || config.showBillingRequestBreakdown || config.showCostInStatusBar);
    if (needsBillingData) {
      try {
        const billingSession = await auth.getBillingSession(globalState, doSignIn);
        if (billingSession) {
          lastBillingData = await fetchBillingUsage(billingSession.accessToken, session.account.label);
        } else {
          lastBillingData = null;
        }
      } catch (billingErr: unknown) {
        const billingMsg = (billingErr as { message?: string })?.message ?? 'Unknown billing error';
        output.warn(`Billing fetch failed (non-blocking): ${billingMsg}`);
        lastBillingData = null;
      }
    } else {
      lastBillingData = null;
    }

    output.info(`Usage fetched: plan=${data.plan} used=${data.used}/${data.quota} (${data.usedPct}%)`);
    updateStatusBar(data);
    detailPanel.update(getDetailViewModel());
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const message = (err as { message?: string })?.message ?? 'Unknown error';
    output.warn(`Refresh error: [${code}] ${message}`);

    // Non-network errors mean we're online
    if (code !== 'NETWORK_ERROR' && code !== 'TIMEOUT') {
      isOffline = false;
      clearRecoveryTimer();
    }

    if (code === 'AUTH') {
      statusBar.showSignIn();
    } else if (code === 'FORBIDDEN') {
      statusBar.showError('Access denied — check Copilot subscription');
    } else if (code === 'RATE_LIMIT') {
      if (lastData) {
        const config = getConfig();
        const activeBillingView = getResolvedBillingView(lastData, config);
        const topSessions = activeBillingView === 'ai-credits' ? getTopSessions(lastSessions, lastCreditsAggregate) : undefined;
        statusBar.showData(lastData, config, lastUpdatedAt, false, true, lastBillingData, activeBillingView, lastCreditsAggregate, activeBillingView === 'ai-credits' && isPreviewMode(), lastData.plan, topSessions);
      } else {
        statusBar.showError('Rate limited');
      }
    } else if (code === 'SERVER_ERROR') {
      statusBar.showError('API error (5xx)');
    } else if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') {
      if (!isOffline) {
        isOffline = true;
        startRecoveryTimer();
      }
      if (lastData) {
        updateStatusBar(lastData);
      } else {
        statusBar.showOffline();
      }
    } else {
      statusBar.showError('Network / API error');
    }
  } finally {
    refreshInFlight = false;
    if (pendingSignIn) {
      setTimeout(() => refresh(), 0);
    }
  }
}

function getTopSessions(sessions: ChatSession[], credits: CreditsAggregate | null): TopSessionSummary[] {
  if (!credits) { return []; }
  const cycleStart = new Date(credits.cycleStart).getTime();
  const cycleEnd = new Date(credits.cycleEnd).getTime();
  return sessions
    .filter(s => s.lastTurnAt >= cycleStart && s.lastTurnAt < cycleEnd)
    .sort((a, b) => b.estimatedCredits - a.estimatedCredits)
    .slice(0, 3)
    .map(s => ({
      workspaceShort: s.workspaceName.length > 20 ? s.workspaceName.slice(0, 18) + '…' : s.workspaceName,
      lastTurnAt: s.lastTurnAt,
      estimatedCredits: s.estimatedCredits,
    }));
}

function updateStatusBar(data: UsageData): void {
  const config = getConfig();
  const activeBillingView = getResolvedBillingView(data, config);
  const topSessions = activeBillingView === 'ai-credits' ? getTopSessions(lastSessions, lastCreditsAggregate) : undefined;
  statusBar.showData(
    data,
    config,
    lastUpdatedAt,
    isOffline,
    false,
    lastBillingData,
    activeBillingView,
    lastCreditsAggregate,
    activeBillingView === 'ai-credits' && isPreviewMode(),
    data.plan,
    topSessions,
  );
}

async function doDisconnect(): Promise<void> {
  await auth.disconnect(globalState);
  lastData = null;
  lastBillingData = null;
  lastCreditsAggregate = null;
  lastSessions = [];
  lastUpdatedAt = null;
  statusBar.showSignIn();
  detailPanel.update(getDetailViewModel());
  void vscode.window.showInformationMessage('GitHub account disconnected.');
}

function getDetailViewModel(): DetailViewModel {
  const config = getConfig();
  const activeBillingView = lastData ? getResolvedBillingView(lastData, config) : 'premium-requests';
  return {
    data: lastData,
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    isOffline,
    login: auth.getLogin(globalState) ?? null,
    config,
    activeBillingView,
    isCreditsPreview: activeBillingView === 'ai-credits' && isPreviewMode(),
    credits: activeBillingView === 'ai-credits' ? lastCreditsAggregate : null,
    sessions: activeBillingView === 'ai-credits' ? lastSessions : [],
    agentDebugLogEnabled: isAgentDebugLogEnabled(),
    billing: lastBillingData,
  };
}

async function refreshCreditsData(
  session: vscode.AuthenticationSession,
  config: ExtensionConfig,
  plan: PlanInfo,
  interactiveAuth: boolean,
): Promise<void> {
  if (config.localLogsEnabled) {
    try {
      lastSessions = await buildSessions(sessionCache, config.localLogsLookbackDays, config.localLogsIncludeInsiders);
    } catch (error: unknown) {
      output.warn(`Local session parsing failed: ${(error as { message?: string })?.message ?? 'Unknown error'}`);
      lastSessions = [];
    }
  } else {
    lastSessions = [];
  }

  let official: CreditsAggregate | null = null;
  try {
    const billingSession = await auth.getBillingSession(globalState, interactiveAuth);
    if (billingSession) {
      official = await fetchCreditsAggregate(billingSession.accessToken, session.account.label, plan.creditsAllowance);
    }
  } catch (error: unknown) {
    output.warn(`Credits fetch failed (non-blocking): ${(error as { message?: string })?.message ?? 'Unknown credits error'}`);
  }

  lastCreditsAggregate = official ?? (config.localLogsEnabled
    ? sessionsToCreditsAggregate(lastSessions, plan.creditsAllowance)
    : null);
}

function getResolvedBillingView(data: UsageData, config: ExtensionConfig): BillingView {
  return resolveView(planInfoFromUsage(data), config.billingView);
}

async function openSessionSource(sessionId: string): Promise<void> {
  const session = lastSessions.find(item => item.id === sessionId);
  if (!session) {
    void vscode.window.showWarningMessage('Session source log is no longer available. Refresh and try again.');
    return;
  }

  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(session.filePath));
    await vscode.window.showTextDocument(document, { preview: true, preserveFocus: false });
  } catch (error: unknown) {
    const message = (error as { message?: string })?.message ?? 'Unknown error';
    output.warn(`Unable to open session source log: ${message}`);
    void vscode.window.showWarningMessage('Unable to open the session source log. It may have been moved or deleted.');
  }
}

async function toggleBillingView(): Promise<void> {
  const config = getConfig();
  const nextView = config.billingView === 'auto'
    ? 'ai-credits'
    : config.billingView === 'ai-credits'
      ? 'premium-requests'
      : 'auto';
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update('billingView', nextView, vscode.ConfigurationTarget.Global);
  void refresh(false, true);
}

function resetLogWatcher(): void {
  const config = getConfig();
  if (!config.localLogsEnabled) {
    logWatcher.start([]);
    return;
  }
  logWatcher.start(getWorkspaceStorageRoots(config.localLogsIncludeInsiders).map(root => root.root));
}

function isAgentDebugLogEnabled(): boolean {
  return vscode.workspace
    .getConfiguration()
    .get<boolean>('github.copilot.chat.agentDebugLog.fileLogging.enabled', false);
}

// ---------------------------------------------------------------------------
// Timer management
// ---------------------------------------------------------------------------

function resetTimer(): void {
  if (recoveryActive) { return; }
  clearTimer();
  const { refreshIntervalMinutes } = getConfig();
  const ms = refreshIntervalMinutes * 60 * 1000;
  refreshTimer = setInterval(() => refresh(), ms);
}

function clearTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}

function startRecoveryTimer(): void {
  if (recoveryActive) { return; }
  clearTimer();
  recoveryActive = true;
  scheduleNextRecovery();
}

function scheduleNextRecovery(): void {
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = undefined;
    if (!recoveryActive || !isOffline) {
      clearRecoveryTimer();
      return;
    }
    await refresh().catch(() => {});
    if (recoveryActive) { scheduleNextRecovery(); }
  }, RECOVERY_INTERVAL_MS);
}

function clearRecoveryTimer(): void {
  if (!recoveryActive) { return; }
  recoveryActive = false;
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = undefined;
  }
  if (!deactivated) { resetTimer(); }
}