import * as vscode from 'vscode';

import type { ExtensionConfig, StatusBarMode, UsageData } from '../core/models';

const BILLING_URL = 'https://github.com/settings/billing/premium_requests_usage';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      'copilotUsageInsights.statusBar',
      vscode.StatusBarAlignment.Right,
      100.099999, // adjacent to the Copilot icon (priority 100.1)
    );
    this.item.name = 'Copilot Usage Insights';
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }

  showSignIn(): void {
    this.item.text = '$(copilot) Sign in';
    this.item.command = 'copilotUsageInsights.signIn';
    this.item.tooltip = 'Click to sign in with GitHub';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
  }

  showLoading(): void {
    this.item.text = '$(sync~spin)';
    this.item.tooltip = 'Loading Copilot usage…';
    this.item.command = 'copilotUsageInsights.openDetails';
    this.item.color = undefined;
    this.item.backgroundColor = undefined;
  }

  showError(message: string): void {
    this.item.text = '$(error)';
    this.item.tooltip = `Copilot Usage: ${message}`;
    this.item.command = 'copilotUsageInsights.openDetails';
    this.item.color = new vscode.ThemeColor('editorError.foreground');
    this.item.backgroundColor = undefined;
  }

  showOffline(lastData: UsageData | null): void {
    if (lastData) {
      this.showData(lastData, { refreshIntervalMinutes: 5, thresholdEnabled: false, thresholdWarning: 75, thresholdCritical: 90, statusBarMode: 'percent', segmentedBarWidth: 8 }, null, true);
    } else {
      this.item.text = '$(alert)';
      this.item.tooltip = 'Copilot Usage: Offline';
      this.item.command = 'copilotUsageInsights.openDetails';
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
    }
  }

  showData(
    data: UsageData,
    config: ExtensionConfig,
    lastUpdatedAt: Date | null,
    isOffline = false,
    isRateLimited = false,
  ): void {
    const isStale = isOffline;
    const staleIcon = isStale ? ' $(warning)' : '';

    if (data.noData) {
      this.item.text = `\u2014${staleIcon}`;
      this.item.tooltip = this.buildTooltip(data, lastUpdatedAt, isRateLimited, isStale);
      this.item.command = 'copilotUsageInsights.openDetails';
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      return;
    }

    if (data.unlimited) {
      this.item.text = `\u221e${staleIcon}`;
      this.item.tooltip = this.buildTooltip(data, lastUpdatedAt, isRateLimited, isStale);
      this.item.command = 'copilotUsageInsights.openDetails';
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      return;
    }

    const pct = computeDisplayPct(data);
    let color: vscode.ThemeColor | undefined;
    if (config.thresholdEnabled) {
      if (pct >= config.thresholdCritical) {
        color = new vscode.ThemeColor('editorError.foreground');
      } else if (pct >= config.thresholdWarning) {
        color = new vscode.ThemeColor('editorWarning.foreground');
      }
    }

    this.item.text = `${renderStatusBarText(data, pct, config)}${staleIcon}`;
    this.item.tooltip = this.buildTooltip(data, lastUpdatedAt, isRateLimited, isStale);
    this.item.command = 'copilotUsageInsights.openDetails';
    this.item.color = color;
    this.item.backgroundColor = undefined;
  }

  private buildTooltip(
    data: UsageData,
    lastUpdatedAt: Date | null,
    isRateLimited: boolean,
    isStale: boolean,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: ['copilotUsageInsights.refresh'] };
    md.appendMarkdown('**GitHub Copilot Usage**\n\nPlan: ');
    md.appendText(data.plan);
    md.appendMarkdown('\n\n');

    if (data.unlimited) {
      md.appendMarkdown(`Quota: Unlimited &nbsp;[$(graph)](${BILLING_URL})\n\n`);
    } else if (data.noData) {
      md.appendMarkdown(`No premium quota &nbsp;[$(graph)](${BILLING_URL})\n\n`);
    } else {
      md.appendMarkdown(
        `Used: ${data.used} / ${data.quota} (${data.usedPct}%) &nbsp;[$(graph)](${BILLING_URL})\n\n`,
      );
      if (data.overageEnabled && data.overageUsed > 0) {
        md.appendMarkdown(`Overage: ${data.overageUsed} requests\n\n`);
      }
      const resetStr = data.resetDate.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      md.appendMarkdown('Reset: ');
      md.appendText(resetStr);
      md.appendMarkdown('\n\n');
    }

    if (lastUpdatedAt) {
      md.appendMarkdown(`Updated at ${formatTimestamp(lastUpdatedAt)} `);
    }
    md.appendMarkdown('[$(refresh)](command:copilotUsageInsights.refresh)');

    if (isRateLimited) {
      md.appendMarkdown('\n\nRate limit \u00b7 data may be outdated');
    }
    if (isStale) {
      md.appendMarkdown('\n\nOffline \u00b7 data may be outdated');
    }

    return md;
  }
}

export function computeDisplayPct(data: UsageData): number {
  if (data.overageEnabled && data.overageUsed > 0 && data.quota > 0) {
    return Math.round(100 + (data.overageUsed / data.quota) * 100);
  }
  return data.usedPct;
}

export function renderStatusBarText(data: UsageData, pct: number, config: ExtensionConfig): string {
  const mode: StatusBarMode = config.statusBarMode;
  const w = config.segmentedBarWidth;
  const remaining = Math.max(0, data.quota - data.used);

  switch (mode) {
    case 'count':
      return `${data.used}/${data.quota}`;
    case 'percent':
      return `${pct}%`;
    case 'countPercent':
      return `${data.used}/${data.quota} (${pct}%)`;
    case 'remaining':
      return `${remaining} left`;
    case 'segmented':
      return `${progressMeter(pct, w, { filled: '■', empty: '□', prefix: '[', suffix: ']' })} ${pct}%`;
    case 'blocks':
      return `${progressMeter(pct, w, { filled: '█', empty: '░' })} ${pct}%`;
    case 'thinBlocks':
      return `${progressMeter(pct, w, { filled: '▰', empty: '▱' })} ${pct}%`;
    case 'dots':
      return `${progressMeter(pct, w, { filled: '•', empty: '·' })} ${pct}%`;
    case 'circles':
      return `${progressMeter(pct, w, { filled: '●', empty: '○' })} ${pct}%`;
    case 'hybrid':
      return `${data.used}/${data.quota} ${progressMeter(pct, w, { filled: '■', empty: '□', prefix: '[', suffix: ']' })}`;
    default:
      return `${pct}%`;
  }
}

function progressMeter(
  percent: number,
  width: number,
  options: { filled: string; empty: string; prefix?: string; suffix?: string },
): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * width)) : 0;
  const body = `${options.filled.repeat(filled)}${options.empty.repeat(Math.max(0, width - filled))}`;
  return `${options.prefix ?? ''}${body}${options.suffix ?? ''}`;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  if (sameDay) { return time; }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}