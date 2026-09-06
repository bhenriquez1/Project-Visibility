"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agents/runner";
import { setAgentPaused, setGlobalAutomationPaused } from "@/lib/automationPause";
import { logEvent } from "@/lib/events";
import type { AgentName } from "@/lib/agents/types";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "owner") {
    throw new Error("Not authenticated as the owner.");
  }
}

export async function runAgentAction(name: AgentName) {
  await requireAdmin();
  await runAgent(name);
  revalidatePath("/admin/agents");
  revalidatePath("/admin/pipeline");
}

export async function setGlobalPauseAction(paused: boolean) {
  await requireAdmin();
  await setGlobalAutomationPaused(paused);
  await logEvent("automation_paused_global_changed", { payload: { paused } });
  revalidatePath("/admin/agents");
}

export async function setAgentPauseAction(name: AgentName, paused: boolean) {
  await requireAdmin();
  await setAgentPaused(name, paused);
  await logEvent("automation_paused_agent_changed", { payload: { agentName: name, paused } });
  revalidatePath("/admin/agents");
}

export async function updateScoutMarketsAction(formData: FormData) {
  await requireAdmin();

  const raw = String(formData.get("markets") ?? "[]");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Target markets must be valid JSON — see the example format above the field.");
  }

  if (
    !Array.isArray(parsed) ||
    !parsed.every((m) => typeof m?.category === "string" && typeof m?.city === "string")
  ) {
    throw new Error('Target markets must be an array of {"category": string, "city": string} objects.');
  }

  await prisma.setting.upsert({
    where: { key: "scout_target_markets" },
    update: { value: JSON.stringify(parsed) },
    create: { key: "scout_target_markets", value: JSON.stringify(parsed) },
  });

  revalidatePath("/admin/agents");
}
