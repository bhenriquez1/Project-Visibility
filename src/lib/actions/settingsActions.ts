"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SETTINGS_KEYS = [
  "founding_price_cents",
  "places_cost_cents_per_call",
  "serp_cost_cents_per_call",
  "infra_cost_cents_total_per_month",
  "support_cost_cents_per_customer_per_month",
  "manual_ad_outreach_spend_cents",
] as const;

export async function updateSettings(formData: FormData) {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "owner") {
    throw new Error("Not authenticated as the owner.");
  }

  await Promise.all(
    SETTINGS_KEYS.map(async (key) => {
      const raw = formData.get(key);
      if (raw === null) return;
      const value = String(Number(raw) || 0);
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    })
  );

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
}
