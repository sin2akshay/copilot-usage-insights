import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  MarkdownString: class MarkdownString {
    value = '';
    isTrusted: unknown;
    supportHtml = false;

    appendMarkdown(markdown: string): void {
      this.value += markdown;
    }

    appendText(text: string): void {
      this.value += text;
    }
  },
  ThemeColor: class ThemeColor {
    constructor(public readonly id: string) {}
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  window: {
    createStatusBarItem: vi.fn(),
  },
}));

import type { BillingData, ExtensionConfig, UsageData } from '../core/models';
import { computeDisplayPct, renderStatusBarText } from '../ui/statusBar';

const baseData: UsageData = {
  used: 150,
  remaining: 150,
  quota: 300,
  usedPct: 50,
  unlimited: false,
  noData: false,
  overageEnabled: false,
  overageUsed: 0,
  plan: 'Pro',
  isManagedPlan: false,
  resetDate: new Date(),
  chatQuota: null,
  completionsQuota: null,
  premiumQuota: null,
  chatEnabled: true,
  mcpEnabled: true,
  assignedDate: null,
  accessType: 'unknown',
};

const baseConfig: ExtensionConfig = {
  refreshIntervalMinutes: 5,
  thresholdEnabled: true,
  thresholdWarning: 75,
  thresholdCritical: 90,
  statusBarTextMode: 'percent',
  statusBarGraphicMode: 'none',
  statusBarTextPosition: 'left',
  segmentedBarWidth: 8,
  showBillingDetails: false,
  showBillingRequestBreakdown: false,
  showCostInStatusBar: false,
};

describe('renderStatusBarText', () => {
  it('renders percent mode', () => {
    expect(renderStatusBarText(baseData, 50, baseConfig)).toBe('50%');
  });

  it('renders count mode', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'count' })).toBe('150/300');
  });

  it('renders countPercent mode', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'countPercent' })).toBe('150/300 (50%)');
  });

  it('renders remaining mode', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'remaining' })).toBe('150 left');
  });

  it('renders text-only (no graphic)', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'percent', statusBarGraphicMode: 'none' })).toBe('50%');
  });

  it('renders graphic-only (no text)', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'segmented' })).toBe('[■■■■□□□□]');
  });

  it('renders text left of graphic by default', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'percent', statusBarGraphicMode: 'segmented', statusBarTextPosition: 'left' })).toBe('50% [■■■■□□□□]');
  });

  it('renders text right of graphic when position is right', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'percent', statusBarGraphicMode: 'segmented', statusBarTextPosition: 'right' })).toBe('[■■■■□□□□] 50%');
  });

  it('renders all graphic styles', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'segmented' })).toBe('[■■■■□□□□]');
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'blocks' })).toBe('████░░░░');
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'thinBlocks' })).toBe('▰▰▰▰▱▱▱▱');
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'dots' })).toBe('••••····');
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'circles' })).toBe('●●●●○○○○');
  });

  it('respects segmentedBarWidth', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'segmented', segmentedBarWidth: 4 })).toBe('[■■□□]');
  });

  it('renders low percentages with at least one filled segment', () => {
    expect(renderStatusBarText(baseData, 1, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'segmented' })).toBe('[■□□□□□□□]');
  });

  it('falls back to percent when both text and graphic are none', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'none', statusBarGraphicMode: 'none' })).toBe('50%');
  });
});

describe('computeDisplayPct', () => {
  it('returns usedPct when no overage', () => {
    const data: UsageData = {
      used: 150,
      remaining: 150,
      quota: 300,
      usedPct: 50,
      unlimited: false,
      noData: false,
      overageEnabled: false,
      overageUsed: 0,
      plan: 'Pro',
      isManagedPlan: false,
      resetDate: new Date(),
      chatQuota: null,
      completionsQuota: null,
      premiumQuota: null,
      chatEnabled: true,
      mcpEnabled: true,
      assignedDate: null,
      accessType: 'unknown',
    };
    expect(computeDisplayPct(data)).toBe(50);
  });

  it('returns >100% when overage is present', () => {
    const data: UsageData = {
      used: 300,
      remaining: 0,
      quota: 300,
      usedPct: 100,
      unlimited: false,
      noData: false,
      overageEnabled: true,
      overageUsed: 33,
      plan: 'Pro',
      isManagedPlan: false,
      resetDate: new Date(),
      chatQuota: null,
      completionsQuota: null,
      premiumQuota: null,
      chatEnabled: true,
      mcpEnabled: true,
      assignedDate: null,
      accessType: 'unknown',
    };
    expect(computeDisplayPct(data)).toBe(111);
  });

  it('returns usedPct when overage enabled but 0 usage', () => {
    const data: UsageData = {
      used: 200,
      remaining: 100,
      quota: 300,
      usedPct: 67,
      unlimited: false,
      noData: false,
      overageEnabled: true,
      overageUsed: 0,
      plan: 'Pro',
      isManagedPlan: false,
      resetDate: new Date(),
      chatQuota: null,
      completionsQuota: null,
      premiumQuota: null,
      chatEnabled: true,
      mcpEnabled: true,
      assignedDate: null,
      accessType: 'unknown',
    };
    expect(computeDisplayPct(data)).toBe(67);
  });

  it('ignores overage for managed plans', () => {
    const data: UsageData = {
      ...baseData,
      usedPct: 100,
      overageEnabled: true,
      overageUsed: 25,
      plan: 'Business',
      isManagedPlan: true,
    };
    expect(computeDisplayPct(data)).toBe(100);
  });
});

const sampleBilling: BillingData = {
  year: 2026,
  month: 4,
  user: 'test',
  items: [
    { model: 'Claude Opus 4.6', pricePerUnit: 0.04, grossQuantity: 33, grossAmount: 1.32, discountQuantity: 33, discountAmount: 1.32, netQuantity: 0, netAmount: 0 },
    { model: 'GPT-5.4', pricePerUnit: 0.04, grossQuantity: 29, grossAmount: 1.16, discountQuantity: 29, discountAmount: 1.16, netQuantity: 0, netAmount: 0 },
  ],
  totalGross: 2.48,
  totalNet: 0,
};

const overageBilling: BillingData = {
  ...sampleBilling,
  totalNet: 1.20,
};

describe('renderStatusBarText (billedOnly)', () => {
  it('renders billedOnly with no billing data', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'billedOnly' })).toBe('+$0.00');
  });

  it('renders billedOnly with billing data (no overage)', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'billedOnly' }, sampleBilling)).toBe('+$0.00');
  });

  it('renders billedOnly with overage billing data', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'billedOnly' }, overageBilling)).toBe('+$1.20');
  });

  it('renders estimated billedOnly cost for managed plans', () => {
    expect(
      renderStatusBarText(
        { ...baseData, plan: 'Business', isManagedPlan: true, overageEnabled: true, overageUsed: 30 },
        50,
        { ...baseConfig, statusBarTextMode: 'billedOnly' },
        overageBilling,
      ),
    ).toBe('+$1.20');
  });

  it('renders zero billedOnly cost for managed plans without overage', () => {
    expect(
      renderStatusBarText(
        { ...baseData, plan: 'Business', isManagedPlan: true, overageEnabled: true, overageUsed: 0 },
        50,
        { ...baseConfig, statusBarTextMode: 'billedOnly' },
        null,
      ),
    ).toBe('+$0.00');
  });
});

describe('renderStatusBarText (cost suffix)', () => {
  it('does not append cost when showCostInStatusBar is false', () => {
    // The cost suffix is applied in showData, not renderStatusBarText, so renderStatusBarText alone won't include it
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'percent' }, sampleBilling)).toBe('50%');
  });

  it('billedOnly mode ignores cost suffix (applied externally)', () => {
    expect(renderStatusBarText(baseData, 50, { ...baseConfig, statusBarTextMode: 'billedOnly' }, sampleBilling)).toBe('+$0.00');
  });
});