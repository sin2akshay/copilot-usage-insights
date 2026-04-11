import * as vscode from 'vscode';

import type { ExtensionConfig } from './models';

const SECTION = 'copilotUsageInsights';

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const rawWarning = cfg.get<number>('threshold.warning', 75);
  const rawCritical = cfg.get<number>('threshold.critical', 90);
  const warning = Number.isFinite(Number(rawWarning)) ? Number(rawWarning) : 75;
  const critical = Number.isFinite(Number(rawCritical)) ? Number(rawCritical) : 90;

  const mode = cfg.get<string>('statusBarMode', 'percent');
  const validModes = ['count', 'percent', 'countPercent', 'remaining', 'segmented', 'blocks', 'thinBlocks', 'dots', 'circles', 'hybrid'];

  return {
    refreshIntervalMinutes: Math.max(1, Math.min(60, cfg.get<number>('refreshIntervalMinutes', 5))),
    thresholdEnabled: cfg.get<boolean>('threshold.enabled', true),
    thresholdWarning: Math.min(warning, critical),
    thresholdCritical: critical,
    statusBarMode: (validModes.includes(mode) ? mode : 'percent') as ExtensionConfig['statusBarMode'],
    segmentedBarWidth: Math.max(4, Math.min(16, cfg.get<number>('segmentedBarWidth', 8))),
  };
}