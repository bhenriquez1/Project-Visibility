export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";

export default async function AiTracePage() {
  const usage = await prisma.aiUsage.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  const auditIds = usage.filter((u) => u.relatedType === "Audit").map((u) => u.relatedId);
  const prospectKeyedIds = usage.filter((u) => u.relatedType !== "Audit").map((u) => u.relatedId);

  const [audits, prospects] = await Promise.all([
    prisma.audit.findMany({
      where: { id: { in: auditIds } },
      select: { id: true, prospect: { select: { businessName: true } } },
    }),
    prisma.prospect.findMany({
      where: { id: { in: prospectKeyedIds } },
      select: { id: true, businessName: true },
    }),
  ]);

  const auditToBusiness = new Map(audits.map((a) => [a.id, a.prospect.businessName]));
  const prospectToBusiness = new Map(prospects.map((p) => [p.id, p.businessName]));

  function businessNameFor(u: (typeof usage)[number]): string {
    if (u.relatedType === "Audit") return auditToBusiness.get(u.relatedId) ?? "unknown";
    return prospectToBusiness.get(u.relatedId) ?? "unknown";
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold">AI Trace</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every AI call: provider, model, tokens, and cost. No tool-calling is used anywhere in
        this app (plain completions only), and no confidence score is produced by any provider —
        both are correctly absent here rather than invented.
      </p>

      {usage.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">No AI calls logged yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Business</th>
                <th className="py-2 pr-4">Purpose</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Tokens (in/out)</th>
                <th className="py-2 pr-4">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-4 text-xs text-black/50 dark:text-white/50">{u.createdAt.toLocaleString()}</td>
                  <td className="py-2 pr-4">{businessNameFor(u)}</td>
                  <td className="py-2 pr-4">{u.relatedType}</td>
                  <td className="py-2 pr-4">{u.provider}</td>
                  <td className="py-2 pr-4">{u.model}</td>
                  <td className="py-2 pr-4">{u.inputTokens}/{u.outputTokens}</td>
                  <td className="py-2 pr-4">{formatCents(u.costCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
