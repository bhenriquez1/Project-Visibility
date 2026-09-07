"use server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { interpretOwnerCommand } from "@/lib/providers/llm";
import { logAiUsage } from "@/lib/cost";
import { setGlobalPauseAction, setAgentPauseAction, runAgentAction } from "./agentActions";
import type { AgentName } from "@/lib/agents/types";

async function owner() {
  const session = await auth();
  if (session?.user?.role !== "owner" || !session.user.email) throw new Error("Owner authentication required.");
  return session.user.email;
}

export async function prepareOwnerCommand(request: string) {
  const email = await owner();
  if (!request.trim() || request.length > 2000) throw new Error("Enter a request of 1–2,000 characters.");
  const result = await interpretOwnerCommand(request);
  if (!result.ok) throw new Error(result.detail);
  await logAiUsage("OwnerCommand", email, result.data.meta);
  const { action, target, explanation } = result.data;
  const links: Record<string, string> = { show_pricing: "/admin/pricing", show_customers: "/admin/customers", show_approvals: "/admin/approvals" };
  if (links[action]) return { message: explanation, href: links[action], token: "" };
  if (action === "unsupported") return { message: explanation, href: "", token: "" };
  const agents = ["scout", "audit", "sales", "onboarding", "growth", "reputation", "analytics", "retention"];
  if (!["pause_all", "pause_agent", "run_agent"].includes(action) || (action !== "pause_all" && !agents.includes(target))) throw new Error("Please specify one supported agent action.");
  const token = randomUUID();
  await prisma.setting.create({ data: { key: `owner_command_${token}`, value: JSON.stringify({ email, action, target, request, expires: Date.now() + 10 * 60 * 1000, status: "pending" }) } });
  const concrete = action === "pause_all" ? "Pause all automation." : action === "pause_agent" ? `Pause the ${target} agent.` : `Run one ${target} agent cycle under the current approval and batch limits.`;
  return { message: `${concrete} ${explanation}`, href: "", token };
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
    if (command.action === "pause_all") await setGlobalPauseAction(true);
    else if (command.action === "pause_agent") await setAgentPauseAction(command.target as AgentName, true);
    else if (command.action === "run_agent") await runAgentAction(command.target as AgentName);
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
