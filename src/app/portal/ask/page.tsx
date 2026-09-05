import { notFound } from "next/navigation";
import { AskGrowthManagerForm } from "@/components/AskGrowthManagerForm";
import { getPortalViewer } from "@/lib/impersonation";

export default async function PortalAskPage() {
  const viewer = await getPortalViewer();
  if (!viewer) notFound();

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Ask your AI Growth Manager</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Answers questions about your own audit and reviews — it can&apos;t take any action on
        your behalf.
      </p>
      <div className="mt-6">
        {viewer.isImpersonating ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            Asking a question is disabled while viewing as a customer (it would use their AI
            budget).
          </p>
        ) : (
          <AskGrowthManagerForm />
        )}
      </div>
    </div>
  );
}
