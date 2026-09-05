import { prisma } from "@/lib/prisma";
import type { AiCallMeta } from "@/lib/providers/llm";
import type { DataApiProvider } from "@/generated/prisma/client";

export async function logAiUsage(relatedType: string, relatedId: string, meta: AiCallMeta) {
  await prisma.aiUsage.create({
    data: {
      model: meta.model,
      provider: meta.provider === "anthropic" ? "ANTHROPIC" : "OPENAI",
      relatedType,
      relatedId,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      costCents: meta.costCents,
    },
  });
}

/**
 * Cost-per-call for data APIs is plan-dependent (Google Places / SerpAPI pricing varies by
 * account). Rather than guess, this reads from Settings — configure it there once you know
 * your real per-call rate. Unconfigured defaults to 0 and is called out on the economics
 * dashboard as an estimate, not treated as a real zero cost.
 */
async function costPerCallCents(provider: DataApiProvider): Promise<number> {
  const key = provider === "GOOGLE_PLACES" ? "places_cost_cents_per_call" : "serp_cost_cents_per_call";
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting ? Number(setting.value) : 0;
}

export async function logApiCall(
  provider: DataApiProvider,
  relatedType: string,
  relatedId: string,
  success: boolean
) {
  const costCents = await costPerCallCents(provider);
  await prisma.apiCallLog.create({
    data: { provider, relatedType, relatedId, success, costCents },
  });
}
