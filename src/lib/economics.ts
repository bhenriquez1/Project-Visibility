import { prisma } from "@/lib/prisma";

const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FLAT_FEE_CENTS = 30;

async function getSettingCents(key: string): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting ? Number(setting.value) : 0;
}

export interface CustomerEconomics {
  prospectId: string;
  businessName: string;
  mrrCents: number;
  paymentFeeCents: number;
  aiCostCents: number;
  dataCostCents: number;
  infraShareCents: number;
  supportCostCents: number;
  contributionMarginCents: number;
}

export interface EconomicsSummary {
  mrrCents: number;
  arrCents: number;
  activeCustomerCount: number;
  canceledCustomerCount: number;
  churnRate: number | null;
  cacCents: number | null;
  ltvCents: number | null;
  grossMarginPct: number | null;
  totalAiCostCents: number;
  totalDataCostCents: number;
  funnelCounts: Record<string, number>;
  conversionRatePct: number | null;
  perCustomer: CustomerEconomics[];
}

export async function computeEconomics(): Promise<EconomicsSummary> {
  const [activeSubs, canceledSubs, allProspects, infraTotalCents, supportPerCustomerCents] =
    await Promise.all([
      prisma.subscription.findMany({ where: { status: "ACTIVE" }, include: { prospect: true } }),
      prisma.subscription.count({ where: { status: "CANCELED" } }),
      prisma.prospect.findMany({ select: { status: true } }),
      getSettingCents("infra_cost_cents_total_per_month"),
      getSettingCents("support_cost_cents_per_customer_per_month"),
    ]);

  const mrrCents = activeSubs.reduce((sum, s) => sum + s.priceCents, 0);
  const arrCents = mrrCents * 12;
  const activeCustomerCount = activeSubs.length;
  const infraShareCents = activeCustomerCount > 0 ? infraTotalCents / activeCustomerCount : 0;

  const churnRate =
    activeCustomerCount + canceledSubs > 0 ? canceledSubs / (activeCustomerCount + canceledSubs) : null;

  const arpuCents = activeCustomerCount > 0 ? mrrCents / activeCustomerCount : 0;
  const ltvCents = churnRate && churnRate > 0 ? arpuCents / churnRate : null;

  const adSpendCents = await getSettingCents("manual_ad_outreach_spend_cents");
  const wonCount = allProspects.filter((p) => p.status === "WON").length;
  const cacCents = wonCount > 0 ? adSpendCents / wonCount : null;

  const funnelCounts: Record<string, number> = {};
  for (const p of allProspects) {
    funnelCounts[p.status] = (funnelCounts[p.status] ?? 0) + 1;
  }
  const conversionRatePct =
    allProspects.length > 0 ? (wonCount / allProspects.length) * 100 : null;

  const perCustomer: CustomerEconomics[] = [];
  let totalAiCostCents = 0;
  let totalDataCostCents = 0;

  for (const sub of activeSubs) {
    const audits = await prisma.audit.findMany({
      where: { prospectId: sub.prospectId },
      select: { id: true },
    });
    const auditIds = audits.map((a) => a.id);

    const [auditAiUsage, prospectKeyedAiUsage, dataUsage] = await Promise.all([
      prisma.aiUsage.aggregate({
        where: { relatedType: "Audit", relatedId: { in: auditIds } },
        _sum: { costCents: true },
      }),
      // Message (V1 outreach), ReviewReply and GrowthManagerQuestion (V2) all key AiUsage by
      // prospectId directly rather than by their own row id — see lib/actions/*.ts.
      prisma.aiUsage.aggregate({
        where: {
          relatedType: { in: ["Message", "ReviewReply", "GrowthManagerQuestion"] },
          relatedId: sub.prospectId,
        },
        _sum: { costCents: true },
      }),
      prisma.apiCallLog.aggregate({
        where: { relatedType: "Audit", relatedId: { in: auditIds } },
        _sum: { costCents: true },
      }),
    ]);

    const aiCostCents = (auditAiUsage._sum.costCents ?? 0) + (prospectKeyedAiUsage._sum.costCents ?? 0);
    const dataCostCents = dataUsage._sum.costCents ?? 0;
    const paymentFeeCents = sub.priceCents * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE_CENTS;

    totalAiCostCents += aiCostCents;
    totalDataCostCents += dataCostCents;

    perCustomer.push({
      prospectId: sub.prospectId,
      businessName: sub.prospect.businessName,
      mrrCents: sub.priceCents,
      paymentFeeCents,
      aiCostCents,
      dataCostCents,
      infraShareCents,
      supportCostCents: supportPerCustomerCents,
      contributionMarginCents:
        sub.priceCents -
        paymentFeeCents -
        aiCostCents -
        dataCostCents -
        infraShareCents -
        supportPerCustomerCents,
    });
  }

  const totalCostCents =
    totalAiCostCents +
    totalDataCostCents +
    infraTotalCents +
    supportPerCustomerCents * activeCustomerCount +
    activeSubs.reduce((sum, s) => sum + (s.priceCents * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE_CENTS), 0);

  const grossMarginPct = mrrCents > 0 ? ((mrrCents - totalCostCents) / mrrCents) * 100 : null;

  return {
    mrrCents,
    arrCents,
    activeCustomerCount,
    canceledCustomerCount: canceledSubs,
    churnRate,
    cacCents,
    ltvCents,
    grossMarginPct,
    totalAiCostCents,
    totalDataCostCents,
    funnelCounts,
    conversionRatePct,
    perCustomer,
  };
}
