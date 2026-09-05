import { scoreLevelColor, scoreLevelLabel } from "@/lib/scoreLabels";

export function ScoreBadge({ label, score }: { label: string; score: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-3 dark:border-white/10">
      <span className="text-sm font-medium">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${scoreLevelColor(score)}`}>
        {scoreLevelLabel(score)}
        {score !== null ? ` · ${score}/100` : ""}
      </span>
    </div>
  );
}
