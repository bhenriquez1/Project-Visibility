export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

export default async function AuditLogPage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    take: 150,
    include: { prospect: { select: { businessName: true } } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every recorded event across the platform, most recent first.
      </p>

      {events.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">No events yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-1 text-sm">
          {events.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-4 border-b border-black/5 py-1.5 dark:border-white/5">
              <div>
                <span className="font-medium">{e.type}</span>
                {e.prospect && (
                  <span className="ml-2 text-black/50 dark:text-white/50">· {e.prospect.businessName}</span>
                )}
                {Boolean(e.payload) && (
                  <div className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                    {JSON.stringify(e.payload)}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-xs text-black/40 dark:text-white/40">
                {e.createdAt.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
