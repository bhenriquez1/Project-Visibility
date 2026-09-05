import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "./anthropic";

describe("AnthropicClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  it("normalizes a fenced JSON response and records usage cost", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            content: [{ type: "text", text: '```json\n{"ok":true}\n```' }],
            usage: { input_tokens: 1_000, output_tokens: 1_000 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await createAnthropicClient()!.completeJson("Return JSON.");

    expect(result).toEqual({
      ok: true,
      data: {
        raw: '{"ok":true}',
        model: "claude-haiku-4-5-20251001",
        inputTokens: 1_000,
        outputTokens: 1_000,
        costCents: 0.6,
      },
    });
  });
});
