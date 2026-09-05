"use client";

import type { ProspectStatus } from "@/generated/prisma/client";

const STATUSES: ProspectStatus[] = [
  "PROSPECT",
  "AUDITED",
  "CONTACTED",
  "REPLIED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
];

export function StatusSelect({
  prospectId,
  status,
  onChange,
}: {
  prospectId: string;
  status: ProspectStatus;
  onChange: (prospectId: string, status: ProspectStatus) => Promise<void>;
}) {
  return (
    <select
      defaultValue={status}
      onChange={(e) => onChange(prospectId, e.target.value as ProspectStatus)}
      className="rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-black/20"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
