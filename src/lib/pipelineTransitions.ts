import type { ProspectStatus } from "@/generated/prisma/client";

/**
 * The pipeline's normal forward path. Any prospect can move to LOST from any non-terminal state
 * (a deal can die at any stage) or advance exactly one step forward. Everything else — a
 * backward move, a skipped step, reviving a LOST prospect — must go through
 * `overrideProspectStatus` with an explicit reason, never the plain status dropdown.
 */
export const NORMAL_TRANSITIONS: Record<ProspectStatus, ProspectStatus[]> = {
  PROSPECT: ["AUDITED", "LOST"],
  AUDITED: ["CONTACTED", "LOST"],
  CONTACTED: ["REPLIED", "LOST"],
  REPLIED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["WON", "LOST"],
  WON: [],
  LOST: [],
};

export function isNormalTransition(from: ProspectStatus, to: ProspectStatus): boolean {
  return NORMAL_TRANSITIONS[from].includes(to);
}
