export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

type Status = "connected" | "degraded" | "disconnected";

const STATUS_STYLES: Record<Status, string> = {
  connected: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  degraded: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  disconnected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

interface SourceRow {
  name: string;
  status: Status;
  detail: string;
}

function oneDayAgo(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export default async function DataSourcesPage() {
  const dayAgo = oneDayAgo();

  const [placesCalls, serpCalls, dbOk, gbpConnections] = await Promise.all([
    prisma.apiCallLog.findMany({ where: { provider: "GOOGLE_PLACES", createdAt: { gte: dayAgo } } }),
    prisma.apiCallLog.findMany({ where: { provider: "SERP", createdAt: { gte: dayAgo } } }),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    prisma.googleBusinessConnection.findMany({ select: { revokedAt: true } }),
  ]);

  const aiProvider = (process.env.AI_PROVIDER || "openai").trim().toLowerCase();
  const aiConfigured =
    aiProvider === "anthropic" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.OPENAI_API_KEY);

  function statusFromCalls(configured: boolean, calls: { success: boolean }[]): Status {
    if (!configured) return "disconnected";
    if (calls.length === 0) return "connected";
    const failureRate = calls.filter((c) => !c.success).length / calls.length;
    return failureRate > 0 ? "degraded" : "connected";
  }

  const activeGbpConnections = gbpConnections.filter((c) => !c.revokedAt).length;

  const rows: SourceRow[] = [
    {
      name: `AI provider (${aiProvider})`,
      status: aiConfigured ? "connected" : "disconnected",
      detail: aiConfigured ? "API key set" : "API key not set — audits/drafts will show NOT_CONFIGURED",
    },
    {
      name: "Google Places",
      status: statusFromCalls(Boolean(process.env.GOOGLE_PLACES_API_KEY), placesCalls),
      detail: process.env.GOOGLE_PLACES_API_KEY
        ? `${placesCalls.filter((c) => !c.success).length}/${placesCalls.length} calls failed in the last 24h`
        : "API key not set",
    },
    {
      name: "SERP data (SerpAPI)",
      status: statusFromCalls(Boolean(process.env.SERP_API_KEY), serpCalls),
      detail: process.env.SERP_API_KEY
        ? `${serpCalls.filter((c) => !c.success).length}/${serpCalls.length} calls failed in the last 24h`
        : "API key not set",
    },
    {
      name: "Stripe",
      status: process.env.STRIPE_SECRET_KEY ? "connected" : "disconnected",
      detail: process.env.STRIPE_SECRET_KEY ? "Secret key set" : "Secret key not set",
    },
    {
      name: "Resend (email)",
      status: process.env.RESEND_API_KEY ? "connected" : "disconnected",
      detail: process.env.RESEND_API_KEY ? "API key set" : "API key not set — sends will fail",
    },
    {
      name: "Google Business Profile OAuth",
      status: process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET ? "connected" : "disconnected",
      detail:
        process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET
          ? `App configured · ${activeGbpConnections} customer connection${activeGbpConnections === 1 ? "" : "s"} active`
          : "OAuth client not configured — /portal/login shows not-configured",
    },
    {
      name: "Database (Supabase Postgres)",
      status: dbOk ? "connected" : "disconnected",
      detail: dbOk ? "Query succeeded" : "Query failed — see /api/health for the raw error",
    },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold">Data Sources</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Connection status per integration — never hidden behind a generic &quot;OK.&quot;
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
            <div>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-black/50 dark:text-white/50">{r.detail}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[r.status]}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
