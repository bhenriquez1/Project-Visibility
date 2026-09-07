"use client";
import { useState } from "react";
import type { PricingCatalog } from "@/lib/pricingCatalog";
import { savePricingCatalog } from "@/lib/actions/pricingActions";

export function PricingEditor({ initial }: { initial: PricingCatalog }) {
  const [catalog, setCatalog] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage("");
    try { const result = await savePricingCatalog(JSON.stringify(catalog)); setCatalog({ ...catalog, revision: catalog.revision + 1 }); setMessage(result.message); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save pricing."); }
    finally { setBusy(false); }
  }} className="space-y-6">
    {(["plans", "addons"] as const).map(kind => <section key={kind} className="space-y-4">
      <h2 className="text-xl font-semibold">{kind === "plans" ? "Plans" : "Optional add-ons"}</h2>
      {catalog[kind].map((item, index) => {
        const update = (patch: Partial<typeof item>) => setCatalog({ ...catalog, [kind]: catalog[kind].map((old, i) => i === index ? { ...old, ...patch } : old) });
        return <fieldset key={item.id} disabled={busy} className="rounded border p-4 space-y-3">
          <legend className="font-semibold">{item.name}</legend>
          <div className="flex flex-wrap gap-4">
            <label>Name <input className="border rounded p-2" value={item.name} onChange={e => update({ name: e.target.value })} /></label>
            <label>Monthly USD <input type="number" min="0" step="0.01" className="border rounded p-2 w-32" value={item.monthlyPriceCents / 100} onChange={e => update({ monthlyPriceCents: Math.round(Number(e.target.value) * 100) })} /></label>
            <label>Annual USD (optional) <input type="number" min="0" step="0.01" className="border rounded p-2 w-32" value={item.annualPriceCents === null ? "" : item.annualPriceCents / 100} onChange={e => update({ annualPriceCents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })} /></label>
          </div>
          <label className="block">Included features (one per line)<textarea className="block border rounded p-2 w-full" rows={4} value={item.features.join("\n")} onChange={e => update({ features: e.target.value.split("\n").filter(Boolean) })} /></label>
          <details><summary>Usage allowances and Stripe test configuration</summary><div className="grid grid-cols-2 gap-3 py-3">
            {Object.entries(item.allowances).map(([key, value]) => <label key={key}>{key.replace(/([A-Z])/g, " $1")}<input className="block border rounded p-2 w-full" type="number" min="0" step="1" value={value} onChange={e => update({ allowances: { ...item.allowances, [key]: Number(e.target.value) } })} /></label>)}
          </div><label className="block">Monthly Stripe test price ID<input className="block border rounded p-2 w-full" value={item.stripeMonthlyPriceId ?? ""} onChange={e => update({ stripeMonthlyPriceId: e.target.value || null })} /></label>
          <label className="block mt-3"><input type="checkbox" checked={item.availableForSale} onChange={e => update({ availableForSale: e.target.checked })} /> Approve this offer for test checkout</label></details>
        </fieldset>;
      })}
    </section>)}
    <fieldset className="border rounded p-4 space-y-3"><legend>Founding 25</legend>
      <label className="block"><input type="checkbox" checked={catalog.foundingOffer.enabled} onChange={e => setCatalog({ ...catalog, foundingOffer: { ...catalog.foundingOffer, enabled: e.target.checked } })} /> Enable owner-approved qualifying customer allocations</label>
      <label className="block">Maximum qualifying customers (up to 25)<input type="number" min="0" max="25" className="border rounded p-2" value={catalog.foundingOffer.qualifyingCustomerLimit} onChange={e => setCatalog({ ...catalog, foundingOffer: { ...catalog.foundingOffer, qualifyingCustomerLimit: Number(e.target.value) } })} /></label>
      <label className="block">Locked monthly USD<input type="number" min="0" step="0.01" className="border rounded p-2" value={catalog.foundingOffer.monthlyPriceCents / 100} onChange={e => setCatalog({ ...catalog, foundingOffer: { ...catalog.foundingOffer, monthlyPriceCents: Math.round(Number(e.target.value) * 100) } })} /></label>
      <p>Eligibility is approved per customer. The price lock ends when the subscription is canceled. Used allocations are not recycled.</p>
    </fieldset>
    <label className="block"><input type="checkbox" checked={catalog.promotionsEnabled} onChange={e => setCatalog({ ...catalog, promotionsEnabled: e.target.checked })} /> Allow Stripe promotion codes in test checkout</label>
    <button disabled={busy} className="rounded bg-black text-white px-5 py-3">{busy ? "Saving…" : "Approve and save pricing"}</button>
    <p role="status">{message}</p>
  </form>;
}
