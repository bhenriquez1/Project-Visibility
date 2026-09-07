import { afterEach, describe, expect, it, vi } from "vitest";
import { generateOutreachDraft, extractQualificationSignals } from "./index";

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

function setupAnthropic() {
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "test-key";
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("outreach draft evidence grounding", () => {
  const findings = ["Google/local visibility (40/100)", "The website has no meta description."];

  it("accepts a draft whose evidenceUsed cites real findings", async () => {
    setupAnthropic();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        anthropicResponse(
          JSON.stringify({
            subject: "Quick note",
            body: "Noticed your Google/local visibility (40/100) and the site is missing a meta description.",
            evidenceUsed: findings,
          })
        )
      )
    );

    const result = await generateOutreachDraft({ businessName: "Acme", contactEmail: "a@acme.com", findings });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.evidenceUsed).toEqual(findings);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("repairs then fails when evidenceUsed cites facts that were never in the real findings", async () => {
    setupAnthropic();
    const invented = {
      subject: "Quick note",
      body: "You'd rank #1 fast!",
      evidenceUsed: ["We guarantee a #1 ranking", "Your competitors are struggling"],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse(JSON.stringify(invented))));

    const result = await generateOutreachDraft({ businessName: "Acme", contactEmail: "a@acme.com", findings });

    expect(result).toMatchObject({ ok: false, reason: "REQUEST_FAILED" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("qualification signal evidence grounding", () => {
  const conversation = [
    { direction: "INBOUND" as const, body: "Our budget for this quarter is around $2,000 and we'd like to start within two weeks." },
  ];

  it("accepts a signal whose evidence is a real quote from the conversation", async () => {
    setupAnthropic();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        anthropicResponse(
          JSON.stringify({ signals: [{ signal: "Stated budget", evidence: "Our budget for this quarter is around $2,000" }] })
        )
      )
    );

    const result = await extractQualificationSignals({ businessName: "Acme", conversationSoFar: conversation });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.signals).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("repairs then fails when evidence is invented, not a real quote", async () => {
    setupAnthropic();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        anthropicResponse(JSON.stringify({ signals: [{ signal: "Ready to sign", evidence: "We are ready to sign the contract today" }] }))
      )
    );

    const result = await extractQualificationSignals({ businessName: "Acme", conversationSoFar: conversation });

    expect(result).toMatchObject({ ok: false, reason: "REQUEST_FAILED" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("accepts an empty signal list when nothing concrete was said", async () => {
    setupAnthropic();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse(JSON.stringify({ signals: [] }))));

    const result = await extractQualificationSignals({ businessName: "Acme", conversationSoFar: conversation });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.signals).toEqual([]);
  });
});
