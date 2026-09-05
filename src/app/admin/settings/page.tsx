export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/lib/actions/settingsActions";

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "founding_price_cents", label: "Founding price (cents/mo)", hint: "e.g. 24900 = $249/mo" },
  { key: "places_cost_cents_per_call", label: "Google Places cost per call (cents)", hint: "Check your GCP billing plan" },
  { key: "serp_cost_cents_per_call", label: "SERP API cost per call (cents)", hint: "Check your SerpAPI plan" },
  { key: "infra_cost_cents_total_per_month", label: "Total infra cost (cents/mo)", hint: "Hosting, DB, etc. — split across active customers" },
  { key: "support_cost_cents_per_customer_per_month", label: "Support cost per customer (cents/mo)", hint: "Your time, valued" },
  { key: "manual_ad_outreach_spend_cents", label: "Manual ad/outreach spend (cents, all-time)", hint: "Feeds CAC until ad platforms are integrated" },
];

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany();
  const values = new Map(settings.map((s) => [s.key, s.value]));

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        These feed the economics dashboard directly — unset values are treated as $0, not guessed.
      </p>
      <form action={updateSettings} className="mt-6 flex flex-col gap-4">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1">
            <label htmlFor={field.key} className="text-sm font-medium">
              {field.label}
            </label>
            <input
              id={field.key}
              name={field.key}
              type="number"
              defaultValue={values.get(field.key) ?? "0"}
              className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
            />
            <span className="text-xs text-black/50 dark:text-white/50">{field.hint}</span>
          </div>
        ))}
        <button className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          Save
        </button>
      </form>
    </div>
  );
}
