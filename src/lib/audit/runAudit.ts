import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { logAiUsage, logApiCall } from "@/lib/cost";
import { analyzeWebsite } from "@/lib/providers/website";
import { lookupPlace } from "@/lib/providers/places";
import { searchLocalVisibility } from "@/lib/providers/serp";
import { generateAuditReasoning } from "@/lib/providers/llm";
import { toJson } from "@/lib/json";
import { overallLevelFrom } from "./overallLevel";

export async function runAudit(auditId: string): Promise<void> {
  const audit = await prisma.audit.findUniqueOrThrow({
    where: { id: auditId },
    include: { prospect: true },
  });
  const { prospect } = audit;

  const unavailableSources: string[] = [];

  const [websiteResult, placeResult, serpResult] = await Promise.all([
    analyzeWebsite(prospect.website),
    lookupPlace(prospect.businessName, prospect.city),
    searchLocalVisibility(`${prospect.businessName} ${prospect.city}`),
  ]);

  await Promise.all([
    logApiCall("GOOGLE_PLACES", "Audit", auditId, placeResult.ok),
    logApiCall("SERP", "Audit", auditId, serpResult.ok),
  ]);

  if (!websiteResult.ok) unavailableSources.push(`website (${websiteResult.detail})`);
  if (!placeResult.ok) unavailableSources.push(`places (${placeResult.detail})`);
  if (!serpResult.ok) unavailableSources.push(`serp (${serpResult.detail})`);

  const reasoning = await generateAuditReasoning({
    businessName: prospect.businessName,
    city: prospect.city,
    website: websiteResult.ok ? websiteResult.data : null,
    place: placeResult.ok ? placeResult.data : null,
    serp: serpResult.ok ? serpResult.data : null,
    unavailableSources,
  });

  if (!reasoning.ok) {
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: "FAILED",
        error: `${reasoning.reason}: ${reasoning.detail}`,
        unavailableSources,
        rawWebsiteSignals: websiteResult.ok ? toJson(websiteResult.data) : undefined,
        rawPlacesSignals: placeResult.ok ? toJson(placeResult.data) : undefined,
        rawSerpSignals: serpResult.ok ? toJson(serpResult.data) : undefined,
        completedAt: new Date(),
      },
    });
    await logEvent("audit_failed", { prospectId: prospect.id, payload: { auditId, reason: reasoning.reason } });
    return;
  }

  await logAiUsage("Audit", auditId, reasoning.data.meta);

  const scores = [
    reasoning.data.visibilityScore,
    reasoning.data.profileScore,
    reasoning.data.reputationScore,
    reasoning.data.websiteSeoScore,
    reasoning.data.competitorGapScore,
    reasoning.data.conversionScore,
  ];

  const competitors = serpResult.ok
    ? serpResult.data.localPack
        .filter((entry) => entry.title.toLowerCase() !== prospect.businessName.toLowerCase())
        .slice(0, 5)
        .map((entry) => ({
          name: entry.title,
          metrics: { position: entry.position, rating: entry.rating, reviews: entry.reviews, type: entry.type },
        }))
    : [];

  await prisma.audit.update({
    where: { id: auditId },
    data: {
      status: unavailableSources.length > 0 ? "PARTIAL" : "COMPLETE",
      unavailableSources,
      rawWebsiteSignals: websiteResult.ok ? toJson(websiteResult.data) : undefined,
      rawPlacesSignals: placeResult.ok ? toJson(placeResult.data) : undefined,
      rawSerpSignals: serpResult.ok ? toJson(serpResult.data) : undefined,
      visibilityScore: reasoning.data.visibilityScore,
      profileScore: reasoning.data.profileScore,
      reputationScore: reasoning.data.reputationScore,
      websiteSeoScore: reasoning.data.websiteSeoScore,
      competitorGapScore: reasoning.data.competitorGapScore,
      conversionScore: reasoning.data.conversionScore,
      overallLevel: overallLevelFrom(scores),
      narrative: reasoning.data.narrative,
      completedAt: new Date(),
      competitors: {
        create: competitors.map((c) => ({ name: c.name, metrics: c.metrics })),
      },
    },
  });

  // Only advances a fresh lead's very first audit (PROSPECT -> AUDITED). Re-running an audit
  // later (V3 Growth Agent refreshing a WON customer's signals, for example) must never clobber
  // wherever the prospect/customer actually is in the pipeline.
  await prisma.prospect.updateMany({ where: { id: prospect.id, status: "PROSPECT" }, data: { status: "AUDITED" } });
  await logEvent("audit_completed", { prospectId: prospect.id, payload: { auditId } });
}
