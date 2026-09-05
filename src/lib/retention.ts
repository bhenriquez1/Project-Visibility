import { prisma } from "@/lib/prisma";

export type VisibilityTrend = "up" | "down" | "flat" | null;
export type RetentionRisk = "low" | "moderate" | "high";

export interface RetentionSignals {
  visibilityTrend: VisibilityTrend;
  unansweredReviewCount: number;
  daysSinceLastLogin: number | null;
  daysUntilRenewal: number | null;
  riskLevel: RetentionRisk;
}

function averageScore(audit: {
  visibilityScore: number | null;
  profileScore: number | null;
  reputationScore: number | null;
  websiteSeoScore: number | null;
  competitorGapScore: number | null;
  conversionScore: number | null;
}): number | null {
  const scores = [
    audit.visibilityScore,
    audit.profileScore,
    audit.reputationScore,
    audit.websiteSeoScore,
    audit.competitorGapScore,
    audit.conversionScore,
  ].filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

/**
 * Computed on demand — no scheduler/cron introduced (same "no premature infra" discipline as
 * V1). This is the seam the eventual V3 Retention Agent plugs into, not that agent itself.
 */
export async function computeRetentionSignals(prospectId: string): Promise<RetentionSignals> {
  const [prospect, recentAudits, activeSubscription, unansweredReviewCount] = await Promise.all([
    prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } }),
    prisma.audit.findMany({
      where: { prospectId, status: { in: ["COMPLETE", "PARTIAL"] } },
      orderBy: { requestedAt: "desc" },
      take: 2,
    }),
    prisma.subscription.findFirst({ where: { prospectId, status: "ACTIVE" } }),
    prisma.reviewReply.count({ where: { prospectId, status: { not: "POSTED" } } }),
  ]);

  let visibilityTrend: VisibilityTrend = null;
  if (recentAudits.length === 2) {
    const [latest, previous] = recentAudits;
    const latestAvg = averageScore(latest);
    const previousAvg = averageScore(previous);
    if (latestAvg !== null && previousAvg !== null) {
      const delta = latestAvg - previousAvg;
      visibilityTrend = delta > 3 ? "up" : delta < -3 ? "down" : "flat";
    }
  }

  const daysSinceLastLogin = prospect.lastLoginAt
    ? Math.floor((Date.now() - prospect.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const daysUntilRenewal = activeSubscription?.currentPeriodEnd
    ? Math.floor((activeSubscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  let riskFlags = 0;
  if (visibilityTrend === "down") riskFlags += 1;
  if (unansweredReviewCount >= 3) riskFlags += 1;
  if (daysSinceLastLogin === null || daysSinceLastLogin > 30) riskFlags += 1;
  if (daysUntilRenewal !== null && daysUntilRenewal <= 14) riskFlags += 1;

  const riskLevel: RetentionRisk = riskFlags >= 3 ? "high" : riskFlags >= 2 ? "moderate" : "low";

  return { visibilityTrend, unansweredReviewCount, daysSinceLastLogin, daysUntilRenewal, riskLevel };
}
