/**
 * Known OpenAI pricing, in cents per 1M tokens. Keep this current — the economics dashboard's
 * per-customer AI cost depends on it being accurate, not guessed. An unlisted model is treated
 * as a configuration error rather than silently priced at $0 (see ENGINEERING_STANDARDS.md).
 */
const PRICING_CENTS_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4o": { input: 250, output: 1000 },
};

export function costCentsFor(
  model: string,
  inputTokens: number,
  outputTokens: number
): { ok: true; costCents: number } | { ok: false; detail: string } {
  const pricing = PRICING_CENTS_PER_MILLION_TOKENS[model];
  if (!pricing) {
    return {
      ok: false,
      detail: `No known pricing for OpenAI model "${model}" — add it to src/lib/aiPricing.ts before using it, so the economics dashboard stays accurate.`,
    };
  }

  const costCents =
    (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;

  return { ok: true, costCents: Math.round(costCents * 100) / 100 };
}
