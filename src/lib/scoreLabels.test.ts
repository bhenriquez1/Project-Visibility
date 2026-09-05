import { describe, expect, it } from "vitest";
import { scoreLevelLabel } from "./scoreLabels";

describe("scoreLevelLabel", () => {
  it("labels null as Not available rather than a fabricated bucket", () => {
    expect(scoreLevelLabel(null)).toBe("Not available");
  });

  it("labels high scores as Strong", () => {
    expect(scoreLevelLabel(85)).toBe("Strong");
  });

  it("labels mid scores as Moderate", () => {
    expect(scoreLevelLabel(50)).toBe("Moderate");
  });

  it("labels low scores as Needs attention", () => {
    expect(scoreLevelLabel(10)).toBe("Needs attention");
  });

  it("treats the 41/71 boundaries consistently with overallLevelFrom", () => {
    expect(scoreLevelLabel(40)).toBe("Needs attention");
    expect(scoreLevelLabel(41)).toBe("Moderate");
    expect(scoreLevelLabel(70)).toBe("Moderate");
    expect(scoreLevelLabel(71)).toBe("Strong");
  });
});
