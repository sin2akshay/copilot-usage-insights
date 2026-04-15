import * as vscode from 'vscode';

import type { BillingData, ExtensionConfig, UsageData } from '../core/models';

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
      this.showData(lastData, { refreshIntervalMinutes: 5, thresholdEnabled: false, thresholdWarning: 75, thresholdCritical: 90, statusBarTextMode: 'percent', statusBarGraphicMode: 'none', statusBarTextPosition: 'left', segmentedBarWidth: 8, showBillingDetails: false, showCostInStatusBar: false }, null, true);
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
    billing: BillingData | null = null,
  ): void {
    const isStale = isOffline;
    const staleIcon = isStale ? ' $(warning)' : '';

    if (data.noData) {
      this.item.text = `\u2014${staleIcon}`;
      this.item.tooltip = this.buildTooltip(data, lastUpdatedAt, isRateLimited, isStale, billing);
      this.item.command = 'copilotUsageInsights.openDetails';
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      return;
    }

    if (data.unlimited) {
      this.item.text = `\u221e${staleIcon}`;
      this.item.tooltip = this.buildTooltip(data, lastUpdatedAt, isRateLimited, isStale, billing);
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

    let text = renderStatusBarText(data, pct, config, billing);
    // Cost suffix: append billed/net cost when showCostInStatusBar is enabled
    if (config.showCostInStatusBar && billing && config.statusBarTextMode !== 'billedOnly') {
      text += ` \u00b7 $${billing.totalNet.toFixed(2)}`;
    }

    this.item.text = `${text}${staleIcon}`;
    this.item.tooltip = this.buildTooltip(data, lastUpdatedAt, isRateLimited, isStale, billing);
    this.item.command = 'copilotUsageInsights.openDetails';
    this.item.color = color;
    this.item.backgroundColor = undefined;
  }

  private buildTooltip(
    data: UsageData,
    lastUpdatedAt: Date | null,
    isRateLimited: boolean,
    isStale: boolean,
    billing: BillingData | null = null,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: ['copilotUsageInsights.refresh', 'copilotUsageInsights.openDetails'] };
    md.supportHtml = true;

    // ── Header
    md.appendMarkdown(`**$(copilot) Copilot Usage** &nbsp;·&nbsp; ${escapeMarkdown(data.plan)}\n\n`);
    md.appendMarkdown('---\n\n');

    // ── Premium requests
    if (data.unlimited) {
      md.appendMarkdown('$(star)&ensp;Premium: **Unlimited**\n\n');
    } else if (data.noData) {
      md.appendMarkdown('$(star)&ensp;Premium: **—**\n\n');
    } else {
      const remaining = Math.max(0, data.quota - data.used);
      md.appendMarkdown(`$(star)&ensp;**${data.used}** / ${data.quota} used &nbsp;·&nbsp; **${remaining}** remaining\n\n`);

      if (data.overageEnabled && data.overageUsed > 0) {
        md.appendMarkdown(`$(warning)&ensp;Overage: **${data.overageUsed}** extra requests\n\n`);
      }
    }

    // ── Chat & completions
    const chatStr = data.chatQuota
      ? (data.chatQuota.unlimited ? 'Unlimited' : `${data.chatQuota.remaining} left`)
      : '—';
    const compStr = data.completionsQuota
      ? (data.completionsQuota.unlimited ? 'Unlimited' : `${data.completionsQuota.remaining} left`)
      : '—';
    md.appendMarkdown(`$(comment)&ensp;Chat: ${chatStr} &nbsp;&nbsp; $(code)&ensp;Completions: ${compStr}\n\n`);

    md.appendMarkdown('---\n\n');

    // ── Pacing & reset
    if (!data.unlimited && !data.noData) {
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((data.resetDate.getTime() - now.getTime()) / 86_400_000));
      const remaining = Math.max(0, data.quota - data.used);
      const resetStr = data.resetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      if (daysLeft > 0) {
        const pace = Math.floor(remaining / daysLeft);
        md.appendMarkdown(`$(dashboard)&ensp;**~${pace}** req/day to last until **${resetStr}** &nbsp;(${daysLeft}d left)\n\n`);
      } else {
        md.appendMarkdown(`$(calendar)&ensp;Resets **${resetStr}**\n\n`);
      }
    }

    // ── Requests by model (top 5)
    if (billing && billing.items.length > 0) {
      const sorted = [...billing.items].sort((a, b) => b.grossQuantity - a.grossQuantity);
      const top5 = sorted.slice(0, 5);
      md.appendMarkdown('---\n\n');
      md.appendMarkdown('**Requests by model**\n\n');
      md.appendMarkdown('| Model | Requests |\n|---|---:|\n');
      for (const item of top5) {
        const qty = item.grossQuantity % 1 === 0 ? String(item.grossQuantity) : item.grossQuantity.toFixed(1);
        md.appendMarkdown(`| ${escapeMarkdown(item.model)} | ${qty} |\n`);
      }
      md.appendMarkdown('\n');

      // ── Value / billed block (only when overage)
      if (billing.totalNet > 0) {
        md.appendMarkdown(`$(alert)&ensp;Billed: **+$${billing.totalNet.toFixed(2)}** &nbsp;·&nbsp; Gross: $${billing.totalGross.toFixed(2)}\n\n`);
      }
    }

    // ── Updated + actions
    if (lastUpdatedAt) {
      md.appendMarkdown(`$(clock)&ensp;${formatTimestamp(lastUpdatedAt)}`);
    }
    md.appendMarkdown(
      ` &nbsp; [$(refresh)](command:copilotUsageInsights.refresh "Refresh")`
      + ` &nbsp; [$(open-preview)](command:copilotUsageInsights.openDetails "Open Dashboard")`,
    );

    if (isRateLimited) {
      md.appendMarkdown('\n\n$(alert)&ensp;Rate limited · data may be stale');
    }
    if (isStale) {
      md.appendMarkdown('\n\n$(alert)&ensp;Offline · data may be stale');
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

export function renderStatusBarText(data: UsageData, pct: number, config: ExtensionConfig, billing: BillingData | null = null): string {
  const w = config.segmentedBarWidth;
  const remaining = Math.max(0, data.quota - data.used);

  // Text part
  let textPart = '';
  switch (config.statusBarTextMode) {
    case 'count':        textPart = `${data.used}/${data.quota}`; break;
    case 'percent':      textPart = `${pct}%`; break;
    case 'countPercent': textPart = `${data.used}/${data.quota} (${pct}%)`; break;
    case 'remaining':    textPart = `${remaining} left`; break;
    case 'billedOnly':   textPart = `+$${billing ? billing.totalNet.toFixed(2) : '0.00'}`; break;
    case 'none': default: textPart = ''; break;
  }

  // Graphic part
  let graphicPart = '';
  switch (config.statusBarGraphicMode) {
    case 'segmented':   graphicPart = progressMeter(pct, w, { filled: '■', empty: '□', prefix: '[', suffix: ']' }); break;
    case 'blocks':      graphicPart = progressMeter(pct, w, { filled: '█', empty: '░' }); break;
    case 'thinBlocks':  graphicPart = progressMeter(pct, w, { filled: '▰', empty: '▱' }); break;
    case 'dots':        graphicPart = progressMeter(pct, w, { filled: '•', empty: '·' }); break;
    case 'circles':     graphicPart = progressMeter(pct, w, { filled: '●', empty: '○' }); break;
    case 'braille':     graphicPart = progressMeter(pct, w, { filled: '⣿', empty: '⣀' }); break;
    case 'rectangles':  graphicPart = progressMeter(pct, w, { filled: '▮', empty: '▯' }); break;
    case 'none': default: graphicPart = ''; break;
  }

  // Both none — safety fallback (should be prevented by config validation)
  if (!textPart && !graphicPart) { return `${pct}%`; }

  if (!textPart) { return graphicPart; }
  if (!graphicPart) { return textPart; }

  return config.statusBarTextPosition === 'right'
    ? `${graphicPart} ${textPart}`
    : `${textPart} ${graphicPart}`;
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