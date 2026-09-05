import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { scoutAgent } from "./scout";
import { auditAgent } from "./audit";
import { salesAgent } from "./sales";
import { evaluateAgentAction } from "./controlPolicy";
import type { Agent, AgentName } from "./types";

const REGISTRY: Record<"scout" | "audit" | "sales", Agent> = {
  scout: scoutAgent,
  audit: auditAgent,
  sales: salesAgent,
};

export function listRunnableAgents(): Agent[] {
  return Object.values(REGISTRY);
}

/**
 * Manually triggered — no scheduler here (see ENGINEERING_STANDARDS.md / the V3 plan). Creates
 * an AgentRun row up front so a failure is always recorded, not silently swallowed.
 */
export async function runAgent(name: AgentName): Promise<{ agentRunId: string }> {
  const agent = (REGISTRY as Record<string, Agent | undefined>)[name];
  if (!agent) {
    throw new Error(`"${name}" has no runnable implementation yet.`);
  }

  const agentRun = await prisma.agentRun.create({
    data: { agentName: name, status: "RUNNING" },
  });

  try {
    const actions = await agent.proposeActions({ llmProviderId: "openai" });

    for (const action of actions) {
      const decision = evaluateAgentAction(action);
      if (!decision.execute) {
        await logEvent("agent_action_blocked_for_brian", {
          payload: {
            agentName: name,
            summary: action.summary,
            consequence: action.consequence,
            reason: decision.reason,
          },
        });
        continue;
      }
      await agent.execute(action);
    }

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "COMPLETE", actionsProposed: actions.length, completedAt: new Date() },
    });

    await logEvent("agent_run_completed", {
      payload: { agentName: name, actionsProposed: actions.length },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unexpected error running the agent.";
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: "FAILED", error, completedAt: new Date() },
    });
    await logEvent("agent_run_failed", { payload: { agentName: name, error } });
  }

  return { agentRunId: agentRun.id };
}
