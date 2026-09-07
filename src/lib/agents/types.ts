/**
 * V3 agent architecture. All 8 of ROADMAP.md's named V3 agents (src/lib/agents/{scout,audit,
 * sales,onboarding,growth,reputation,analytics,retention}.ts) implement this contract and are
 * dispatched by src/lib/agents/runner.ts. `estimateFollowUp` is a 9th, additive agent — it acts
 * on a Prospect's own leads/estimates, a distinct relationship from anything the 8-agent
 * pipeline manages, so it isn't part of ROADMAP.md's named sequence.
 *
 * ENGINEERING_STANDARDS.md: "No premature autonomy" still applies — `AUTOMATIC` is reserved for
 * actions with zero external footprint (creating an internal record, running an audit). Nothing
 * that reaches a real inbox or a customer's public listing is tagged `AUTOMATIC`; see each
 * agent's own comments for why its actions are tagged the way they are.
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
  | "retention"
  | "estimateFollowUp";

/**
 * Mirrors the Prisma `ApprovalTier` enum used by `Message` today. An agent declares the tier
 * its actions fall under; the runtime enforcement of that tier (auto-execute vs. queue for
 * Brian) is V3 scope, not defined here.
 */
export type ControlTier = "AUTOMATIC" | "AI_PREPARED" | "BRIAN_ONLY";

export type AgentConsequence =
  | "INTERNAL_RECORD"
  | "ANALYSIS"
  | "DRAFT"
  | "EXTERNAL_COMMUNICATION"
  | "FINANCIAL"
  | "CONTRACTUAL"
  | "DESTRUCTIVE"
  | "ACCOUNT_OWNERSHIP";

export interface AgentContext {
  prospectId?: string;
  /** Scout only: a specific city to search instead of the configured rotating markets. */
  city?: string;
  /** Scout only: how many new prospects to look for, bounded by the configured batch limit. */
  count?: number;
  /** Which LLM provider this agent's reasoning should route through — see llm/types.ts. */
  llmProviderId: LlmProviderId;
}

export interface AgentAction {
  controlTier: ControlTier;
  consequence: AgentConsequence;
  summary: string;
  payload: unknown;
}

export interface Agent {
  readonly name: AgentName;
  readonly defaultControlTier: ControlTier;
  /**
   * Surveys current state and describes what it would do — read-only, no side effects. The
   * runner (src/lib/agents/runner.ts) decides whether/how to act on each returned action.
   */
  proposeActions(context: AgentContext): Promise<AgentAction[]>;
  /**
   * Performs one proposed action. For `AUTOMATIC` actions this is the real effect (e.g. create
   * a Prospect row, run an audit). For `AI_PREPARED` actions, "executing" means creating the
   * human-facing pending-approval record (e.g. a Message row) — it does NOT mean the action's
   * ultimate effect (sending, posting) happens; that stays behind the existing approve-and-send
   * UI. The runner never calls this for `BRIAN_ONLY` actions.
   */
  execute(action: AgentAction): Promise<void>;
}
