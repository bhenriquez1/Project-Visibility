import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireActivePlan } from "@/lib/entitlements";

/** Reserve before work. Retries use the same operation ID; failed work still consumes its
 * reservation until an owner reconciles it, so retries cannot silently exceed a budget. */
export async function reserveUsage(prospectId: string, meter: string, units: number, operationId: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(meter) || !Number.isSafeInteger(units) || units <= 0 || !operationId || operationId.length > 200) throw new Error("Invalid usage reservation.");
  const plan = await requireActivePlan(prospectId);
  const limit = (plan.entitlements as unknown as Record<string, unknown>)[meter];
  if (typeof limit !== "number" || !Number.isFinite(limit)) throw new Error("No allowance is configured for this service.");
  const period = new Date().toISOString().slice(0, 7);
  const key = `usage_${createHash("sha256").update(`${prospectId}:${period}:${meter}`).digest("hex")}`;
  const operationKey = `usage_operation_${createHash("sha256").update(`${prospectId}:${meter}:${operationId}`).digest("hex")}`;
  await prisma.setting.upsert({ where: { key }, create: { key, value: "0" }, update: {} });
  return prisma.$transaction(async tx => {
    if (await tx.setting.findUnique({ where: { key: operationKey } })) return;
    const row = await tx.setting.findUniqueOrThrow({ where: { key } });
    const used = Number(row.value);
    if (!Number.isFinite(used) || used + units > limit) throw new Error("Usage allowance exhausted. Additional usage requires an owner-approved offer.");
    const changed = await tx.setting.updateMany({ where: { key, value: row.value }, data: { value: String(used + units) } });
    if (changed.count !== 1) throw new Error("Another usage operation is in progress. Retry with the same operation ID.");
    await tx.setting.create({ data: { key: operationKey, value: JSON.stringify({ prospectId, meter, units, period }) } });
    await tx.event.create({ data: { type: "usage_reserved", prospectId, payload: { meter, units, period, operationId } } });
  });
}
