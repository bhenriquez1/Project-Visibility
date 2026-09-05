import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { runAudit } from "@/lib/audit/runAudit";

const requestSchema = z.object({
  businessName: z.string().min(1).max(200),
  website: z.string().min(1).max(500),
  city: z.string().min(1).max(200),
  email: z.string().email(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { businessName, website, city, email } = parsed.data;

  const prospect = await prisma.prospect.upsert({
    where: { email },
    update: { businessName, website, city },
    create: { businessName, website, city, email },
  });

  const audit = await prisma.audit.create({
    data: { prospectId: prospect.id },
  });

  await logEvent("audit_requested", { prospectId: prospect.id, payload: { auditId: audit.id } });

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

  return NextResponse.json({ auditId: audit.id });
}
