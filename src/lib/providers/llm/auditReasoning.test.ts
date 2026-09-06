import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAuditReasoning, type AuditReasoningInput } from "./index";

const completeAudit = {
  visibilityScore: 71,
  profileScore: 68,
  reputationScore: 82,
  websiteSeoScore: 64,
  competitorGapScore: 57,
  conversionScore: 73,
  narrative: "Avrrio Store has measurable opportunities grounded in the supplied evidence.",
};

const missingConversionAudit: Partial<typeof completeAudit> = { ...completeAudit };
delete missingConversionAudit.conversionScore;

const avrrioStoreInput: AuditReasoningInput = {
  businessName: "Avrrio Store",
  city: "Miami, FL",
  website: {
    finalUrl: "https://example.com",
    isHttps: true,
    statusCode: 200,
    title: "Avrrio Store",
    metaDescription: "Store description",
    hasViewportTag: true,
    h1Count: 1,
    hasLocalBusinessSchema: false,
    wordCount: 250,
  },
  place: {
    placeId: "place-1",
    displayName: "Avrrio Store",
    rating: 4.5,
    userRatingCount: 20,
    primaryType: "store",
    formattedAddress: "Miami, FL",
    websiteUri: "https://example.com",
    photoCount: 5,
    hasOpeningHours: true,
    businessStatus: "OPERATIONAL",
  },
  serp: { query: "Avrrio Store Miami", localPack: [], organicTop10Domains: [] },
  unavailableSources: [],
};

function anthropicResponse(content: string) {
  return new Response(
    JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      content: [{ type: "text", text: content }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("audit reasoning structured output", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  it.each([
    ["missing", JSON.stringify(missingConversionAudit)],
    ["null", JSON.stringify({ ...completeAudit, conversionScore: null })],
    ["string", JSON.stringify({ ...completeAudit, conversionScore: "73" })],
    ["out-of-range", JSON.stringify({ ...completeAudit, conversionScore: 101 })],
    ["malformed", '{"visibilityScore":71'],
  ])("repairs one %s score response using the original evidence", async (_case, invalid) => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(anthropicResponse(invalid))
        .mockResolvedValueOnce(anthropicResponse(JSON.stringify(completeAudit)))
    );

    const result = await generateAuditReasoning(avrrioStoreInput);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.conversionScore).toBe(73);
    expect(fetch).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body));
    expect(repairBody.messages[0].content).toContain("Avrrio Store");
    expect(repairBody.messages[0].content).toContain("Do not invent facts or scores");
  });

  it("fails honestly when the single repair is still incomplete", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    const missing = { ...completeAudit } as Partial<typeof completeAudit>;
    delete missing.conversionScore;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(anthropicResponse(JSON.stringify(missing))))
    );

    const result = await generateAuditReasoning(avrrioStoreInput);

    expect(result).toMatchObject({ ok: false, reason: "REQUEST_FAILED" });
    if (!result.ok) expect(result.detail).toContain("after one controlled repair");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("requires null rather than an invented conversion score when website evidence is unavailable", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        anthropicResponse(JSON.stringify({ ...completeAudit, websiteSeoScore: null, conversionScore: null }))
      )
    );

    const result = await generateAuditReasoning({
      ...avrrioStoreInput,
      website: null,
      unavailableSources: ["website (request failed)"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.conversionScore).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
