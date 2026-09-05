import type { ScoreLevel } from "@/generated/prisma/client";

export function overallLevelFrom(scores: Array<number | null>): ScoreLevel {
  const available = scores.filter((s): s is number => s !== null);
  if (available.length === 0) return "NOT_AVAILABLE";

  const avg = available.reduce((sum, s) => sum + s, 0) / available.length;
  if (avg >= 71) return "STRONG";
  if (avg >= 41) return "MODERATE";
  return "NEEDS_ATTENTION";
}
