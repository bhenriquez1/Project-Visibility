import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { searchNearbyBusinesses } from "@/lib/providers/places";
import type { Agent, AgentAction } from "./types";
import { getAgentBatchLimit } from "@/lib/agentOperations";

interface TargetMarket {
  category: string;
  city: string;
}

interface ScoutPayload {
  businessName: string;
  website: string;
  city: string;
}

async function getTargetMarkets(): Promise<TargetMarket[]> {
  const setting = await prisma.setting.findUnique({ where: { key: "scout_target_markets" } });
  if (!setting) return [];
  try {
    const parsed = JSON.parse(setting.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is TargetMarket => typeof m?.category === "string" && typeof m?.city === "string"
    );
  } catch {
    return [];
  }
}

export const scoutAgent: Agent = {
  name: "scout",
  // Creating an internal Prospect record has zero external footprint — no email is sent, no
  // public asset is touched. See src/lib/agents/types.ts for what AUTOMATIC means here.
  defaultControlTier: "AUTOMATIC",

  async proposeActions(): Promise<AgentAction[]> {
    const markets = await getTargetMarkets();
    if (markets.length === 0) return [];

    const existing = await prisma.prospect.findMany({
      select: { businessName: true, city: true, website: true },
    });
    const isKnown = (businessName: string, city: string, website: string) =>
      existing.some(
        (p) =>
          p.website === website ||
          (p.businessName.toLowerCase() === businessName.toLowerCase() &&
            p.city.toLowerCase() === city.toLowerCase())
      );

    const actions: AgentAction[] = [];

    // Sequential, and a failure on one market fails the whole run rather than silently skipping
    // it — a lite first pass; per-market resilience can be added once this is proven out.
    for (const market of markets) {
      const result = await searchNearbyBusinesses(market.category, market.city);
      if (!result.ok) {
        throw new Error(
          `Scout search failed for "${market.category}" in ${market.city}: ${result.reason} — ${result.detail}`
        );
      }

      for (const business of result.data) {
        if (isKnown(business.businessName, business.city, business.website)) continue;
        const payload: ScoutPayload = {
          businessName: business.businessName,
          website: business.website,
          city: business.city,
        };
        actions.push({
          controlTier: "AUTOMATIC",
          consequence: "INTERNAL_RECORD",
          summary: `New prospect: ${business.businessName} (${business.city})`,
          payload,
        });
      }
    }

    return actions.slice(0, await getAgentBatchLimit("scout"));
  },

  async execute(action: AgentAction): Promise<void> {
    const { businessName, website, city } = action.payload as ScoutPayload;

    const duplicate = await prisma.prospect.findFirst({
      where: {
        OR: [
          { website: { equals: website, mode: "insensitive" } },
          { businessName: { equals: businessName, mode: "insensitive" }, city: { equals: city, mode: "insensitive" } },
        ],
      },
    });
    if (duplicate) {
      await logEvent("scout_duplicate_skipped", { prospectId: duplicate.id, payload: { businessName, city, website } });
      return;
    }

    const prospect = await prisma.prospect.create({
      data: { businessName, website, city, source: "scout_agent" },
    });

    await logEvent("scout_prospect_found", { prospectId: prospect.id });
  },
};
