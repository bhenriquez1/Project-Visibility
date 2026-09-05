export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/impersonation";

export default async function PortalCompetitorsPage() {
  const viewer = await getPortalViewer();
  if (!viewer) notFound();
  const { prospectId } = viewer;

  const latestAudit = await prisma.audit.findFirst({
    where: { prospectId, status: { in: ["COMPLETE", "PARTIAL"] } },
    orderBy: { requestedAt: "desc" },
    include: { competitors: true },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Who&apos;s showing up nearby</h1>

      {!latestAudit || latestAudit.competitors.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">
          No competitor data on file yet — this fills in from your next audit.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {latestAudit.competitors.map((c) => (
            <li key={c.id} className="rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
