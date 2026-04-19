import * as vscode from 'vscode';

import type { BillingData, ExtensionConfig, UsageData } from '../core/models';

const PREMIUM_REQUEST_UNIT_PRICE = 0.04;

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
      this.showData(lastData, { refreshIntervalMinutes: 5, thresholdEnabled: false, thresholdWarning: 75, thresholdCritical: 90, statusBarTextMode: 'percent', statusBarGraphicMode: 'none', statusBarTextPosition: 'left', segmentedBarWidth: 8, showBillingDetails: false, showBillingRequestBreakdown: false, showCostInStatusBar: false }, null, true);
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
      this.item.tooltip = this.buildTooltip(data, config, lastUpdatedAt, isRateLimited, isStale, billing);
      this.item.command = 'copilotUsageInsights.openDetails';
      this.item.color = undefined;
      this.item.backgroundColor = undefined;
      return;
    }

    if (data.unlimited) {
      this.item.text = `\u221e${staleIcon}`;
      this.item.tooltip = this.buildTooltip(data, config, lastUpdatedAt, isRateLimited, isStale, billing);
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
    if (config.showCostInStatusBar && config.statusBarTextMode !== 'billedOnly') {
      const billedCost = getDisplayedBilledCost(data, billing);
      if (billedCost !== null) {
        text += ` \u00b7 $${billedCost.toFixed(2)}`;
      }
    }

    this.item.text = `${text}${staleIcon}`;
    this.item.tooltip = this.buildTooltip(data, config, lastUpdatedAt, isRateLimited, isStale, billing);
    this.item.command = 'copilotUsageInsights.openDetails';
    this.item.color = color;
    this.item.backgroundColor = undefined;
  }

  private buildTooltip(
    data: UsageData,
    config: ExtensionConfig,
    lastUpdatedAt: Date | null,
    isRateLimited: boolean,
    isStale: boolean,
    billing: BillingData | null = null,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = { enabledCommands: ['copilotUsageInsights.refresh', 'copilotUsageInsights.openDetails'] };
    md.supportHtml = true;

    md.appendMarkdown(`$(copilot) · **Copilot Usage** · ${escapeMarkdown(data.plan)}\n\n`);

    const chatStr = data.chatQuota
      ? (data.chatQuota.unlimited ? 'Unlimited' : `${formatQuantity(data.chatQuota.remaining)} left`)
      : '—';
    const compStr = data.completionsQuota
      ? (data.completionsQuota.unlimited ? 'Unlimited' : `${formatQuantity(data.completionsQuota.remaining)} left`)
      : '—';

    if (!data.unlimited && !data.noData) {
      const pct = computeDisplayPct(data);
      const remaining = data.remaining;
      const now = new Date();
      const daysLeft = Math.max(0, Math.ceil((data.resetDate.getTime() - now.getTime()) / 86_400_000));
      const resetStr = data.resetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const pace = daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0;
      const pctLabel = formatPercent(pct);

      const barWidth = 12;
      const barPct = Math.min(100, pct);
      const filled = barPct > 0 ? Math.max(1, Math.round((barPct / 100) * barWidth)) : 0;
      const empty = Math.max(0, barWidth - filled);
      const barColor = pct >= config.thresholdCritical ? '#f85149' : pct >= config.thresholdWarning ? '#d29922' : '#3794ff';
      md.appendMarkdown(
        `<span style="color:${barColor};">${'▰'.repeat(filled)}</span>`
        + `<span style="color:#585858;">${'▱'.repeat(empty)}</span>`
        + `\n\n`,
      );

      md.appendMarkdown(
        `$(star-empty) **${formatQuantity(data.used)} / ${formatQuantity(data.quota)}** used (**${pctLabel}%**) · **${formatQuantity(remaining)}** remaining\n\n`,
      );
      md.appendMarkdown(`$(comment-discussion) Chat: **${chatStr}** · $(code) Completions: **${compStr}**\n\n`);

      if (!data.isManagedPlan && data.overageEnabled && data.overageUsed > 0) {
        md.appendMarkdown(`$(warning) **${formatQuantity(data.overageUsed)}** over included quota\n\n`);
      }

      if (daysLeft > 0) {
        md.appendMarkdown(`$(dashboard) ~**${formatQuantity(pace)}/day** budget · resets **${resetStr}** (${daysLeft}d left)\n\n`);
      } else {
        md.appendMarkdown(`$(calendar) Resets **${resetStr}**\n\n`);
      }

      const billedCost = getDisplayedBilledCost(data, billing);
      if (data.isManagedPlan && billedCost !== null) {
        md.appendMarkdown(`$(tag) Estimated billed overage **+$${billedCost.toFixed(2)}**\n\n`);
      } else if (config.showBillingDetails && billing) {
        md.appendMarkdown(`$(tag) Value **$${billing.totalGross.toFixed(2)}** · billed **+$${billing.totalNet.toFixed(2)}**\n\n`);
      }
    } else if (data.unlimited) {
      md.appendMarkdown('$(star-empty) Premium requests: **Unlimited**\n\n');
      md.appendMarkdown(`$(comment-discussion) Chat: **${chatStr}** · $(code) Completions: **${compStr}**\n\n`);
    } else {
      md.appendMarkdown('$(star-empty) Premium requests: —\n\n');
      md.appendMarkdown(`$(comment-discussion) Chat: **${chatStr}** · $(code) Completions: **${compStr}**\n\n`);
    }

    md.appendMarkdown('---\n\n');
    if (lastUpdatedAt) {
      md.appendMarkdown(`$(clock) ${formatTimestamp(lastUpdatedAt)}`);
    }
    md.appendMarkdown(
      ` &nbsp; [$(refresh) Refresh](command:copilotUsageInsights.refresh "Refresh usage data")`
      + ` &nbsp; [$(open-preview) Dashboard](command:copilotUsageInsights.openDetails "Open detail panel")`,
    );

    if (isRateLimited) {
      md.appendMarkdown('\n\n$(alert) Rate limited · data may be stale');
    }
    if (isStale) {
      md.appendMarkdown('\n\n$(alert) Offline · data may be stale');
    }

    return md;
  }
}

export function computeDisplayPct(data: UsageData): number {
  if (data.isManagedPlan) {
    return data.usedPct;
  }
  if (data.overageEnabled && data.overageUsed > 0 && data.quota > 0) {
    return Math.round(100 + (data.overageUsed / data.quota) * 100);
  }
  return data.usedPct;
}

export function renderStatusBarText(data: UsageData, pct: number, config: ExtensionConfig, billing: BillingData | null = null): string {
  const w = config.segmentedBarWidth;
  const remaining = data.remaining;
  const billedCost = getDisplayedBilledCost(data, billing);

  // Text part
  let textPart = '';
  switch (config.statusBarTextMode) {
    case 'count':        textPart = `${data.used}/${data.quota}`; break;
    case 'percent':      textPart = `${pct}%`; break;
    case 'countPercent': textPart = `${data.used}/${data.quota} (${pct}%)`; break;
    case 'remaining':    textPart = `${remaining} left`; break;
    case 'billedOnly':   textPart = `+$${(billedCost ?? 0).toFixed(2)}`; break;
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

function getDisplayedBilledCost(data: UsageData, billing: BillingData | null): number | null {
  if (data.isManagedPlan) {
    return data.overageEnabled ? data.overageUsed * PREMIUM_REQUEST_UNIT_PRICE : 0;
  }

  if (!billing) {
    return null;
  }

  return billing.totalNet;
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

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#!|]/g, '\\$&');
}