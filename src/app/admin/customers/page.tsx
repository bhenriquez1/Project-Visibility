export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveStoredPlan } from "@/lib/plans";
import { computeRetentionSignals, type RetentionRisk } from "@/lib/retention";
import { startImpersonation } from "@/lib/actions/impersonationActions";

const RISK_STYLES: Record<RetentionRisk, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  high: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function CustomersPage() {
  const customers = await prisma.prospect.findMany({
    where: { status: "WON" },
    orderBy: { updatedAt: "desc" },
    include: {
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
      googleBusinessConnection: { select: { revokedAt: true } },
    },
  });

  const retentionByProspect = new Map(
    await Promise.all(customers.map(async (c) => [c.id, await computeRetentionSignals(c.id)] as const))
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">Customers</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every paying customer — plan, subscription health, and retention risk.
      </p>

      {customers.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">No customers yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {customers.map((c) => {
            const sub = c.subscriptions[0];
            const plan = sub ? resolveStoredPlan(sub.plan) : null;
            const risk = retentionByProspect.get(c.id)?.riskLevel ?? "low";
            const gbpConnected = c.googleBusinessConnection && !c.googleBusinessConnection.revokedAt;

            return (
              <div key={c.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/admin/prospects/${c.id}`} className="font-medium hover:underline">
                      {c.businessName}
                    </Link>
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
                  <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {gbpConnected ? "GBP connected" : "GBP not connected"}
                  </span>
                  <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
                    {c.lastLoginAt ? `last login ${c.lastLoginAt.toLocaleDateString()}` : "never logged in"}
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
