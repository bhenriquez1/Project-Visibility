export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusSelect } from "@/components/StatusSelect";
import {
  approveAndSendMessage,
  composeManualMessage,
  createCheckoutLinkAction,
  extractQualificationSignalsAction,
  generateOutreachDraftAction,
  generateReplyDraftAction,
  logInboundReply,
  overrideProspectStatus,
  rejectMessage,
  setNextAction,
  setProspectEmail,
  setProspectObjectives,
  updateProspectStatus,
} from "@/lib/actions/prospectActions";

const ALL_STATUSES = ["PROSPECT", "AUDITED", "CONTACTED", "REPLIED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
import { setProspectPauseAction } from "@/lib/actions/pipelineActions";
import { isProspectPaused } from "@/lib/agentOperations";

export default async function ProspectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: {
      audits: { orderBy: { requestedAt: "desc" }, take: 1, include: { competitors: true } },
      messages: { orderBy: { createdAt: "asc" } },
      googleBusinessConnection: { select: { revokedAt: true } },
    },
  });

  if (!prospect) notFound();
  const automationPaused = await isProspectPaused(prospect.id);
  const latestQualificationEvent = await prisma.event.findFirst({
    where: { prospectId: prospect.id, type: "qualification_signals_extracted" },
    orderBy: { createdAt: "desc" },
  });
  const qualificationSignals =
    (latestQualificationEvent?.payload as { signals?: { signal: string; evidence: string }[] } | null)?.signals ?? [];

  const audit = prospect.audits[0];
  const pendingMessages = prospect.messages.filter((m) => m.status === "PENDING_APPROVAL");
  const history = prospect.messages.filter((m) => m.status !== "PENDING_APPROVAL");

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{prospect.businessName}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {prospect.city} · {prospect.email ?? "no email on file"} · {prospect.website}
          </p>
          {!prospect.email && (
            <form
              action={async (formData: FormData) => {
                "use server";
                await setProspectEmail(prospect.id, String(formData.get("email")));
              }}
              className="mt-2 flex gap-2"
            >
              <input
                name="email"
                type="email"
                required
                placeholder="contact@business.com"
                className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
              />
              <button className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium dark:border-white/20">
                Save email
              </button>
            </form>
          )}
        </div>
        <div className="flex items-center gap-2">
          <form action={async () => { "use server"; await setProspectPauseAction(prospect.id, !automationPaused); }}>
            <button className={`rounded-md border px-3 py-1.5 text-xs font-medium ${automationPaused ? "border-red-300 bg-red-50 text-red-700" : "border-black/15 dark:border-white/20"}`}>
              {automationPaused ? "Resume prospect automation" : "Pause prospect automation"}
            </button>
          </form>
          <StatusSelect prospectId={prospect.id} status={prospect.status} onChange={updateProspectStatus} />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <details className="mt-3 text-xs text-black/50 dark:text-white/50">
        <summary className="cursor-pointer">Override status (backward/skipped jump, requires a reason)</summary>
        <form
          action={async (formData: FormData) => {
            "use server";
            await overrideProspectStatus(
              prospect.id,
              formData.get("status") as (typeof ALL_STATUSES)[number],
              String(formData.get("reason") ?? "")
            );
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <select name="status" defaultValue={prospect.status} className="rounded-md border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-black/20">
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            name="reason"
            required
            placeholder="Reason for this override"
            className="min-w-[16rem] flex-1 rounded-md border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-black/20"
          />
          <button className="rounded-md border border-black/15 px-3 py-1 font-medium dark:border-white/20">
            Apply override
          </button>
        </form>
      </details>

      <div className="mt-4 rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
        <div className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Next action
        </div>
        {prospect.nextActionLabel || prospect.nextActionDueAt ? (
          <p className="mt-1">
            {prospect.nextActionLabel ?? "(no label set)"}
            {prospect.nextActionDueAt && ` — due ${prospect.nextActionDueAt.toLocaleDateString()}`}
          </p>
        ) : (
          <p className="mt-1 text-black/50 dark:text-white/50">No follow-up set.</p>
        )}
        <form
          action={async (formData: FormData) => {
            "use server";
            await setNextAction(prospect.id, String(formData.get("label") ?? ""), String(formData.get("dueAt") ?? ""));
          }}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <input
            name="label"
            defaultValue={prospect.nextActionLabel ?? ""}
            placeholder="e.g. Follow up on pricing question"
            className="min-w-[14rem] flex-1 rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
          />
          <input
            name="dueAt"
            type="date"
            defaultValue={prospect.nextActionDueAt ? prospect.nextActionDueAt.toISOString().slice(0, 10) : ""}
            className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 dark:bg-black/20"
          />
          <button className="rounded-md border border-black/15 px-3 py-1 text-xs font-medium dark:border-white/20">
            Save
          </button>
        </form>
      </div>

      {prospect.status === "WON" && (
        <section className="mt-6 rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Onboarding
          </h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
              {prospect.googleBusinessConnection && !prospect.googleBusinessConnection.revokedAt
                ? "GBP connected"
                : "GBP not connected"}
            </span>
            <span className="rounded-full bg-black/5 px-2 py-1 dark:bg-white/10">
              {prospect.onboardingCompletedAt
                ? `Onboarding complete (${prospect.onboardingCompletedAt.toLocaleDateString()})`
                : "Onboarding in progress"}
            </span>
          </div>
          {prospect.businessObjectives ? (
            <p className="mt-3 text-black/70 dark:text-white/70">
              <span className="text-xs uppercase tracking-wide text-black/50 dark:text-white/50">Goals: </span>
              {prospect.businessObjectives}
            </p>
          ) : (
            <form
              action={async (formData: FormData) => {
                "use server";
                await setProspectObjectives(prospect.id, String(formData.get("businessObjectives")));
              }}
              className="mt-3 flex flex-col gap-2"
            >
              <textarea
                name="businessObjectives"
                placeholder="What the customer told you their goals are (from a reply, a call, etc.) — never guessed."
                rows={2}
                className="w-full rounded-md border border-black/15 p-2 text-xs dark:border-white/20 dark:bg-black/20"
              />
              <button className="self-start rounded-md border border-black/15 px-2 py-1 text-xs font-medium dark:border-white/20">
                Save goals
              </button>
            </form>
          )}
        </section>
      )}

      {audit ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
            Latest audit ({audit.status})
          </h2>
          {audit.narrative && <p className="mt-2 text-sm">{audit.narrative}</p>}
          {audit.status === "FAILED" && audit.error && (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {audit.error}
            </pre>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ScoreBadge label="Visibility" score={audit.visibilityScore} />
            <ScoreBadge label="Profile" score={audit.profileScore} />
            <ScoreBadge label="Reputation" score={audit.reputationScore} />
            <ScoreBadge label="Website SEO" score={audit.websiteSeoScore} />
            <ScoreBadge label="Competitor gap" score={audit.competitorGapScore} />
            <ScoreBadge label="Conversion" score={audit.conversionScore} />
          </div>
          {audit.unavailableSources.length > 0 && (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">
              Not connected: {audit.unavailableSources.join("; ")}
            </p>
          )}
          {(audit.rawWebsiteSignals || audit.rawPlacesSignals || audit.rawSerpSignals) && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-black/50 dark:text-white/50">Raw evidence</summary>
              <div className="mt-2 flex flex-col gap-2">
                {audit.rawWebsiteSignals && (
                  <div>
                    <div className="font-medium">Website</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-black/10 bg-black/[.02] p-2 dark:border-white/10 dark:bg-white/[.03]">
                      {JSON.stringify(audit.rawWebsiteSignals, null, 2)}
                    </pre>
                  </div>
                )}
                {audit.rawPlacesSignals && (
                  <div>
                    <div className="font-medium">Google Places</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-black/10 bg-black/[.02] p-2 dark:border-white/10 dark:bg-white/[.03]">
                      {JSON.stringify(audit.rawPlacesSignals, null, 2)}
                    </pre>
                  </div>
                )}
                {audit.rawSerpSignals && (
                  <div>
                    <div className="font-medium">Search visibility</div>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-black/10 bg-black/[.02] p-2 dark:border-white/10 dark:bg-white/[.03]">
                      {JSON.stringify(audit.rawSerpSignals, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </section>
      ) : (
        <p className="mt-8 text-sm text-black/50 dark:text-white/50">No audit yet.</p>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
            Outreach
          </h2>
          <div className="flex gap-2">
            <form
              action={async () => {
                "use server";
                await generateOutreachDraftAction(prospect.id);
              }}
            >
              <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                Generate outreach draft
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await generateReplyDraftAction(prospect.id);
              }}
            >
              <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                Generate reply draft
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await createCheckoutLinkAction(prospect.id);
              }}
            >
              <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                Create checkout link
              </button>
            </form>
            <form
              action={async () => {
                "use server";
                await extractQualificationSignalsAction(prospect.id);
              }}
            >
              <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                Extract qualification signals
              </button>
            </form>
          </div>
        </div>

        {qualificationSignals.length > 0 && (
          <div className="mt-4 rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
            <div className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
              Qualification signals (suggestions — nothing here changes the pipeline stage)
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {qualificationSignals.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.signal}</span>
                  <p className="text-xs italic text-black/60 dark:text-white/60">&quot;{s.evidence}&quot;</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {pendingMessages.map((message) => (
            <div key={message.id} className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Pending your approval
              </div>
              {Array.isArray(message.evidenceUsed) && message.evidenceUsed.length > 0 && (
                <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                  Personalization: cites {message.evidenceUsed.length} real findings — {(message.evidenceUsed as string[]).join("; ")}
                </p>
              )}
              <form
                action={async (formData: FormData) => {
                  "use server";
                  await approveAndSendMessage(message.id, String(formData.get("body")));
                }}
              >
                <input type="hidden" name="subject" value={message.subject ?? ""} />
                <p className="mb-2 text-sm font-medium">{message.subject}</p>
                <textarea
                  name="body"
                  defaultValue={message.body}
                  rows={6}
                  className="w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
                />
                <div className="mt-2 flex gap-2">
                  <button className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                    Approve & send
                  </button>
                </div>
              </form>
              <form
                action={async () => {
                  "use server";
                  await rejectMessage(message.id);
                }}
              >
                <button className="mt-2 text-xs text-red-700 underline dark:text-red-400">Reject</button>
              </form>
            </div>
          ))}

          {history.map((message) => (
            <div key={message.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
              <div className="mb-1 flex justify-between text-xs text-black/50 dark:text-white/50">
                <span>{message.direction === "OUTBOUND" ? "Us" : prospect.businessName}</span>
                <span>{message.status}</span>
              </div>
              {message.subject && <p className="font-medium">{message.subject}</p>}
              <p className="whitespace-pre-wrap">{message.body}</p>
            </div>
          ))}
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            const body = String(formData.get("body") ?? "").trim();
            if (body) await logInboundReply(prospect.id, body);
          }}
          className="mt-4 flex flex-col gap-2"
        >
          <textarea
            name="body"
            placeholder="Paste in a reply you received…"
            rows={3}
            className="w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
          />
          <button className="self-start rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
            Log reply
          </button>
        </form>

        <div className="mt-6 border-t border-black/10 pt-4 dark:border-white/10">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Write one yourself (human takeover)
          </h3>
          <form
            action={async (formData: FormData) => {
              "use server";
              const subject = String(formData.get("subject") ?? "").trim();
              const body = String(formData.get("body") ?? "").trim();
              if (subject && body) await composeManualMessage(prospect.id, subject, body);
            }}
            className="mt-2 flex flex-col gap-2"
          >
            <input
              name="subject"
              placeholder="Subject"
              className="rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
            />
            <textarea
              name="body"
              placeholder="Write the message yourself, no AI draft…"
              rows={4}
              className="w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
            />
            <button className="self-start rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
              Add to pending approval
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
