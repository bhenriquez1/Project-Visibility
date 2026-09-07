"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { catalogSchema, CATALOG_KEY } from "@/lib/pricingCatalog";
import { customerOfferSchema } from "@/lib/customerOffers";

export async function savePricingCatalog(raw: string) {
  const session = await auth();
  if (session?.user?.role !== "owner" || !session.user.email) throw new Error("Owner authentication required.");
  const catalog = catalogSchema.parse(JSON.parse(raw));
  await prisma.$transaction(async tx => {
    const current = await tx.setting.findUniqueOrThrow({ where: { key: CATALOG_KEY } });
    const previous = catalogSchema.parse(JSON.parse(current.value));
    if (catalog.revision !== previous.revision) throw new Error("Pricing changed in another window. Reload before saving.");
    const value = JSON.stringify({ ...catalog, revision: catalog.revision + 1 });
    const result = await tx.setting.updateMany({ where: { key: CATALOG_KEY, value: current.value }, data: { value } });
    if (result.count !== 1) throw new Error("Concurrent pricing update. Reload and retry.");
    await tx.event.create({ data: { type: "owner_pricing_updated", payload: { owner: session.user.email!, previous: JSON.parse(current.value), next: JSON.parse(value) } } });
  });
  revalidatePath("/admin/pricing");
  revalidatePath("/portal/billing");
  return { message: "Pricing saved. Existing subscription charges are unchanged. Production billing remains locked." };
}

export async function approveCustomerOffer(raw: string) {
  const session = await auth();
  if (session?.user?.role !== "owner" || !session.user.email) throw new Error("Owner authentication required.");
  const offer = customerOfferSchema.parse({ ...JSON.parse(raw), approvedBy: session.user.email, approvedAt: new Date().toISOString(), revoked: false });
  await prisma.$transaction(async tx => {
    await tx.prospect.findUniqueOrThrow({ where: { id: offer.prospectId } });
    const key = `customer_offer_${offer.prospectId}`;
    const existing = await tx.setting.findUnique({ where: { key } });
    if (existing && customerOfferSchema.parse(JSON.parse(existing.value)).revoked) throw new Error("A canceled founding offer cannot be reinstated. Create a standard customer offer instead.");
    if (offer.founding) {
      const row = await tx.setting.findUniqueOrThrow({ where: { key: CATALOG_KEY } });
      const catalog = catalogSchema.parse(JSON.parse(row.value));
      if (!catalog.foundingOffer.enabled || offer.plan.id !== "visibility" || offer.plan.monthlyPriceCents !== catalog.foundingOffer.monthlyPriceCents) throw new Error("Enable and match the approved Visibility Founding offer first.");
      const allocationKey = "founding_customer_allocations";
      await tx.setting.upsert({ where: { key: allocationKey }, create: { key: allocationKey, value: "[]" }, update: {} });
      const allocation = await tx.setting.findUniqueOrThrow({ where: { key: allocationKey } });
      const ids = JSON.parse(allocation.value) as string[];
      if (!ids.includes(offer.prospectId)) {
        if (ids.length >= catalog.foundingOffer.qualifyingCustomerLimit) throw new Error("The Founding allocation is full.");
        const changed = await tx.setting.updateMany({ where: { key: allocationKey, value: allocation.value }, data: { value: JSON.stringify([...ids, offer.prospectId]) } });
        if (changed.count !== 1) throw new Error("Concurrent Founding allocation. Retry.");
      }
    }
    await tx.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(offer) }, update: { value: JSON.stringify(offer) } });
    await tx.event.create({ data: { type: "customer_offer_approved", prospectId: offer.prospectId, payload: JSON.parse(JSON.stringify(offer)) } });
  });
  revalidatePath("/admin/pricing");
  return "Customer offer saved for the next test checkout. Existing Stripe charges have not changed.";
}
