export const SCORE_LABELS = {
  visibilityScore: "Google/local visibility",
  profileScore: "Profile completeness",
  reputationScore: "Reputation & reviews",
  websiteSeoScore: "Website & local SEO",
  competitorGapScore: "Competitor gap",
  conversionScore: "Conversion opportunities",
} as const;

const STRONG_THRESHOLD = 71;

/**
 * Only flags REAL sub-70 scores, never the absence of data — an unavailable source means "we
 * don't know," not "there's a problem to fix." Conflating the two in a customer-facing email
 * would be a fabricated finding.
 */
export function collectScoreFindings(audit: Record<keyof typeof SCORE_LABELS, number | null>): string[] {
  return (Object.keys(SCORE_LABELS) as Array<keyof typeof SCORE_LABELS>)
    .filter((key) => typeof audit[key] === "number" && audit[key]! < STRONG_THRESHOLD)
    .map((key) => `${SCORE_LABELS[key]} (${audit[key]}/100)`);
}

/** Concrete, quotable facts from the raw website crawl — real booleans, never guessed. */
export function collectWebsiteSignalFindings(rawWebsiteSignals: unknown): string[] {
  if (!rawWebsiteSignals || typeof rawWebsiteSignals !== "object") return [];
  const signals = rawWebsiteSignals as Record<string, unknown>;
  const findings: string[] = [];

  if (!signals.title) findings.push("The website has no page title tag.");
  if (!signals.metaDescription) findings.push("The website has no meta description.");
  if (signals.hasViewportTag === false) findings.push("The website has no mobile viewport tag.");
  if (signals.hasLocalBusinessSchema === false) findings.push("The website has no Local Business schema markup.");

  return findings;
}

export function collectAuditFindings(audit: Record<keyof typeof SCORE_LABELS, number | null> & { rawWebsiteSignals?: unknown }): string[] {
  return [...collectScoreFindings(audit), ...collectWebsiteSignalFindings(audit.rawWebsiteSignals)];
}
