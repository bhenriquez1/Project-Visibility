import { describe, expect, it } from "vitest";
import { collectScoreFindings, collectWebsiteSignalFindings, collectAuditFindings } from "./findings";

const strongScores = {
  visibilityScore: 90, profileScore: 85, reputationScore: 95,
  websiteSeoScore: 80, competitorGapScore: 75, conversionScore: 88,
};

describe("audit findings", () => {
  it("flags only real sub-70 scores, never missing data", () => {
    const findings = collectScoreFindings({ ...strongScores, visibilityScore: 40, conversionScore: null });
    expect(findings).toEqual(["Google/local visibility (40/100)"]);
  });

  it("returns nothing when every real score is strong", () => {
    expect(collectScoreFindings(strongScores)).toEqual([]);
  });

  it("reports each real concrete website gap", () => {
    const findings = collectWebsiteSignalFindings({
      title: "", metaDescription: null, hasViewportTag: false, hasLocalBusinessSchema: false,
    });
    expect(findings).toEqual([
      "The website has no page title tag.",
      "The website has no meta description.",
      "The website has no mobile viewport tag.",
      "The website has no Local Business schema markup.",
    ]);
  });

  it("returns nothing for a well-formed site or absent signals", () => {
    expect(collectWebsiteSignalFindings({ title: "Acme", metaDescription: "desc", hasViewportTag: true, hasLocalBusinessSchema: true })).toEqual([]);
    expect(collectWebsiteSignalFindings(null)).toEqual([]);
    expect(collectWebsiteSignalFindings("not an object")).toEqual([]);
  });

  it("combines score and website findings", () => {
    const findings = collectAuditFindings({
      ...strongScores,
      visibilityScore: 40,
      rawWebsiteSignals: { title: "Acme Store", metaDescription: null, hasViewportTag: true, hasLocalBusinessSchema: true },
    });
    expect(findings).toEqual(["Google/local visibility (40/100)", "The website has no meta description."]);
  });
});
