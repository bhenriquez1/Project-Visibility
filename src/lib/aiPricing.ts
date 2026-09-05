import type { LlmProviderId } from "@/lib/providers/llm/types";

/**
 * Known pricing, in cents per 1M tokens, by provider then model. Keep this current — the
 * economics dashboard's per-customer AI cost depends on it being accurate, not guessed. An
 * unlisted provider/model is treated as a configuration error rather than silently priced at
 * $0 (see ENGINEERING_STANDARDS.md).
 */
const PRICING_CENTS_PER_MILLION_TOKENS: Record<
  LlmProviderId,
  Record<string, { input: number; output: number }>
> = {
  openai: {
    "gpt-4o-mini": { input: 15, output: 60 },
    "gpt-4o": { input: 250, output: 1000 },
  },
};

export function costCentsFor(
  provider: LlmProviderId,
  model: string,
  inputTokens: number,
  outputTokens: number
): { ok: true; costCents: number } | { ok: false; detail: string } {
  const pricing = PRICING_CENTS_PER_MILLION_TOKENS[provider]?.[model];
  if (!pricing) {
    return {
      ok: false,
      detail: `No known pricing for ${provider} model "${model}" — add it to src/lib/aiPricing.ts before using it, so the economics dashboard stays accurate.`,
    };
  }

  const costCents =
    (inputTokens * pricing.input) / 1_000_000 + (outputTokens * pricing.output) / 1_000_000;

  return { ok: true, costCents: Math.round(costCents * 100) / 100 };
}
