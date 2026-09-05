export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { openBillingPortalAction } from "@/lib/actions/customerActions";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/impersonation";
import { resolveStoredPlan } from "@/lib/plans";

export default async function PortalBillingPage() {
  const viewer = await getPortalViewer();
  if (!viewer) notFound();

  const subscription = await prisma.subscription.findFirst({
    where: { prospectId: viewer.prospectId },
    orderBy: { createdAt: "desc" },
  });
  const plan = subscription ? resolveStoredPlan(subscription.plan) : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Billing</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Manage your subscription, payment method, and invoices through Stripe&apos;s secure portal.
      </p>
      {plan && subscription ? (
        <section className="mt-6 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{plan.name} plan</h2>
              <p className="text-sm text-black/60 dark:text-white/60">
                ${(plan.monthlyPriceCents / 100).toFixed(0)}/month · {subscription.status}
              </p>
            </div>
            <span className="rounded-full bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
              Recurring growth platform
            </span>
          </div>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
            Monthly service boundaries
          </h3>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            <li>{plan.entitlements.locations} managed location</li>
            <li>{plan.entitlements.auditsPerMonth} visibility audit</li>
            <li>{plan.entitlements.reviewSyncsPerMonth} review syncs</li>
            <li>{plan.entitlements.reviewDraftsPerMonth} AI review-reply drafts</li>
            <li>{plan.entitlements.growthQuestionsPerMonth} AI Growth Manager questions</li>
            <li>{plan.entitlements.humanSupportMinutesPerMonth} support minutes</li>
          </ul>
          <p className="mt-4 text-xs text-black/50 dark:text-white/50">
            AI prepares work, but external communication, financial, contractual, destructive,
            and account-ownership actions always require explicit human approval.
          </p>
        </section>
      ) : null}
      {viewer.isImpersonating ? (
        <p className="mt-6 text-xs text-black/50 dark:text-white/50">
          Billing portal access is disabled while viewing as a customer.
        </p>
      ) : (
        <form
          action={async () => {
            "use server";
            await openBillingPortalAction();
          }}
          className="mt-6"
        >
          <button className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Open billing portal
          </button>
        </form>
      )}
    </div>
  );
}
