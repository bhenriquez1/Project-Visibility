import { prisma } from "@/lib/prisma";
import { resolveStoredPlan, type PlanDefinition, type PlanEntitlements } from "@/lib/plans";

function currentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function requireActivePlan(prospectId: string): Promise<PlanDefinition> {
  const subscription = await prisma.subscription.findFirst({
    where: { prospectId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) throw new Error("An active subscription is required for this service.");

  const plan = resolveStoredPlan(subscription.plan);
  if (!plan) throw new Error(`Subscription plan "${subscription.plan}" is not recognized.`);
  return plan;
}

function assertBelowLimit(label: string, used: number, limit: number, plan: PlanDefinition) {
  if (used >= limit) {
    throw new Error(
      `${plan.name} plan monthly limit reached for ${label} (${used}/${limit}). Brian must approve any additional service.`
    );
  }
}

export async function assertMonthlyEventEntitlement(
  prospectId: string,
  entitlement: keyof PlanEntitlements,
  eventType: string,
  label: string
) {
  const plan = await requireActivePlan(prospectId);
  const limit = plan.entitlements[entitlement];
  if (typeof limit !== "number") throw new Error(`${label} is not a numeric plan entitlement.`);

  const used = await prisma.event.count({
    where: { prospectId, type: eventType, createdAt: { gte: currentMonthStart() } },
  });
  assertBelowLimit(label, used, limit, plan);
}

export async function assertMonthlyAiEntitlement(
  prospectId: string,
  entitlement: keyof PlanEntitlements,
  relatedType: string,
  label: string
) {
  const plan = await requireActivePlan(prospectId);
  const limit = plan.entitlements[entitlement];
  if (typeof limit !== "number") throw new Error(`${label} is not a numeric plan entitlement.`);

  // AiUsage.relatedId means different things per relatedType: Message/ReviewReply/
  // GrowthManagerQuestion key it directly by prospectId, but Audit keys it by the Audit row's
  // own id (see logAiUsage("Audit", auditId, ...) in runAudit.ts, and the same indirection in
  // economics.ts). Querying relatedId: prospectId for "Audit" would always read 0 usage and
  // never actually enforce the limit.
  const relatedIds =
    relatedType === "Audit"
      ? (await prisma.audit.findMany({ where: { prospectId }, select: { id: true } })).map((a) => a.id)
      : [prospectId];

  const used =
    relatedIds.length === 0
      ? 0
      : await prisma.aiUsage.count({
          where: { relatedType, relatedId: { in: relatedIds }, createdAt: { gte: currentMonthStart() } },
        });
  assertBelowLimit(label, used, limit, plan);
}

export async function assertAgentCostBudget(prospectId: string) {
  const plan = await requireActivePlan(prospectId);
  const since = currentMonthStart();
  const auditIds = (
    await prisma.audit.findMany({ where: { prospectId }, select: { id: true } })
  ).map((audit) => audit.id);

  const [auditAi, customerAi, data] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { relatedType: "Audit", relatedId: { in: auditIds }, createdAt: { gte: since } },
      _sum: { costCents: true },
    }),
    prisma.aiUsage.aggregate({
      where: { relatedId: prospectId, relatedType: { not: "Audit" }, createdAt: { gte: since } },
      _sum: { costCents: true },
    }),
    prisma.apiCallLog.aggregate({
      where: { relatedType: "Audit", relatedId: { in: auditIds }, createdAt: { gte: since } },
      _sum: { costCents: true },
    }),
  ]);

  const used =
    (auditAi._sum.costCents ?? 0) +
    (customerAi._sum.costCents ?? 0) +
    (data._sum.costCents ?? 0);
  const limit = plan.entitlements.includedAgentCostCentsPerMonth;
  if (used >= limit) {
    throw new Error(
      `${plan.name} plan included agent-cost budget is exhausted (${used.toFixed(2)}/${limit} cents). Brian must approve additional usage.`
    );
  }
}
