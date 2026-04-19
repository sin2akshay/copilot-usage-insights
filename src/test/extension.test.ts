import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('extension manifest', () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
  ) as {
    contributes: {
      commands: Array<{ command: string }>;
      configuration: { properties: Record<string, unknown> };
    };
  };

  it('declares all commands', () => {
    const commands = manifest.contributes.commands.map(c => c.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        'copilotUsageInsights.signIn',
        'copilotUsageInsights.refresh',
        'copilotUsageInsights.openDetails',
        'copilotUsageInsights.disconnect',
        'copilotUsageInsights.openSettings',
      ]),
    );
  });

  it('declares threshold settings', () => {
    const props = Object.keys(manifest.contributes.configuration.properties);
    expect(props).toContain('copilotUsageInsights.refreshIntervalMinutes');
    expect(props).toContain('copilotUsageInsights.threshold.enabled');
    expect(props).toContain('copilotUsageInsights.threshold.warning');
    expect(props).toContain('copilotUsageInsights.threshold.critical');
  });

  it('uses the updated defaults for warning and billing breakdown', () => {
    const props = manifest.contributes.configuration.properties as Record<string, { default?: unknown }>;
    expect(props['copilotUsageInsights.threshold.warning']?.default).toBe(75);
    expect(props['copilotUsageInsights.showBillingRequestBreakdown']?.default).toBe(false);
  });

  it('does not declare chat participants', () => {
    expect((manifest.contributes as Record<string, unknown>)['chatParticipants']).toBeUndefined();
  });
});