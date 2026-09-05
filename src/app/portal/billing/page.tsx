export const dynamic = "force-dynamic";

import { openBillingPortalAction } from "@/lib/actions/customerActions";

export default function PortalBillingPage() {
  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold">Billing</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Manage your subscription, payment method, and invoices through Stripe&apos;s secure portal.
      </p>
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
    </div>
  );
}
