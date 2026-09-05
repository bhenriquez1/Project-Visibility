import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { runAudit } from "@/lib/audit/runAudit";
import type { Agent, AgentAction } from "./types";

interface AuditPayload {
  prospectId: string;
}

export const auditAgent: Agent = {
  name: "audit",
  // Runs the exact same audit pipeline a prospect's own form submission already triggers
  // automatically in V1 (src/lib/audit/runAudit.ts, unchanged) — no new external effect.
  defaultControlTier: "AUTOMATIC",

  async proposeActions(): Promise<AgentAction[]> {
    const candidates = await prisma.prospect.findMany({
      where: { status: "PROSPECT", audits: { none: {} } },
      select: { id: true, businessName: true, city: true },
      take: 25,
    });

    return candidates.map((p) => ({
      controlTier: "AUTOMATIC",
      consequence: "ANALYSIS",
      summary: `Run audit: ${p.businessName} (${p.city})`,
      payload: { prospectId: p.id } satisfies AuditPayload,
    }));
  },

  async execute(action: AgentAction): Promise<void> {
    const { prospectId } = action.payload as AuditPayload;

    const audit = await prisma.audit.create({ data: { prospectId } });
    await logEvent("audit_requested", { prospectId, payload: { auditId: audit.id, source: "audit_agent" } });

    try {
      await runAudit(audit.id);
    } catch (err) {
      await prisma.audit.update({
        where: { id: audit.id },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Unexpected error running the audit.",
          completedAt: new Date(),
        },
      });
    }
  },
};
