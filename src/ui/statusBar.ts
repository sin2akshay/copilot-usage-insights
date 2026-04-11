import * as vscode from 'vscode';

import type { ExtensionConfig, StatusBarMode, UsageData } from '../core/models';

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
    md.isTrusted = { enabledCommands: ['copilotUsageInsights.refresh', 'copilotUsageInsights.openDetails'] };
    md.supportHtml = true;

    // ── Header
    md.appendMarkdown(`**$(copilot) Copilot Usage** &nbsp;·&nbsp; ${escapeMarkdown(data.plan)}\n\n`);
    md.appendMarkdown('---\n\n');

    // ── Premium requests
    if (data.unlimited) {
      md.appendMarkdown('$(star)&ensp;Premium Requests: **Unlimited**\n\n');
    } else if (data.noData) {
      md.appendMarkdown('$(star)&ensp;Premium Requests: **—**\n\n');
    } else {
      const remaining = Math.max(0, data.quota - data.used);
      const barWidth = 20;
      const filled = Math.max(0, Math.round((data.usedPct / 100) * barWidth));
      const empty = barWidth - filled;
      const bar = '▮'.repeat(filled) + '▯'.repeat(empty);

      md.appendMarkdown(`$(star)&ensp;**${data.used}** / ${data.quota} &nbsp;used&ensp;·&ensp;**${remaining}** remaining\n\n`);
      md.appendMarkdown(`\`${bar}\` &nbsp;${data.usedPct}%\n\n`);

      if (data.overageEnabled && data.overageUsed > 0) {
        md.appendMarkdown(`$(warning)&ensp;Overage: **${data.overageUsed}** requests beyond quota\n\n`);
      }
    }

    // ── Chat & completions (compact)
    const chatStr = data.chatQuota
      ? (data.chatQuota.unlimited ? 'Unlimited' : `${data.chatQuota.remaining} left`)
      : '—';
    const compStr = data.completionsQuota
      ? (data.completionsQuota.unlimited ? 'Unlimited' : `${data.completionsQuota.remaining} left`)
      : '—';
    md.appendMarkdown(`$(comment)&ensp;Chat: ${chatStr} &nbsp;&nbsp; $(code)&ensp;Completions: ${compStr}\n\n`);

    md.appendMarkdown('---\n\n');

    // ── Reset date
    if (!data.unlimited && !data.noData) {
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((data.resetDate.getTime() - now.getTime()) / 86_400_000));
      const resetStr = data.resetDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      md.appendMarkdown(`$(calendar)&ensp;Resets **${resetStr}** &nbsp;(${daysLeft}d)\n\n`);
    }

    // ── Updated + actions
    if (lastUpdatedAt) {
      md.appendMarkdown(`$(clock)&ensp;${formatTimestamp(lastUpdatedAt)}`);
    }
    md.appendMarkdown(
      ` &nbsp; [$(refresh)&ensp;Refresh](command:copilotUsageInsights.refresh)`
      + ` &nbsp; [$(dashboard)&ensp;Dashboard](command:copilotUsageInsights.openDetails)`,
    );

    if (isRateLimited) {
      md.appendMarkdown('\n\n$(alert)&ensp;Rate limited · data may be outdated');
    }
    if (isStale) {
      md.appendMarkdown('\n\n$(alert)&ensp;Offline · data may be outdated');
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

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}