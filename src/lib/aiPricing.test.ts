import { describe, expect, it } from "vitest";
import { costCentsFor } from "./aiPricing";

describe("costCentsFor", () => {
  it("computes cost for a known model from per-million-token pricing", () => {
    const result = costCentsFor("openai", "gpt-4o-mini", 1_000_000, 1_000_000);
    expect(result).toEqual({ ok: true, costCents: 75 }); // $0.15 input + $0.60 output per docs table
  });

  it("returns ok:false for an unlisted model instead of guessing a cost", () => {
    const result = costCentsFor("openai", "some-future-model", 100, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toContain("some-future-model");
    }
  });

  it("returns 0 cost for zero tokens on a known model", () => {
    expect(costCentsFor("openai", "gpt-4o-mini", 0, 0)).toEqual({ ok: true, costCents: 0 });
  });
});
