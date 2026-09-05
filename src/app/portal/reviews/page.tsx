export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  approveAndPostReviewReply,
  generateReviewReplyDraftAction,
  rejectReviewReply,
  syncReviewsAction,
} from "@/lib/actions/customerActions";

export default async function PortalReviewsPage() {
  const session = await auth();
  const prospectId = session!.user.prospectId!;

  const [connection, reviews] = await Promise.all([
    prisma.googleBusinessConnection.findUnique({ where: { prospectId } }),
    prisma.reviewReply.findMany({ where: { prospectId }, orderBy: { reviewCreatedAt: "desc" } }),
  ]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reviews</h1>
        {connection ? (
          <form
            action={async () => {
              "use server";
              await syncReviewsAction();
            }}
          >
            <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
              Sync from Google
            </button>
          </form>
        ) : null}
      </div>

      {!connection && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          Your Google Business Profile isn&apos;t connected. Sign out and back in, and grant access
          when prompted, to sync reviews here.
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {reviews.length === 0 && connection && (
          <p className="text-sm text-black/50 dark:text-white/50">
            No reviews synced yet — click &quot;Sync from Google&quot; above.
          </p>
        )}

        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
            <div className="flex justify-between text-xs text-black/50 dark:text-white/50">
              <span>
                {review.reviewerName ?? "Anonymous"} · {review.reviewRating ?? "?"}/5
              </span>
              <span>{review.status}</span>
            </div>
            <p className="mt-2 italic">{review.reviewComment}</p>

            {review.status === "DRAFT" && (
              <form
                action={async () => {
                  "use server";
                  await generateReviewReplyDraftAction(review.id);
                }}
                className="mt-3"
              >
                <button className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20">
                  Generate reply draft
                </button>
              </form>
            )}

            {review.status === "PENDING_CUSTOMER_APPROVAL" && (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                <form
                  action={async (formData: FormData) => {
                    "use server";
                    await approveAndPostReviewReply(review.id, String(formData.get("reply")));
                  }}
                >
                  <textarea
                    name="reply"
                    defaultValue={review.draftReply}
                    rows={3}
                    className="w-full rounded-md border border-black/15 p-2 text-sm dark:border-white/20 dark:bg-black/20"
                  />
                  <button className="mt-2 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-black">
                    Approve & post
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await rejectReviewReply(review.id);
                  }}
                >
                  <button className="mt-2 text-xs text-red-700 underline dark:text-red-400">Reject</button>
                </form>
              </div>
            )}

            {review.status === "POSTED" && (
              <p className="mt-3 rounded-md bg-black/5 p-3 text-black/70 dark:bg-white/10 dark:text-white/70">
                {review.draftReply}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
