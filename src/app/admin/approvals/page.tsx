export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ApprovalsPage() {
  const [pendingMessages, pendingReviewReplies, blockedActions] = await Promise.all([
    prisma.message.findMany({
      where: { status: "PENDING_APPROVAL" },
      orderBy: { createdAt: "desc" },
      include: { prospect: { select: { businessName: true } } },
    }),
    prisma.reviewReply.findMany({
      where: { status: "PENDING_CUSTOMER_APPROVAL" },
      orderBy: { createdAt: "desc" },
      include: { prospect: { select: { businessName: true } } },
    }),
    prisma.event.findMany({
      where: { type: "agent_action_blocked_for_brian" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Approval Center</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every action currently waiting on a human decision.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Awaiting your approval ({pendingMessages.length})
        </h2>
        {pendingMessages.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">Nothing pending.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {pendingMessages.map((m) => (
              <Link
                key={m.id}
                href={`/admin/prospects/${m.prospectId}`}
                className="block rounded-md border border-amber-300 bg-amber-50 p-3 text-sm hover:border-amber-400 dark:border-amber-700 dark:bg-amber-950/30"
              >
                <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
                  <span>{m.prospect.businessName}</span>
                  <span>{m.aiGenerated ? "AI-drafted" : "human-composed"}</span>
                </div>
                <p className="mt-1 font-medium">{m.subject}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Awaiting the customer&apos;s approval ({pendingReviewReplies.length})
        </h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Read-only for you — the customer, not Brian, approves these (their own review replies).
        </p>
        {pendingReviewReplies.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">Nothing pending.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {pendingReviewReplies.map((r) => (
              <Link
                key={r.id}
                href={`/admin/prospects/${r.prospectId}`}
                className="block rounded-md border border-black/10 p-3 text-sm dark:border-white/10"
              >
                <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
                  <span>{r.prospect.businessName}</span>
                  <span>review reply</span>
                </div>
                <p className="mt-1">{r.draftReply}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Blocked by the Brian Control Layer ({blockedActions.length})
        </h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Informational only — these agent-proposed actions were consequential enough
          (external communication, financial, contractual, destructive, or account-ownership)
          that they were never executed. There is no one-click override; act on them manually if
          appropriate.
        </p>
        {blockedActions.length === 0 ? (
          <p className="mt-2 text-sm text-black/50 dark:text-white/50">None blocked.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {blockedActions.map((e) => {
              const payload = e.payload as { agentName?: string; summary?: string; consequence?: string; reason?: string } | null;
              return (
                <div key={e.id} className="rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/30">
                  <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
                    <span>{payload?.agentName ?? "unknown agent"} · {payload?.consequence ?? "?"}</span>
                    <span>{e.createdAt.toLocaleString()}</span>
                  </div>
                  <p className="mt-1">{payload?.summary}</p>
                  <p className="mt-1 text-xs text-black/50 dark:text-white/50">{payload?.reason}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
