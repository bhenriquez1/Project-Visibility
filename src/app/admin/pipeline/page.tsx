export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ProspectStatus, ScoreLevel } from "@/generated/prisma/client";

const COLUMNS: ProspectStatus[] = [
  "PROSPECT",
  "AUDITED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
];

const LEVEL_STYLES: Record<ScoreLevel, string> = {
  NOT_AVAILABLE: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
  NEEDS_ATTENTION: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  MODERATE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  STRONG: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export default async function PipelinePage() {
  const prospects = await prisma.prospect.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      audits: { orderBy: { requestedAt: "desc" }, take: 1, select: { status: true, overallLevel: true } },
      _count: { select: { messages: true } },
    },
  });

  const byStatus = new Map<ProspectStatus, typeof prospects>();
  for (const status of COLUMNS) byStatus.set(status, []);
  for (const p of prospects) byStatus.get(p.status)?.push(p);

  return (
    <div>
      <h1 className="text-xl font-semibold">Prospecting</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every discovered business — opportunity score, source, and contact status.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-4 lg:grid-cols-8">
        {COLUMNS.map((status) => (
          <div key={status} className="min-w-[180px]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              {status} · {byStatus.get(status)?.length ?? 0}
            </div>
            <div className="flex flex-col gap-2">
              {byStatus.get(status)?.map((p) => {
                const audit = p.audits[0];
                return (
                  <Link
                    key={p.id}
                    href={`/admin/prospects/${p.id}`}
                    className="rounded-md border border-black/10 p-2 text-sm hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                  >
                    <div className="font-medium">{p.businessName}</div>
                    <div className="text-xs text-black/50 dark:text-white/50">{p.city}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_STYLES[audit?.overallLevel ?? "NOT_AVAILABLE"]}`}>
                        {audit ? audit.overallLevel.replace("_", " ") : "no audit"}
                      </span>
                      <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-black/50 dark:bg-white/10 dark:text-white/50">
                        {p.source}
                      </span>
                      {p._count.messages > 0 && (
                        <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-black/50 dark:bg-white/10 dark:text-white/50">
                          contacted
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
