export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveStoredPlan } from "@/lib/plans";
import { getPricingCatalog, resolveCatalogPlan } from "@/lib/pricingCatalog";
import { customerOfferSchema } from "@/lib/customerOffers";
import { computeRetentionSignals, type RetentionRisk } from "@/lib/retention";
import { startImpersonation } from "@/lib/actions/impersonationActions";

const RISK_STYLES: Record<RetentionRisk, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  // Defaults to real paying customers only — QA/internal fixtures never count toward this list
  // unless explicitly requested. See ProspectCategory.
  const category = String(query.category ?? "production");
  const catalog = await getPricingCatalog();
  const customers = await prisma.prospect.findMany({
    where: {
      status: "WON",
      ...(category === "production" ? { category: "PRODUCTION" as const } : category === "internal" ? { category: "INTERNAL" as const } : category === "qa_test" ? { category: "QA_TEST" as const } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      googleBusinessConnection: { select: { revokedAt: true } },
    },
  });

  const retentionByProspect = new Map(
    await Promise.all(customers.map(async (c) => [c.id, await computeRetentionSignals(c.id)] as const))
  );

  const planByProspect = new Map(
    await Promise.all(
      customers.map(async (c) => {
        const sub = c.subscriptions[0];
        if (!sub) return [c.id, null] as const;
        const plan = (await resolveCatalogPlan(sub.plan)) ?? resolveStoredPlan(sub.plan);
        return [c.id, plan] as const;
      })
    )
  );

  const offerByProspect = new Map(
    await Promise.all(
      customers.map(async (c) => {
        const row = await prisma.setting.findUnique({ where: { key: `customer_offer_${c.id}` } });
        if (!row) return [c.id, null] as const;
        try {
          return [c.id, customerOfferSchema.parse(JSON.parse(row.value))] as const;
        } catch {
          return [c.id, null] as const;
        }
      })
    )
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Customers</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every paying customer — plan, subscription health, and retention risk.
      </p>

      <form className="mt-4 flex items-center gap-2 text-sm">
        <label htmlFor="category" className="text-xs text-black/60 dark:text-white/60">Show</label>
        <select id="category" name="category" defaultValue={category} className="rounded border px-2 py-1.5 dark:bg-black/20">
          <option value="production">Production (real customers)</option>
          <option value="internal">Internal Avrrio</option>
          <option value="qa_test">QA / Test fixtures</option>
          <option value="all">All categories</option>
        </select>
        <button className="rounded bg-black px-3 py-1.5 text-xs text-white dark:bg-white dark:text-black">Apply</button>
      </form>

      {customers.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">No customers yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {customers.map((c) => {
            const sub = c.subscriptions[0];
            const plan = planByProspect.get(c.id) ?? null;
            const risk = retentionByProspect.get(c.id)?.riskLevel ?? "low";
            const gbpConnected = c.googleBusinessConnection && !c.googleBusinessConnection.revokedAt;
            const addonNames = (plan?.addonIds ?? []).map(id => catalog.addons.find(a => a.id === id)?.name ?? id);
            const offer = offerByProspect.get(c.id);

            return (
              <div key={c.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/admin/prospects/${c.id}`} className="font-medium hover:underline">
                      {c.businessName}
                    </Link>
                    {c.category !== "PRODUCTION" && (
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.category === "QA_TEST" ? "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300" : "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300"}`}>
                        {c.category === "QA_TEST" ? "QA-TEST" : "INTERNAL"}
                      </span>
                    )}
                    <p className="text-xs text-black/50 dark:text-white/50">{c.city}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_STYLES[risk]}`}>
                    {risk} risk
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-black/60 dark:text-white/60">
                  <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {plan ? plan.name : "no plan resolved"} {sub ? `· ${sub.status}` : "· no subscription"}
                  </span>
                  {addonNames.length > 0 && (
                    <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                      Add-ons: {addonNames.join(", ")}
                    </span>
                  )}
                  {offer && (
                    <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                      Custom offer: {offer.plan.name} ${(offer.plan.monthlyPriceCents / 100).toFixed(2)}/mo
                      {offer.founding ? ", Founding" : ""}
                      {offer.revoked ? " — revoked" : ""}
                    </span>
                  )}
                  <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {gbpConnected ? "GBP connected" : "GBP not connected"}
                  </span>
                  <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {c.lastLoginAt ? `last login ${c.lastLoginAt.toLocaleDateString()}` : "never logged in"}
                  </span>
                  <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {c.onboardingCompletedAt
                      ? "onboarding complete"
                      : `onboarding: missing ${!gbpConnected ? "GBP" : ""}${!gbpConnected && !c.businessObjectives ? " & " : ""}${!c.businessObjectives ? "goals" : ""}`}
                  </span>
                </div>
                <form
                  action={async () => {
                    "use server";
                    await startImpersonation(c.id);
                  }}
                  className="mt-3"
                >
                  <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                    View as customer
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
