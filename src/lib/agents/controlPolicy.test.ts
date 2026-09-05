import { describe, expect, it } from "vitest";
import { evaluateAgentAction } from "./controlPolicy";
import type { AgentAction, AgentConsequence } from "./types";

const action = (consequence: AgentConsequence, controlTier: AgentAction["controlTier"] = "AUTOMATIC") =>
  ({ consequence, controlTier, summary: "test", payload: {} }) satisfies AgentAction;

describe("Brian control policy", () => {
  it("permits only non-consequential internal work", () => {
    expect(evaluateAgentAction(action("INTERNAL_RECORD")).execute).toBe(true);
    expect(evaluateAgentAction(action("ANALYSIS")).execute).toBe(true);
    expect(evaluateAgentAction(action("DRAFT", "AI_PREPARED")).execute).toBe(true);
  });

  it.each([
    "EXTERNAL_COMMUNICATION",
    "FINANCIAL",
    "CONTRACTUAL",
    "DESTRUCTIVE",
    "ACCOUNT_OWNERSHIP",
  ] as const)("blocks %s actions regardless of an automatic tier", (consequence) => {
    expect(evaluateAgentAction(action(consequence)).execute).toBe(false);
  });

  it("blocks anything explicitly marked Brian-only", () => {
    expect(evaluateAgentAction(action("ANALYSIS", "BRIAN_ONLY")).execute).toBe(false);
  });
});
