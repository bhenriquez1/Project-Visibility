"use server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { interpretOwnerCommand } from "@/lib/providers/llm";
import { logAiUsage } from "@/lib/cost";
import { setGlobalPauseAction, setAgentPauseAction, runAgentAction } from "./agentActions";
import type { AgentName } from "@/lib/agents/types";
import { isGlobalAutomationPaused, isAgentPaused } from "@/lib/automationPause";
import { getAgentBatchLimit } from "@/lib/agentOperations";
import { getNeedsAttentionItems } from "@/lib/needsAttention";

async function owner() {
  const session = await auth();
  if (session?.user?.role !== "owner" || !session.user.email) throw new Error("Owner authentication required.");
  return session.user.email;
}

type CommandPreview = { affectedRecords: number | null; limit: number | null; consequence: string };

async function buildCommandPreview(action: string, target: string, city: string, count: number, resume: boolean): Promise<CommandPreview> {
  if (action === "pause_all") {
    const currentlyPaused = await isGlobalAutomationPaused();
    return {
      affectedRecords: null,
      limit: null,
      consequence: resume
        ? currentlyPaused ? "Resumes all automated agent runs immediately." : "Automation is not currently globally paused; this has no effect."
        : currentlyPaused ? "Automation is already globally paused; this has no effect." : "Pauses all automated agent runs immediately; nothing new runs until resumed.",
    };
  }
  if (action === "pause_agent") {
    const currentlyPaused = await isAgentPaused(target as AgentName);
    return {
      affectedRecords: null,
      limit: null,
      consequence: resume
        ? currentlyPaused ? `Resumes the ${target} agent immediately.` : `The ${target} agent is not currently paused; this has no effect.`
        : currentlyPaused ? `The ${target} agent is already paused; this has no effect.` : `Pauses the ${target} agent immediately; it will not run again until resumed.`,
    };
  }
  const limit = await getAgentBatchLimit(target as AgentName);
  if (target === "scout") {
    const effectiveLimit = count > 0 ? Math.min(count, limit) : limit;
    const cityLabel = city.trim() || "the configured rotating target markets";
    return { affectedRecords: null, limit: effectiveLimit, consequence: `Searches Google Places for up to ${effectiveLimit} real, verified businesses in ${cityLabel}. Only new, non-duplicate matches are added as prospects — no email is sent and nothing is charged.` };
  }
  if (target === "audit") {
    const affected = await prisma.prospect.count({ where: { status: "PROSPECT", audits: { none: {} } } });
    return { affectedRecords: affected, limit, consequence: `Runs a structured audit on up to ${Math.min(affected, limit)} of ${affected} real prospect(s) with no audit yet. A failed audit is recorded honestly, never fabricated.` };
  }
  if (target === "sales") {
    const affected = await prisma.prospect.count({ where: { status: "AUDITED", messages: { none: {} } } });
    return { affectedRecords: affected, limit, consequence: `Drafts outreach for up to ${Math.min(affected, limit)} of ${affected} real audited prospect(s) with no message yet. Every draft cites real audit findings and requires your approval before sending.` };
  }
  return { affectedRecords: null, limit, consequence: `Runs one internal cycle of the ${target} agent under existing approval controls (up to ${limit} actions).` };
}

export async function prepareOwnerCommand(request: string) {
  const email = await owner();
  if (!request.trim() || request.length > 2000) throw new Error("Enter a request of 1–2,000 characters.");
  const result = await interpretOwnerCommand(request);
  if (!result.ok) throw new Error(result.detail);
  await logAiUsage("OwnerCommand", email, result.data.meta);
  const { action, target, city, count, resume, explanation } = result.data;
  if (action === "show_needs_attention") {
    const items = await getNeedsAttentionItems();
    const unanswered = items.filter((i) => i.category === "unanswered_reply").length;
    return { message: `${items.length} item(s) need attention (${unanswered} unanswered ${unanswered === 1 ? "reply" : "replies"}). ${explanation}`, href: "/admin/needs-attention", token: "", preview: null };
  }
  const links: Record<string, string> = { show_pricing: "/admin/pricing", show_customers: "/admin/customers", show_approvals: "/admin/approvals" };
  if (links[action]) return { message: explanation, href: links[action], token: "", preview: null };
  if (action === "unsupported") return { message: explanation, href: "", token: "", preview: null };
  const agents = ["scout", "audit", "sales", "onboarding", "growth", "reputation", "analytics", "retention"];
  if (!["pause_all", "pause_agent", "run_agent"].includes(action) || (action !== "pause_all" && !agents.includes(target))) throw new Error("Please specify one supported agent action.");
  const preview = await buildCommandPreview(action, target, city, count, resume);
  const token = randomUUID();
  await prisma.setting.create({ data: { key: `owner_command_${token}`, value: JSON.stringify({ email, action, target, city, count, resume, request, expires: Date.now() + 10 * 60 * 1000, status: "pending" }) } });
  const concrete = action === "pause_all" ? (resume ? "Resume all automation." : "Pause all automation.") : action === "pause_agent" ? `${resume ? "Resume" : "Pause"} the ${target} agent.` : `Run one ${target} agent cycle under the current approval and batch limits.`;
  return { message: `${concrete} ${explanation}`, href: "", token, preview };
}

export async function executeOwnerCommand(token: string) {
  const email = await owner();
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("Invalid command.");
  const key = `owner_command_${token}`;
  const row = await prisma.setting.findUniqueOrThrow({ where: { key } });
  const command = JSON.parse(row.value);
  if (command.email !== email || command.status !== "pending" || command.expires < Date.now()) throw new Error("Command expired or already executed. Submit a new request.");
  const claim = await prisma.setting.updateMany({ where: { key, value: row.value }, data: { value: JSON.stringify({ ...command, status: "running" }) } });
  if (claim.count !== 1) throw new Error("Command is already being handled.");
  try {
    if (command.action === "pause_all") await setGlobalPauseAction(!command.resume);
    else if (command.action === "pause_agent") await setAgentPauseAction(command.target as AgentName, !command.resume);
    else if (command.action === "run_agent") await runAgentAction(command.target as AgentName, command.target === "scout" ? { city: command.city, count: command.count } : undefined);
    else throw new Error("Unsupported command.");
    await prisma.event.create({ data: { type: "owner_command_completed", payload: { email, action: command.action, target: command.target, token } } });
    await prisma.setting.update({ where: { key }, data: { value: JSON.stringify({ ...command, status: "complete" }) } });
    return "Command completed. Agent cycles use the existing approval queue; review results in Agents and Approval Center.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Command failed";
    await prisma.event.create({ data: { type: "owner_command_failed", payload: { email, token, detail } } });
    throw new Error(detail);
  }
}
