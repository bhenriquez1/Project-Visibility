import { describe, expect, it } from "vitest";
import { isNormalTransition, NORMAL_TRANSITIONS } from "./pipelineTransitions";
import type { ProspectStatus } from "@/generated/prisma/client";

const ALL_STATUSES: ProspectStatus[] = [
  "PROSPECT", "AUDITED", "CONTACTED", "REPLIED", "QUALIFIED", "PROPOSAL", "WON", "LOST",
];

describe("pipeline state machine", () => {
  it("allows the documented single-step forward path", () => {
    expect(isNormalTransition("PROSPECT", "AUDITED")).toBe(true);
    expect(isNormalTransition("AUDITED", "CONTACTED")).toBe(true);
    expect(isNormalTransition("CONTACTED", "REPLIED")).toBe(true);
    expect(isNormalTransition("REPLIED", "QUALIFIED")).toBe(true);
    expect(isNormalTransition("QUALIFIED", "PROPOSAL")).toBe(true);
    expect(isNormalTransition("PROPOSAL", "WON")).toBe(true);
  });

  it("allows moving to LOST from every non-terminal state", () => {
    for (const status of ALL_STATUSES) {
      if (status === "WON" || status === "LOST") continue;
      expect(isNormalTransition(status, "LOST")).toBe(true);
    }
  });

  it("rejects skipped steps", () => {
    expect(isNormalTransition("PROSPECT", "CONTACTED")).toBe(false);
    expect(isNormalTransition("AUDITED", "QUALIFIED")).toBe(false);
    expect(isNormalTransition("PROSPECT", "WON")).toBe(false);
  });

  it("rejects backward moves", () => {
    expect(isNormalTransition("CONTACTED", "AUDITED")).toBe(false);
    expect(isNormalTransition("QUALIFIED", "REPLIED")).toBe(false);
  });

  it("rejects reviving a LOST prospect or advancing further from WON through the normal path", () => {
    for (const status of ALL_STATUSES) {
      expect(isNormalTransition("LOST", status)).toBe(false);
      expect(isNormalTransition("WON", status)).toBe(false);
    }
  });

  it("every status has a defined transition list", () => {
    for (const status of ALL_STATUSES) expect(NORMAL_TRANSITIONS[status]).toBeDefined();
  });
});
