/**
 * V3 agent architecture — TYPES ONLY. Nothing in this file is wired up or executed; it exists
 * so the eventual Scout → Audit → Sales → Onboarding → Growth → Reputation → Analytics →
 * Retention pipeline (see ROADMAP.md) has a contract to implement against, without building
 * autonomous behavior before V1/V2 have produced the real-world data to justify it.
 *
 * ENGINEERING_STANDARDS.md: "No premature autonomy" applies to this file as much as anywhere —
 * do not add a runner/scheduler/executor here until V3 is actually being built.
 */

import type { LlmProviderId } from "@/lib/providers/llm/types";

export type AgentName =
  | "scout"
  | "audit"
  | "sales"
  | "onboarding"
  | "growth"
  | "reputation"
  | "analytics"
  | "retention";

/**
 * Mirrors the Prisma `ApprovalTier` enum used by `Message` today. An agent declares the tier
 * its actions fall under; the runtime enforcement of that tier (auto-execute vs. queue for
 * Brian) is V3 scope, not defined here.
 */
export type ControlTier = "AUTOMATIC" | "AI_PREPARED" | "BRIAN_ONLY";

export interface AgentContext {
  prospectId?: string;
  /** Which LLM provider this agent's reasoning should route through — see llm/types.ts. */
  llmProviderId: LlmProviderId;
}

export interface AgentAction {
  controlTier: ControlTier;
  summary: string;
  payload: unknown;
}

export interface Agent {
  readonly name: AgentName;
  readonly defaultControlTier: ControlTier;
  /**
   * Proposes actions given the current context. Returning actions is not the same as
   * executing them — that dispatch/approval loop is V3 scope.
   */
  proposeActions(context: AgentContext): Promise<AgentAction[]>;
}
