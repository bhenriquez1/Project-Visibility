import type { AgentAction } from "./types";

const NON_CONSEQUENTIAL_ACTIONS = new Set<AgentAction["consequence"]>([
  "INTERNAL_RECORD",
  "ANALYSIS",
  "DRAFT",
]);

export interface ControlDecision {
  execute: boolean;
  reason: string;
}

/**
 * The runner's non-bypassable Brian Control Layer. Agents may analyze, create reversible
 * internal records, and prepare drafts. Anything external, financial, contractual,
 * destructive, or related to account ownership must stop for Brian's explicit action.
 */
export function evaluateAgentAction(action: AgentAction): ControlDecision {
  if (action.controlTier === "BRIAN_ONLY") {
    return { execute: false, reason: "Action is explicitly reserved for Brian." };
  }
  if (!NON_CONSEQUENTIAL_ACTIONS.has(action.consequence)) {
    return {
      execute: false,
      reason: `${action.consequence} actions require Brian's explicit approval and execution.`,
    };
  }
  return { execute: true, reason: "Non-consequential internal work is permitted." };
}
