export function monthlyRecurringCents(items: { price: { unit_amount: number | null; currency: string; recurring: { interval: string; interval_count: number; usage_type?: string } | null }; quantity?: number | null }[]) {
  return Math.round(items.reduce((sum, item) => {
    const r = item.price.recurring;
    if (!r || !["month", "year"].includes(r.interval) || r.interval_count < 1 || item.price.currency !== "usd" || item.price.unit_amount === null || r.usage_type === "metered") throw new Error("Unsupported recurring price: requires fixed USD monthly/annual subscription items.");
    return sum + item.price.unit_amount * (item.quantity ?? 1) / (r.interval_count * (r.interval === "year" ? 12 : 1));
  }, 0));
}
