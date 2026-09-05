export const dynamic = "force-dynamic";
import { computeEconomics } from "@/lib/economics";
import { formatCents } from "@/lib/money";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

export default async function EconomicsDashboardPage() {
  const econ = await computeEconomics();

  return (
    <div>
      <h1 className="text-xl font-semibold">Is this making money?</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="MRR" value={formatCents(econ.mrrCents)} />
        <Stat label="ARR" value={formatCents(econ.arrCents)} />
        <Stat label="Active customers" value={String(econ.activeCustomerCount)} />
        <Stat label="Churn" value={econ.churnRate !== null ? `${(econ.churnRate * 100).toFixed(1)}%` : "N/A"} />
        <Stat label="CAC" value={econ.cacCents !== null ? formatCents(econ.cacCents) : "N/A"} />
        <Stat label="LTV" value={econ.ltvCents !== null ? formatCents(econ.ltvCents) : "N/A"} />
        <Stat
          label="Gross margin"
          value={econ.grossMarginPct !== null ? `${econ.grossMarginPct.toFixed(1)}%` : "N/A"}
        />
        <Stat
          label="Funnel conversion"
          value={econ.conversionRatePct !== null ? `${econ.conversionRatePct.toFixed(1)}%` : "N/A"}
        />
        <Stat
          label="AI cost / customer"
          value={
            econ.activeCustomerCount > 0
              ? formatCents(econ.totalAiCostCents / econ.activeCustomerCount)
              : "N/A"
          }
        />
        <Stat label="Total AI cost" value={formatCents(econ.totalAiCostCents)} />
        <Stat label="Total data cost" value={formatCents(econ.totalDataCostCents)} />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Pipeline funnel
        </h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {Object.entries(econ.funnelCounts).map(([status, count]) => (
            <div key={status} className="rounded-md border border-black/10 px-3 py-1.5 dark:border-white/10">
              {status}: {count}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Per-customer contribution margin
        </h2>
        {econ.perCustomer.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">No active customers yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/10 dark:text-white/50">
                  <th className="py-2 pr-4">Business</th>
                  <th className="py-2 pr-4">MRR</th>
                  <th className="py-2 pr-4">Fees</th>
                  <th className="py-2 pr-4">AI cost</th>
                  <th className="py-2 pr-4">Data cost</th>
                  <th className="py-2 pr-4">Infra</th>
                  <th className="py-2 pr-4">Support</th>
                  <th className="py-2 pr-4">Margin</th>
                </tr>
              </thead>
              <tbody>
                {econ.perCustomer.map((c) => (
                  <tr key={c.prospectId} className="border-b border-black/5 dark:border-white/5">
                    <td className="py-2 pr-4">{c.businessName}</td>
                    <td className="py-2 pr-4">{formatCents(c.mrrCents)}</td>
                    <td className="py-2 pr-4">{formatCents(c.paymentFeeCents)}</td>
                    <td className="py-2 pr-4">{formatCents(c.aiCostCents)}</td>
                    <td className="py-2 pr-4">{formatCents(c.dataCostCents)}</td>
                    <td className="py-2 pr-4">{formatCents(c.infraShareCents)}</td>
                    <td className="py-2 pr-4">{formatCents(c.supportCostCents)}</td>
                    <td className="py-2 pr-4 font-medium">{formatCents(c.contributionMarginCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
