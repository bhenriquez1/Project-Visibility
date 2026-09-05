import { prisma } from "@/lib/prisma";
import type { AgentName } from "@/lib/agents/types";

const GLOBAL_KEY = "automation_paused_global";
const agentKey = (name: AgentName) => `automation_paused_agent_${name}`;

async function isPaused(key: string): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value === "true";
}

async function setPaused(key: string, paused: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: String(paused) },
    create: { key, value: String(paused) },
  });
}

export const isGlobalAutomationPaused = () => isPaused(GLOBAL_KEY);
export const setGlobalAutomationPaused = (paused: boolean) => setPaused(GLOBAL_KEY, paused);

export const isAgentPaused = (name: AgentName) => isPaused(agentKey(name));
export const setAgentPaused = (name: AgentName, paused: boolean) => setPaused(agentKey(name), paused);

/**
 * The single check every outbound/automated action goes through. Throws with a clear message
 * rather than silently no-op'ing — pausing must be visibly effective, not a quiet swallow.
 */
export async function assertAutomationNotPaused(agentName?: AgentName): Promise<void> {
  if (await isGlobalAutomationPaused()) {
    throw new Error("Automation is globally paused. Resume it from the Owner Command Center to continue.");
  }
  if (agentName && (await isAgentPaused(agentName))) {
    throw new Error(`The ${agentName} agent is paused. Resume it from the Owner Command Center to continue.`);
  }
}
