"use client";
import { useState } from "react";
import type { PricingCatalog } from "@/lib/pricingCatalog";
import { approveCustomerOffer } from "@/lib/actions/pricingActions";

export function CustomerOfferEditor({ catalog, customers }: { catalog: PricingCatalog; customers: { id: string; businessName: string }[] }) {
  const [planId, setPlanId] = useState(catalog.plans[0].id);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="border rounded p-4 mt-8 space-y-3" onSubmit={async e => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setBusy(true);
    try {
      const plan = catalog.plans.find(p => p.id === planId)!;
      setMessage(await approveCustomerOffer(JSON.stringify({ prospectId: data.get("customer"), plan: { ...plan, monthlyPriceCents: Math.round(Number(data.get("price")) * 100), stripeMonthlyPriceId: String(data.get("stripePrice")), availableForSale: true }, founding: data.get("founding") === "on", reason: data.get("reason") })));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Offer failed"); }
    finally { setBusy(false); }
  }}><h2 className="text-xl font-semibold">Customer-specific offer</h2>
    <p>Approve a qualifying Founding offer or a grandfathered monthly price for the next test checkout. Reload after saving catalog changes.</p>
    <select aria-label="Customer" name="customer" required className="border rounded p-2">{customers.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}</select>
    <select aria-label="Plan" className="border rounded p-2" value={planId} onChange={e => setPlanId(e.target.value)}>{catalog.plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <label className="block">Monthly USD<input name="price" required type="number" min="0" step="0.01" className="border rounded p-2" /></label>
    <label className="block">Matching Stripe test price ID<input name="stripePrice" required pattern="price_.*" className="border rounded p-2" /></label>
    <label className="block"><input name="founding" type="checkbox" /> I confirm this customer qualifies for Founding 25</label>
    <label className="block">Reason<input name="reason" required minLength={3} maxLength={500} className="border rounded p-2 w-full" /></label>
    <button disabled={busy || !customers.length} className="border rounded px-4 py-2">Approve customer offer</button><p role="status">{message}</p>
  </form>;
}
