"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { runAudit } from "@/lib/audit/runAudit";
import { generateOutreachDraftAction } from "@/lib/actions/prospectActions";
import { isProspectPaused, setProspectPaused } from "@/lib/agentOperations";

async function requireOwner(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "owner") throw new Error("Not authenticated as the owner.");
  return session.user.email;
}

export async function runPipelineBulkAction(formData: FormData) {
  const ownerEmail = await requireOwner();
  const action = String(formData.get("bulkAction") ?? "");
  const ids = formData.getAll("prospectId").map(String).slice(0, 100);
  if (ids.length === 0) throw new Error("Select at least one prospect.");

  if (action === "run_audit") {
    for (const prospectId of ids) {
      if (await isProspectPaused(prospectId)) continue;
      const audit = await prisma.audit.create({ data: { prospectId } });
      await logEvent("audit_requested", { prospectId, payload: { auditId: audit.id, source: "owner_bulk_action" } });
      await runAudit(audit.id);
    }
  } else if (action === "prepare_outreach") {
    for (const prospectId of ids) if (!(await isProspectPaused(prospectId))) await generateOutreachDraftAction(prospectId);
  } else if (action === "approve_outreach") {
    await prisma.message.updateMany({
      where: { prospectId: { in: ids }, direction: "OUTBOUND", status: "PENDING_APPROVAL" },
      data: { status: "APPROVED", approvedBy: ownerEmail, approvedAt: new Date() },
    });
    await logEvent("outreach_batch_approved", { payload: { prospectIds: ids, approvedBy: ownerEmail } });
  } else if (action === "pause") {
    for (const prospectId of ids) await setProspectPaused(prospectId, true);
    await logEvent("prospects_paused", { payload: { prospectIds: ids, ownerEmail } });
  } else if (action === "contact") {
    throw new Error("Bulk sending remains locked until unsubscribe handling, sending-domain health, rate limits, and contact-source compliance are verified.");
  } else {
    throw new Error("Unknown bulk action.");
  }

  revalidatePath("/admin/pipeline");
}

export async function setProspectPauseAction(prospectId: string, paused: boolean) {
  const ownerEmail = await requireOwner();
  await setProspectPaused(prospectId, paused);
  await logEvent("prospect_pause_changed", { prospectId, payload: { paused, ownerEmail } });
  revalidatePath(`/admin/prospects/${prospectId}`);
  revalidatePath("/admin/pipeline");
}
