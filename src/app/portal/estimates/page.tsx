export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/impersonation";
import {
  approveAndSendEstimateFollowUp,
  dismissEstimateFollowUp,
  logEstimateAction,
  markEstimateAcceptedAction,
  markEstimateDeclinedAction,
} from "@/lib/actions/customerActions";

export default async function PortalEstimatesPage() {
  const viewer = await getPortalViewer();
  if (!viewer) notFound();
  const { prospectId, isImpersonating } = viewer;

  const estimates = await prisma.estimate.findMany({
    where: { prospectId },
    orderBy: { sentAt: "desc" },
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Estimates</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Log estimates you send your own customers. If one goes unanswered for a few days, we&apos;ll
        draft a friendly follow-up for your approval — nothing sends without you.
      </p>

      {!isImpersonating && (
        <form
          action={async (formData: FormData) => {
            "use server";
            await logEstimateAction({
              customerName: String(formData.get("customerName")),
              customerEmail: String(formData.get("customerEmail") || ""),
              serviceDescription: String(formData.get("serviceDescription")),
              amountCents: Math.round(Number(formData.get("amount")) * 100),
            });
          }}
          className="mt-6 flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10"
        >
          <h2 className="text-sm font-medium">Log a new estimate</h2>
          <input
            name="customerName"
            placeholder="Customer name"
            required
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
          />
          <input
            name="customerEmail"
            type="email"
            placeholder="Customer email (needed to follow up)"
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
          />
          <input
            name="serviceDescription"
            placeholder="What the estimate is for"
            required
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
          />
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount ($)"
            required
            className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
          />
          <button className="mt-1 self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Log estimate
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {estimates.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">No estimates logged yet.</p>
        )}

        {estimates.map((estimate) => (
          <div key={estimate.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
            <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
              <span>
                {estimate.customerName} · ${(estimate.amountCents / 100).toFixed(2)}
              </span>
              <span>{estimate.status.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-2">{estimate.serviceDescription}</p>

            {(estimate.status === "SENT") && !isImpersonating && (
              <div className="mt-3 flex gap-2">
                <form
                  action={async () => {
                    "use server";
                    await markEstimateAcceptedAction(estimate.id);
                  }}
                >
                  <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                    Mark accepted
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await markEstimateDeclinedAction(estimate.id);
                  }}
                >
                  <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                    Mark declined
                  </button>
                </form>
              </div>
            )}

            {estimate.status === "FOLLOW_UP_DRAFTED" && !isImpersonating && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                <p className="text-xs font-medium">Suggested follow-up:</p>
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await approveAndSendEstimateFollowUp(estimate.id, String(formData.get("body")));
                  }}
                >
                  <textarea
                    name="body"
                    defaultValue={estimate.followUpBody ?? ""}
                    rows={4}
                    className="mt-2 w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
                  />
                  <button className="mt-2 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                    Approve & send
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await dismissEstimateFollowUp(estimate.id);
                  }}
                >
                  <button className="mt-2 text-xs text-red-700 underline dark:text-red-400">Dismiss</button>
                </form>
              </div>
            )}
            {estimate.status === "FOLLOW_UP_DRAFTED" && isImpersonating && (
              <p className="mt-3 rounded-md bg-black/5 p-3 text-black/70 dark:bg-white/10 dark:text-white/70">
                Follow-up awaiting the customer&apos;s approval: {estimate.followUpBody}
              </p>
            )}

            {estimate.status === "FOLLOW_UP_SENT" && (
              <p className="mt-3 rounded-md bg-black/5 p-3 text-black/70 dark:bg-white/10 dark:text-white/70">
                {estimate.followUpBody}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
