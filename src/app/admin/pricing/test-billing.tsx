"use client";
import { useState } from "react";
import type { PricingCatalog } from "@/lib/pricingCatalog";
import { ownerTestBilling } from "@/lib/actions/billingActions";
export function TestBilling({ catalog, customers }: { catalog: PricingCatalog; customers: { id: string; businessName: string }[] }) {
  const [result, setResult] = useState({ message: "", url: "" });
  const [busy, setBusy] = useState(false);
  return <form className="border rounded p-4 mt-8 space-y-3" onSubmit={async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true);
    try { setResult(await ownerTestBilling(form)); } catch (error) { setResult({ message: error instanceof Error ? error.message : "Billing action failed", url: "" }); } finally { setBusy(false); }
  }}><h2 className="font-semibold text-xl">Stripe test billing</h2>
    <p>Only test subscriptions can be changed here. Plan changes apply at renewal without proration; access updates after the Stripe webhook.</p>
    <select aria-label="Customer" className="border p-2" name="prospectId">{customers.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}</select>
    <select aria-label="Plan" className="border p-2" name="planId">{catalog.plans.map(p => <option key={p.id} value={p.id}>{p.name} · ${p.monthlyPriceCents / 100}/month</option>)}</select>
    <div>{catalog.addons.map(a => <label key={a.id} className="block"><input name="addonId" type="checkbox" value={a.id} /> {a.name} · ${a.monthlyPriceCents / 100}/month</label>)}</div>
    <select aria-label="Billing action" name="action" className="border p-2"><option value="checkout">Create test checkout</option><option value="change">Change test subscription to selected plan and add-ons</option><option value="cancel">Cancel test subscription at period end</option></select>
    <button disabled={busy || !customers.length} className="border rounded px-4 py-2">Approve and execute test billing action</button><p role="status">{result.message}</p>{result.url && <a href={result.url} className="underline">Open Stripe test checkout</a>}
  </form>;
}
