import * as vscode from 'vscode';

import type { ExtensionConfig } from './models';

const SECTION = 'copilotUsageInsights';

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  const rawWarning = cfg.get<number>('threshold.warning', 75);
  const rawCritical = cfg.get<number>('threshold.critical', 90);
  const warning = Number.isFinite(Number(rawWarning)) ? Number(rawWarning) : 75;
  const critical = Number.isFinite(Number(rawCritical)) ? Number(rawCritical) : 90;

  const validTextModes = ['none', 'count', 'percent', 'countPercent', 'remaining', 'billedOnly'];
  const validGraphicModes = ['none', 'segmented', 'blocks', 'thinBlocks', 'dots', 'circles', 'braille', 'rectangles'];
  const validTextPositions = ['left', 'right'];

  const rawTextMode = cfg.get<string>('statusBarTextMode', 'percent');
  const rawGraphicMode = cfg.get<string>('statusBarGraphicMode', 'none');
  const rawTextPosition = cfg.get<string>('statusBarTextPosition', 'left');

  let textMode = (validTextModes.includes(rawTextMode) ? rawTextMode : 'percent') as ExtensionConfig['statusBarTextMode'];
  const graphicMode = (validGraphicModes.includes(rawGraphicMode) ? rawGraphicMode : 'none') as ExtensionConfig['statusBarGraphicMode'];
  const textPosition = (validTextPositions.includes(rawTextPosition) ? rawTextPosition : 'left') as ExtensionConfig['statusBarTextPosition'];

  // Prevent both being 'none' simultaneously — fall back to percent text
  if (textMode === 'none' && graphicMode === 'none') {
    textMode = 'percent';
  }

  return {
    refreshIntervalMinutes: Math.max(1, Math.min(60, cfg.get<number>('refreshIntervalMinutes', 5))),
    thresholdEnabled: cfg.get<boolean>('threshold.enabled', true),
    thresholdWarning: Math.min(warning, critical),
    thresholdCritical: critical,
    statusBarTextMode: textMode,
    statusBarGraphicMode: graphicMode,
    statusBarTextPosition: textPosition,
    segmentedBarWidth: Math.max(4, Math.min(16, cfg.get<number>('segmentedBarWidth', 8))),
    showBillingDetails: cfg.get<boolean>('showBillingDetails', false),
    showBillingRequestBreakdown: cfg.get<boolean>('showBillingRequestBreakdown', false),
    showCostInStatusBar: cfg.get<boolean>('showCostInStatusBar', false),
  };
}