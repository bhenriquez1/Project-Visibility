export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusSelect } from "@/components/StatusSelect";
import {
  approveAndSendMessage,
  composeManualMessage,
  createCheckoutLinkAction,
  generateOutreachDraftAction,
  generateReplyDraftAction,
  logInboundReply,
  rejectMessage,
  setProspectEmail,
  updateProspectStatus,
} from "@/lib/actions/prospectActions";

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: {
      audits: { orderBy: { requestedAt: "desc" }, take: 1, include: { competitors: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!prospect) notFound();

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
        <StatusSelect prospectId={prospect.id} status={prospect.status} onChange={updateProspectStatus} />
      </div>

      {audit ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
            Latest audit ({audit.status})
          </h2>
          {audit.narrative && <p className="mt-2 text-sm">{audit.narrative}</p>}
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
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {pendingMessages.map((message) => (
            <div key={message.id} className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                Pending your approval
              </div>
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
