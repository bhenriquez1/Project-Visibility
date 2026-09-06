export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { updateSettings } from "@/lib/actions/settingsActions";
import { AGENT_NAMES, DEFAULT_INTERVAL_MINUTES } from "@/lib/agentOperations";

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "founding_price_cents", label: "Founding price (cents/mo)", hint: "15000 = $150/mo" },
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
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <label htmlFor="autonomy_level" className="text-sm font-medium">Autonomy Level</label>
          <select id="autonomy_level" name="autonomy_level" defaultValue={values.get("autonomy_level") ?? "ASSISTED"} className="mt-2 w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20">
            <option value="MANUAL">Manual</option>
            <option value="ASSISTED">Assisted</option>
            <option value="AUTONOMOUS">Autonomous</option>
          </select>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">Assisted is the launch default: Scout, Audit, and Analytics may run automatically; outbound and consequential actions still require approval.</p>
        </div>
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-medium">Agent schedules and batch limits</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {AGENT_NAMES.map((name) => (
              <div key={name} className="rounded-md border border-black/5 p-3 dark:border-white/5">
                <div className="mb-2 text-xs font-semibold capitalize">{name}</div>
                <label className="block text-xs">Interval (minutes)<input name={`agent_interval_minutes_${name}`} type="number" min="15" defaultValue={values.get(`agent_interval_minutes_${name}`) ?? DEFAULT_INTERVAL_MINUTES[name]} className="mt-1 w-full rounded border px-2 py-1 dark:bg-black/20" /></label>
                <label className="mt-2 block text-xs">Max per run<input name={`agent_batch_limit_${name}`} type="number" min="1" max="100" defaultValue={values.get(`agent_batch_limit_${name}`) ?? (name === "scout" ? "10" : "25")} className="mt-1 w-full rounded border px-2 py-1 dark:bg-black/20" /></label>
              </div>
            ))}
          </div>
        </div>
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
