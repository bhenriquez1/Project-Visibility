"use client";

import type { ProspectStatus } from "@/generated/prisma/client";
import { NORMAL_TRANSITIONS } from "@/lib/pipelineTransitions";

export function StatusSelect({
  prospectId,
  status,
  onChange,
}: {
  prospectId: string;
  status: ProspectStatus;
  onChange: (prospectId: string, status: ProspectStatus) => Promise<void>;
}) {
  // Only the current status plus its legal next steps — a backward or skipped jump has to go
  // through the audited override form instead, never this dropdown.
  const options: ProspectStatus[] = [status, ...NORMAL_TRANSITIONS[status]];

  return (
    <select
      defaultValue={status}
      onChange={(e) => onChange(prospectId, e.target.value as ProspectStatus)}
      className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-black/20"
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
