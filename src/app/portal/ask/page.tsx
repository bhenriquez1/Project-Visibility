import { AskGrowthManagerForm } from "@/components/AskGrowthManagerForm";

export default function PortalAskPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Ask your AI Growth Manager</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Answers questions about your own audit and reviews — it can&apos;t take any action on
        your behalf.
      </p>
      <div className="mt-6">
        <AskGrowthManagerForm />
      </div>
    </div>
  );
}
