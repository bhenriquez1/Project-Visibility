import { prisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";

export async function logEvent(
  type: string,
  options: {
    prospectId?: string;
    payload?: Record<string, unknown>;
    // An owner's email, "agent:<name>", or "system:<source>" — who or what caused this. Most
    // call sites predate this field and omit it; that's fine, it stays null.
    actorEmail?: string;
  } = {}
) {
  await prisma.event.create({
    data: {
      type,
      prospectId: options.prospectId,
      payload: options.payload ? toJson(options.payload) : undefined,
      actorEmail: options.actorEmail,
    },
  });
}
