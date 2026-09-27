/**
 * Per-token USD pricing for the models used by prompt-evals providers, so
 * the `cost` assertion (which requires a provider to return an actual
 * `cost` field) has something real to compute from.
 *
 * IMPORTANT — gemini-3.1-flash-lite's rate below is a PLACEHOLDER, not a
 * verified price. It's copied from gemini-3-flash-preview's published rate
 * as a starting estimate; the "lite" tier is very likely cheaper than that,
 * but I don't have a confirmed current number for it. Verify against
 * https://ai.google.dev/gemini-api/docs/pricing and correct this before
 * trusting the benchmark suite's cost numbers.
 */

export interface Pricing {
  inputPer1M: number; // USD per 1M input tokens
  outputPer1M: number; // USD per 1M output tokens
}

export const PRICING_BY_MODEL_ID: Record<string, Pricing> = {
  // UNVERIFIED — see module comment above.
  "google:gemini-3.1-flash-lite": {
    inputPer1M: 0.1,
    outputPer1M: 0.4,
  },
};

export function getPricing(modelId: string): Pricing | null {
  return PRICING_BY_MODEL_ID[modelId] || null;
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  const pricing = getPricing(modelId);
  if (!pricing) return undefined;
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}
