export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeRetentionSignals } from "@/lib/retention";
import { getPortalViewer } from "@/lib/impersonation";
import { setMyObjectives } from "@/lib/actions/customerActions";
import { ScoreBadge } from "@/components/ScoreBadge";

const EVENT_LABELS: Record<string, string> = {
  review_reply_posted: "Replied to a review",
  reviews_synced: "Synced reviews from Google",
  customer_login: "Signed in",
  growth_manager_question_asked: "Asked the AI Growth Manager a question",
};

export default async function PortalOverviewPage() {
  const viewer = await getPortalViewer();
  if (!viewer) notFound();
  const { prospectId } = viewer;

  const [prospect, latestAudit, recentEvents, signals] = await Promise.all([
    prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } }),
    prisma.audit.findFirst({
      where: { prospectId, status: { in: ["COMPLETE", "PARTIAL"] } },
      orderBy: { requestedAt: "desc" },
    }),
    prisma.event.findMany({ where: { prospectId }, orderBy: { createdAt: "desc" }, take: 10 }),
    computeRetentionSignals(prospectId),
  ]);

  const recommendedActions: string[] = [];
  if (signals.unansweredReviewCount > 0) {
    recommendedActions.push(
      `You have ${signals.unansweredReviewCount} review${signals.unansweredReviewCount === 1 ? "" : "s"} without a posted reply.`
    );
  }
  if (signals.visibilityTrend === "down") {
    recommendedActions.push("Your visibility score dropped since the last audit — worth a look.");
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push("Nothing urgent right now.");
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Hi, {prospect.businessName}</h1>

      <section className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Your goals
        </h2>
        {prospect.businessObjectives ? (
          <p className="mt-1 text-black/70 dark:text-white/70">{prospect.businessObjectives}</p>
        ) : viewer.isImpersonating ? (
          <p className="mt-1 text-black/50 dark:text-white/50">Not set yet.</p>
        ) : (
          <form
            action={async (formData: FormData) => {
              "use server";
              const value = String(formData.get("businessObjectives") ?? "").trim();
              if (value) await setMyObjectives(value);
            }}
            className="mt-2 flex flex-col gap-2"
          >
            <textarea
              name="businessObjectives"
              placeholder="What are you hoping to get out of this? (e.g. more calls, more foot traffic, better reviews)"
              rows={2}
              className="w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
            />
            <button className="self-start rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
              Save
            </button>
          </form>
        )}
      </section>

      {latestAudit ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
            Visibility score{" "}
            {signals.visibilityTrend && (
              <span className="lowercase text-black/40 dark:text-white/40">
                ({signals.visibilityTrend === "up" ? "trending up" : signals.visibilityTrend === "down" ? "trending down" : "steady"})
              </span>
            )}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <ScoreBadge label="Visibility" score={latestAudit.visibilityScore} />
            <ScoreBadge label="Profile" score={latestAudit.profileScore} />
            <ScoreBadge label="Reputation" score={latestAudit.reputationScore} />
            <ScoreBadge label="Website SEO" score={latestAudit.websiteSeoScore} />
            <ScoreBadge label="Competitor gap" score={latestAudit.competitorGapScore} />
            <ScoreBadge label="Conversion" score={latestAudit.conversionScore} />
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">No audit on file yet.</p>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Recommended actions
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {recommendedActions.map((action, i) => (
            <li key={i} className="rounded-md border border-black/10 px-3 py-2 dark:border-white/10">
              {action}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          Recent changes
        </h2>
        {recentEvents.length === 0 ? (
          <p className="mt-3 text-sm text-black/50 dark:text-white/50">Nothing yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {recentEvents.map((e) => (
              <li key={e.id} className="flex justify-between text-black/70 dark:text-white/70">
                <span>{EVENT_LABELS[e.type] ?? e.type}</span>
                <span className="text-black/40 dark:text-white/40">{e.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
