import { prisma } from "@/lib/prisma";
import type { AgentName } from "@/lib/agents/types";
import { isAgentPaused, isGlobalAutomationPaused } from "@/lib/automationPause";

export type AutonomyLevel = "MANUAL" | "ASSISTED" | "AUTONOMOUS";
export type AgentOperatingState = "AUTONOMOUS" | "APPROVAL_REQUIRED" | "PAUSED" | "DEGRADED" | "ERROR";

export const AGENT_NAMES: AgentName[] = [
  "scout", "audit", "sales", "onboarding", "growth", "reputation", "analytics", "retention",
];

export const DEFAULT_INTERVAL_MINUTES: Record<AgentName, number> = {
  scout: 360,
  audit: 30,
  sales: 60,
  onboarding: 60,
  growth: 1440,
  reputation: 360,
  analytics: 1440,
  retention: 1440,
};

export async function getAutonomyLevel(): Promise<AutonomyLevel> {
  const setting = await prisma.setting.findUnique({ where: { key: "autonomy_level" } });
  return setting?.value === "MANUAL" || setting?.value === "AUTONOMOUS" ? setting.value : "ASSISTED";
}

export async function getAgentIntervalMinutes(name: AgentName): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: `agent_interval_minutes_${name}` } });
  const parsed = Number(setting?.value);
  return Number.isFinite(parsed) && parsed >= 15 ? Math.floor(parsed) : DEFAULT_INTERVAL_MINUTES[name];
}

export async function getAgentBatchLimit(name: AgentName): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: `agent_batch_limit_${name}` } });
  const parsed = Number(setting?.value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.floor(parsed), 100) : name === "scout" ? 10 : 25;
}

export async function isProspectPaused(prospectId: string): Promise<boolean> {
  const setting = await prisma.setting.findUnique({ where: { key: `prospect_paused_${prospectId}` } });
  return setting?.value === "true";
}

export async function setProspectPaused(prospectId: string, paused: boolean): Promise<void> {
  await prisma.setting.upsert({
    where: { key: `prospect_paused_${prospectId}` },
    update: { value: String(paused) },
    create: { key: `prospect_paused_${prospectId}`, value: String(paused) },
  });
}

function providerConfigured(name: AgentName): boolean {
  if (name === "scout") return Boolean(process.env.GOOGLE_PLACES_API_KEY);
  if (["audit", "sales", "onboarding", "growth", "reputation", "retention"].includes(name)) {
    const ai = (process.env.AI_PROVIDER || "openai").toLowerCase();
    return ai === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.OPENAI_API_KEY);
  }
  return true;
}

export async function getAgentOperatingState(name: AgentName): Promise<AgentOperatingState> {
  if ((await isGlobalAutomationPaused()) || (await isAgentPaused(name))) return "PAUSED";
  const lastRun = await prisma.agentRun.findFirst({ where: { agentName: name }, orderBy: { startedAt: "desc" } });
  if (lastRun?.status === "FAILED") return "ERROR";
  if (!providerConfigured(name)) return "DEGRADED";
  const level = await getAutonomyLevel();
  if (level === "MANUAL") return "APPROVAL_REQUIRED";
  if (level === "ASSISTED") return name === "scout" || name === "audit" || name === "analytics"
    ? "AUTONOMOUS"
    : "APPROVAL_REQUIRED";
  return "AUTONOMOUS";
}

export async function isAgentDue(name: AgentName): Promise<boolean> {
  const interval = await getAgentIntervalMinutes(name);
  const lastRun = await prisma.agentRun.findFirst({ where: { agentName: name }, orderBy: { startedAt: "desc" } });
  return !lastRun || Date.now() - lastRun.startedAt.getTime() >= interval * 60_000;
}
