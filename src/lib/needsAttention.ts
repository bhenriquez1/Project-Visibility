import { prisma } from "@/lib/prisma";

export type AttentionCategory =
  | "failed_audit"
  | "missing_contact"
  | "delivery_failure"
  | "unanswered_reply"
  | "overdue_follow_up"
  | "payment_failure"
  | "provider_problem";

export type AttentionItem = {
  category: AttentionCategory;
  prospectId: string | null;
  businessName: string | null;
  detail: string;
  occurredAt: Date;
};

const PROBLEM_EVENT_TYPES = [
  "audit_failed",
  "inbound_email_fetch_failed",
  "inbound_email_unmatched",
  "outreach_bounced",
  "outreach_complained",
  "subscription_payment_failed",
  "agent_action_execution_failed",
  "agent_run_failed",
];

export async function getNeedsAttentionItems(): Promise<AttentionItem[]> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [latestAudits, contactReviewProspects, deliveryFailures, unansweredReplies, overdueFollowUps, pastDueSubscriptions, providerProblems] =
    await Promise.all([
      prisma.audit.findMany({
        distinct: ["prospectId"],
        orderBy: [{ prospectId: "asc" }, { requestedAt: "desc" }],
        include: { prospect: { select: { id: true, businessName: true } } },
      }),
      prisma.prospect.findMany({
        where: { status: { notIn: ["PROSPECT", "LOST"] }, OR: [{ email: null }, { emailVerified: false }] },
        select: { id: true, businessName: true, updatedAt: true },
      }),
      prisma.message.findMany({
        where: { OR: [{ bouncedAt: { not: null } }, { complainedAt: { not: null } }, { failedAt: { not: null } }] },
        orderBy: { createdAt: "desc" },
        include: { prospect: { select: { id: true, businessName: true } } },
      }),
      prisma.prospect.findMany({
        where: { status: "REPLIED" },
        select: { id: true, businessName: true, updatedAt: true },
      }),
      prisma.prospect.findMany({
        where: { nextActionDueAt: { lt: now }, status: { notIn: ["WON", "LOST"] } },
        select: { id: true, businessName: true, nextActionLabel: true, nextActionDueAt: true },
      }),
      prisma.subscription.findMany({
        where: { status: "PAST_DUE" },
        include: { prospect: { select: { id: true, businessName: true } } },
      }),
      prisma.event.findMany({
        where: { type: { in: PROBLEM_EVENT_TYPES }, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { prospect: { select: { id: true, businessName: true } } },
      }),
    ]);

  const items: AttentionItem[] = [];

  for (const audit of latestAudits) {
    if (audit.status !== "FAILED") continue;
    items.push({
      category: "failed_audit",
      prospectId: audit.prospect.id,
      businessName: audit.prospect.businessName,
      detail: audit.error ?? "The most recent audit failed.",
      occurredAt: audit.requestedAt,
    });
  }

  for (const p of contactReviewProspects) {
    items.push({
      category: "missing_contact",
      prospectId: p.id,
      businessName: p.businessName,
      detail: "No verified contact email on file.",
      occurredAt: p.updatedAt,
    });
  }

  for (const m of deliveryFailures) {
    const kind = m.bouncedAt ? "bounced" : m.complainedAt ? "complained" : "failed";
    items.push({
      category: "delivery_failure",
      prospectId: m.prospect.id,
      businessName: m.prospect.businessName,
      detail: `Message ${kind}${m.providerError ? `: ${m.providerError}` : "."}`,
      occurredAt: m.bouncedAt ?? m.complainedAt ?? m.failedAt ?? m.createdAt,
    });
  }

  for (const p of unansweredReplies) {
    items.push({
      category: "unanswered_reply",
      prospectId: p.id,
      businessName: p.businessName,
      detail: "Replied and awaiting review.",
      occurredAt: p.updatedAt,
    });
  }

  for (const p of overdueFollowUps) {
    items.push({
      category: "overdue_follow_up",
      prospectId: p.id,
      businessName: p.businessName,
      detail: p.nextActionLabel ?? "Follow-up is overdue.",
      occurredAt: p.nextActionDueAt!,
    });
  }

  for (const s of pastDueSubscriptions) {
    items.push({
      category: "payment_failure",
      prospectId: s.prospect.id,
      businessName: s.prospect.businessName,
      detail: `Subscription is past due (plan: ${s.plan}).`,
      occurredAt: s.updatedAt,
    });
  }

  for (const e of providerProblems) {
    items.push({
      category: "provider_problem",
      prospectId: e.prospect?.id ?? e.prospectId ?? null,
      businessName: e.prospect?.businessName ?? null,
      detail: e.type,
      occurredAt: e.createdAt,
    });
  }

  return items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
