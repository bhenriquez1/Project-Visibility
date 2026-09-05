import { describe, expect, it } from "vitest";
import { overallLevelFrom } from "./overallLevel";

describe("overallLevelFrom", () => {
  it("returns NOT_AVAILABLE when every score is null", () => {
    expect(overallLevelFrom([null, null, null])).toBe("NOT_AVAILABLE");
  });

  it("returns STRONG when the average of available scores is >= 71", () => {
    expect(overallLevelFrom([80, 90, null])).toBe("STRONG");
  });

  it("returns MODERATE for a mid-range average", () => {
    expect(overallLevelFrom([50, 40])).toBe("MODERATE");
  });

  it("returns NEEDS_ATTENTION for a low average", () => {
    expect(overallLevelFrom([10, 20, null, null])).toBe("NEEDS_ATTENTION");
  });

  it("ignores nulls when averaging rather than treating them as zero", () => {
    // A single 90 alongside two nulls should still read as STRONG, not be dragged down.
    expect(overallLevelFrom([90, null, null])).toBe("STRONG");
  });
});
