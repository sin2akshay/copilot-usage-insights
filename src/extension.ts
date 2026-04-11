import * as vscode from 'vscode';

import { getConfig } from './core/config';
import type { DetailViewModel, UsageData } from './core/models';
import * as auth from './github/auth';
import { fetchRawJson, fetchUsage } from './github/usageReports';
import { DetailPanel } from './ui/detailPanel';
import { StatusBar } from './ui/statusBar';

const CONFIG_SECTION = 'copilotUsageInsights';
const RECOVERY_INTERVAL_MS = 10_000;

let statusBar: StatusBar;
let detailPanel: DetailPanel;
let output: vscode.LogOutputChannel;
let globalState: vscode.Memento;

let lastData: UsageData | null = null;
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
  output = vscode.window.createOutputChannel('Copilot Usage Insights', { log: true });
  statusBar = new StatusBar();
  detailPanel = new DetailPanel(context.extensionUri, {
    refresh: () => refresh(false, true),
    disconnect: () => doDisconnect(),
    signIn: () => refresh(true, true),
    openSettings: () => void vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION),
  });

  context.subscriptions.push(
    output,
    statusBar,
    detailPanel,
    vscode.commands.registerCommand('copilotUsageInsights.signIn', () => refresh(true, true)),
    vscode.commands.registerCommand('copilotUsageInsights.refresh', () => refresh(false, true)),
    vscode.commands.registerCommand('copilotUsageInsights.openDetails', () => {
      detailPanel.show(getDetailViewModel());
    }),
    vscode.commands.registerCommand('copilotUsageInsights.disconnect', () => doDisconnect()),
    vscode.commands.registerCommand('copilotUsageInsights.debugDumpApiResponse', () => dumpApiResponse()),
    vscode.commands.registerCommand('copilotUsageInsights.openSettings', () =>
      vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION),
    ),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        resetTimer();
        void refresh();
      }
    }),
    new vscode.Disposable(() => {
      clearTimer();
      clearRecoveryTimer();
    }),
  );

  // First refresh — prompt for sign-in if no session exists
  await refresh(true);
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
        statusBar.showData(lastData, getConfig(), lastUpdatedAt, false, true);
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
      statusBar.showOffline(lastData);
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

function updateStatusBar(data: UsageData): void {
  statusBar.showData(data, getConfig(), lastUpdatedAt, isOffline);
}

async function doDisconnect(): Promise<void> {
  await auth.disconnect(globalState);
  lastData = null;
  lastUpdatedAt = null;
  statusBar.showSignIn();
  detailPanel.update(getDetailViewModel());
  void vscode.window.showInformationMessage('GitHub account disconnected.');
}

async function dumpApiResponse(): Promise<void> {
  const session = await auth.getSession(globalState, true);
  if (!session) {
    void vscode.window.showWarningMessage('Sign in first to dump the API response.');
    return;
  }
  const raw = await fetchRawJson(session.accessToken);
  const json = JSON.stringify(raw, null, 2);
  const doc = await vscode.workspace.openTextDocument({ language: 'json', content: json });
  await vscode.window.showTextDocument(doc, { preview: true });
}

function getDetailViewModel(): DetailViewModel {
  return {
    data: lastData,
    lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    isOffline,
    login: auth.getLogin(globalState) ?? null,
  };
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