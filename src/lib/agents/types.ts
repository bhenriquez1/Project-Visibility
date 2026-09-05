/**
 * V3 agent architecture. Scout/Audit/Sales (src/lib/agents/{scout,audit,sales}.ts) implement
 * this contract and are dispatched by src/lib/agents/runner.ts. Onboarding/Growth/Reputation/
 * Analytics/Retention (see ROADMAP.md) don't have implementations yet — the `AgentName` union
 * already lists them so adding one later doesn't require touching this file again.
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
