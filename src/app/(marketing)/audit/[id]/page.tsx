export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ScoreBadge } from "@/components/ScoreBadge";

export default async function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { prospect: true, competitors: true },
  });

  if (!audit) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">{audit.prospect.businessName}</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">{audit.prospect.city}</p>

      {audit.status === "PENDING" && (
        <p className="mt-8 text-black/70 dark:text-white/70">Your audit is still running — refresh in a moment.</p>
      )}

      {audit.status === "FAILED" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          We couldn&apos;t complete this audit: {audit.error ?? "unknown error"}. Please try again shortly.
        </div>
      )}

      {(audit.status === "COMPLETE" || audit.status === "PARTIAL") && (
        <>
          {audit.narrative && (
            <p className="mt-6 text-black/80 dark:text-white/80">{audit.narrative}</p>
          )}

          <div className="mt-8 flex flex-col gap-3">
            <ScoreBadge label="Google/local visibility" score={audit.visibilityScore} />
            <ScoreBadge label="Profile completeness" score={audit.profileScore} />
            <ScoreBadge label="Reputation & reviews" score={audit.reputationScore} />
            <ScoreBadge label="Website & local SEO" score={audit.websiteSeoScore} />
            <ScoreBadge label="Competitor gap" score={audit.competitorGapScore} />
            <ScoreBadge label="Conversion opportunities" score={audit.conversionScore} />
          </div>

          {audit.unavailableSources.length > 0 && (
            <p className="mt-6 text-xs text-black/50 dark:text-white/50">
              Not connected for this audit: {audit.unavailableSources.join("; ")}.
            </p>
          )}

          {audit.competitors.length > 0 && (
            <div className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
                Who&apos;s showing up nearby
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {audit.competitors.map((c) => (
                  <li key={c.id} className="rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-10 text-xs text-black/40 dark:text-white/40">
            This audit reflects real, currently-available signals only — it is not a ranking guarantee.
          </p>
        </>
      )}
    </div>
  );
}
