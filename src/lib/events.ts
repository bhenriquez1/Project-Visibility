import { prisma } from "@/lib/prisma";
import { toJson } from "@/lib/json";

export async function logEvent(
  type: string,
  options: { prospectId?: string; payload?: Record<string, unknown> } = {}
) {
  await prisma.event.create({
    data: {
      type,
      prospectId: options.prospectId,
      payload: options.payload ? toJson(options.payload) : undefined,
    },
  });
}
