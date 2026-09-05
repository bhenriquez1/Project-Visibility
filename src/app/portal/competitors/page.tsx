export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PortalCompetitorsPage() {
  const session = await auth();
  const prospectId = session!.user.prospectId!;

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
