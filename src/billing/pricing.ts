import * as fs from 'node:fs';
import * as path from 'node:path';

import { ExtensionContext, workspace } from 'vscode';

import type { ModelPricing } from '../core/models';

type PricingOverride = Partial<Pick<ModelPricing, 'displayName' | 'inputPerM' | 'outputPerM' | 'cachedPerM' | 'cacheWritePerM'>>;

interface PricingJson {
  models: Record<string, Omit<ModelPricing, 'modelId'>>;
}

const FALLBACK_MODEL_ID = '_fallback';

let bundled: Record<string, ModelPricing> = {
  [FALLBACK_MODEL_ID]: {
    modelId: FALLBACK_MODEL_ID,
    displayName: 'Unknown model',
    inputPerM: 200,
    outputPerM: 1000,
    cachedPerM: 20,
  },
};

export function loadPricing(context: ExtensionContext): void {
  const outPath = path.join(context.extensionPath, 'out', 'billing', 'pricing.json');
  const srcPath = path.join(context.extensionPath, 'src', 'billing', 'pricing.json');
  const filePath = fs.existsSync(outPath) ? outPath : srcPath;
  const raw = fs.readFileSync(filePath, 'utf8');
  loadPricingFromJson(JSON.parse(raw) as PricingJson);
}

export function loadPricingFromJson(json: PricingJson): void {
  bundled = Object.fromEntries(
    Object.entries(json.models).map(([modelId, value]) => [modelId, { modelId, ...value }]),
  );
  if (!bundled[FALLBACK_MODEL_ID]) {
    bundled[FALLBACK_MODEL_ID] = {
      modelId: FALLBACK_MODEL_ID,
      displayName: 'Unknown model',
      inputPerM: 200,
      outputPerM: 1000,
      cachedPerM: 20,
    };
  }
}

export function getPricing(modelId: string): ModelPricing {
  const overrides = workspace
    .getConfiguration('copilotUsageInsights')
    .get<Record<string, PricingOverride>>('pricing.overrides', {});

  const base = bundled[modelId] ?? bundled[FALLBACK_MODEL_ID];
  const override = overrides[modelId] ?? {};
  return { ...base, ...override, modelId };
}