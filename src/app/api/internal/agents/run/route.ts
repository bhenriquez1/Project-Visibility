import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AGENT_NAMES, getAgentOperatingState, isAgentDue } from "@/lib/agentOperations";
import { runAgent } from "@/lib/agents/runner";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ran: string[] = [];
  const skipped: Array<{ agent: string; reason: string }> = [];

  for (const name of AGENT_NAMES) {
    const state = await getAgentOperatingState(name);
    if (state !== "AUTONOMOUS") {
      skipped.push({ agent: name, reason: state });
      continue;
    }
    if (!(await isAgentDue(name))) {
      skipped.push({ agent: name, reason: "NOT_DUE" });
      continue;
    }
    await runAgent(name);
    ran.push(name);
  }

  await logEvent("scheduled_agent_cycle_completed", { payload: { ran, skipped } });
  return NextResponse.json({ ok: true, ran, skipped });
}
