import { getPricing } from './pricing';

export function tokensToCredits(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  cacheWriteTokens: number = 0,
): { credits: number; dollars: number } {
  const pricing = getPricing(modelId);
  const cacheWriteRate = pricing.cacheWritePerM ?? pricing.inputPerM;
  const credits =
    (Math.max(0, inputTokens) / 1_000_000) * pricing.inputPerM +
    (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPerM +
    (Math.max(0, cachedTokens) / 1_000_000) * pricing.cachedPerM +
    (Math.max(0, cacheWriteTokens) / 1_000_000) * cacheWriteRate;

  return {
    credits,
    dollars: credits * 0.01,
  };
}

export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(Math.max(0, charCount) / 4);
}