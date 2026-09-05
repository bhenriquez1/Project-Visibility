export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function oneDayAgo(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export default async function SystemHealthPage() {
  const dayAgo = oneDayAgo();

  const [dbOk, failedAudits24h, failedAgentRuns24h, completedAgentRuns24h, totalAudits24h] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    prisma.audit.count({ where: { status: "FAILED", requestedAt: { gte: dayAgo } } }),
    prisma.agentRun.count({ where: { status: "FAILED", startedAt: { gte: dayAgo } } }),
    prisma.agentRun.findMany({
      where: { status: "COMPLETE", startedAt: { gte: dayAgo }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
    }),
    prisma.audit.count({ where: { requestedAt: { gte: dayAgo } } }),
  ]);

  const avgAgentLatencyMs =
    completedAgentRuns24h.length > 0
      ? completedAgentRuns24h.reduce((sum, r) => sum + (r.completedAt!.getTime() - r.startedAt.getTime()), 0) /
        completedAgentRuns24h.length
      : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">System Health</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        What&apos;s real is shown; what isn&apos;t built yet is labeled as such, not faked.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Database" value={dbOk ? "connected" : "unreachable"} />
        <Stat label="Failed audits (24h)" value={`${failedAudits24h} / ${totalAudits24h}`} />
        <Stat label="Failed agent runs (24h)" value={String(failedAgentRuns24h)} />
        <Stat
          label="Avg agent run latency (24h)"
          value={avgAgentLatencyMs !== null ? `${(avgAgentLatencyMs / 1000).toFixed(1)}s` : "N/A"}
        />
      </div>

      <section className="mt-8 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Not implemented (shown honestly, not faked)
        </h2>
        <ul className="mt-2 flex flex-col gap-1 text-black/60 dark:text-white/60">
          <li>Job queue depth — there is no background job queue; audits/agent actions run in-process on request.</li>
          <li>Automatic retries — a failed audit or agent action is not retried automatically.</li>
          <li>API rate-limit tracking — provider-reported limits aren&apos;t captured, only success/failure per call (see Data Sources).</li>
        </ul>
      </section>
    </div>
  );
}
