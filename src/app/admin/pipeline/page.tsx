export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ProspectStatus } from "@/generated/prisma/client";

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

export default async function PipelinePage() {
  const prospects = await prisma.prospect.findMany({
    orderBy: { updatedAt: "desc" },
  });

  const byStatus = new Map<ProspectStatus, typeof prospects>();
  for (const status of COLUMNS) byStatus.set(status, []);
  for (const p of prospects) byStatus.get(p.status)?.push(p);

  return (
    <div>
      <h1 className="text-xl font-semibold">Pipeline</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-4 lg:grid-cols-8">
        {COLUMNS.map((status) => (
          <div key={status} className="min-w-[180px]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              {status} · {byStatus.get(status)?.length ?? 0}
            </div>
            <div className="flex flex-col gap-2">
              {byStatus.get(status)?.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/prospects/${p.id}`}
                  className="rounded-md border border-black/10 p-2 text-sm hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                >
                  <div className="font-medium">{p.businessName}</div>
                  <div className="text-xs text-black/50 dark:text-white/50">{p.city}</div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
