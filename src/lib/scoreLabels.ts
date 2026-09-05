export function scoreLevelLabel(score: number | null): string {
  if (score === null) return "Not available";
  if (score >= 71) return "Strong";
  if (score >= 41) return "Moderate";
  return "Needs attention";
}

export function scoreLevelColor(score: number | null): string {
  if (score === null) return "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50";
  if (score >= 71) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 41) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
}
