export const dynamic = "force-dynamic";

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { runPipelineBulkAction } from "@/lib/actions/pipelineActions";

type Stage = "DISCOVERED" | "AUDITED" | "READY_TO_CONTACT" | "CONTACTED" | "REPLIED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";
const STAGES: Stage[] = ["DISCOVERED", "AUDITED", "READY_TO_CONTACT", "CONTACTED", "REPLIED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

function stageFor(p: { status: string; email: string | null; audits: Array<{ status: string }> }): Stage {
  if (p.status === "PROSPECT") return "DISCOVERED";
  if (p.status === "AUDITED") return p.email && p.audits[0]?.status !== "FAILED" ? "READY_TO_CONTACT" : "AUDITED";
  return p.status as Stage;
}

// A prospect past discovery with no confirmed contact — no email at all, or one that was
// manually typed in and never confirmed by crawling the business's own site.
function needsContactReview(p: { status: string; email: string | null; emailVerified: boolean }): boolean {
  if (p.status === "PROSPECT") return false;
  return !p.email || !p.emailVerified;
}

type AuditScores = { visibilityScore: number | null; profileScore: number | null; reputationScore: number | null; websiteSeoScore: number | null; competitorGapScore: number | null; conversionScore: number | null };
function opportunityScore(audit?: AuditScores): number | null {
  if (!audit) return null;
  const scores = [audit.visibilityScore, audit.profileScore, audit.reputationScore, audit.websiteSeoScore, audit.competitorGapScore, audit.conversionScore].filter((v): v is number => v !== null);
  return scores.length ? Math.round(100 - scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const search = String(query.search ?? "").trim();
  const stage = String(query.stage ?? "ALL");
  const location = String(query.location ?? "").trim();
  const contact = String(query.contact ?? "all");
  const auditReady = String(query.auditReady ?? "all");
  const sort = String(query.sort ?? "updated_desc");
  // Defaults to real prospects only — QA/internal fixtures never count toward the operational
  // view unless explicitly requested. See ProspectCategory.
  const category = String(query.category ?? "production");
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = 25;

  const prospects = await prisma.prospect.findMany({
    where: {
      ...(category === "production" ? { category: "PRODUCTION" as const } : category === "internal" ? { category: "INTERNAL" as const } : category === "qa_test" ? { category: "QA_TEST" as const } : {}),
      ...(search ? { OR: [{ businessName: { contains: search, mode: "insensitive" as const } }, { city: { contains: search, mode: "insensitive" as const } }] } : {}),
      ...(location ? { city: { contains: location, mode: "insensitive" as const } } : {}),
      ...(contact === "contacted"
        ? { messages: { some: {} } }
        : contact === "not_contacted"
          ? { messages: { none: {} } }
          : contact === "needs_review"
            ? { status: { not: "PROSPECT" as const }, OR: [{ email: null }, { emailVerified: false }] }
            : {}),
      ...(auditReady === "ready" ? { audits: { some: { status: { in: ["COMPLETE" as const, "PARTIAL" as const] } } } } : auditReady === "not_ready" ? { audits: { none: { status: { in: ["COMPLETE" as const, "PARTIAL" as const] } } } } : {}),
    },
    orderBy: sort === "name_asc" ? { businessName: "asc" } : sort === "created_desc" ? { createdAt: "desc" } : { updatedAt: "desc" },
    include: { audits: { orderBy: { requestedAt: "desc" }, take: 1 }, messages: { orderBy: { createdAt: "desc" }, take: 1 }, events: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const staged = prospects.filter((p) => stage === "ALL" || stageFor(p) === stage);
  const visible = staged.slice((page - 1) * pageSize, page * pageSize);
  const pages = Math.max(1, Math.ceil(staged.length / pageSize));

  return <div className="max-w-full">
    <h1 className="text-xl font-semibold">Prospecting Pipeline</h1>
    <p className="mt-1 text-sm text-black/60 dark:text-white/60">A deduplicated operational view. Opportunity is the gap remaining across real audit scores, never a fabricated lead score.</p>
    <div className="mt-5 flex flex-wrap gap-2 text-xs">
      <Link href={`/admin/pipeline?category=${category}`} className={`rounded-full px-3 py-1 ${stage === "ALL" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}>All · {prospects.length}</Link>
      {STAGES.map((item) => <Link key={item} href={`/admin/pipeline?stage=${item}&category=${category}`} className={`rounded-full px-3 py-1 ${stage === item ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/5 dark:bg-white/10"}`}>{item.replaceAll("_", " ")} · {prospects.filter((p) => stageFor(p) === item).length}</Link>)}
    </div>
    <form className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-black/10 p-3 text-sm dark:border-white/10 md:grid-cols-7">
      <input name="search" defaultValue={search} placeholder="Search business or city" className="rounded border px-2 py-1.5 dark:bg-black/20 md:col-span-2" />
      <input name="location" defaultValue={location} placeholder="Location" className="rounded border px-2 py-1.5 dark:bg-black/20" />
      <select name="contact" defaultValue={contact} className="rounded border px-2 py-1.5 dark:bg-black/20"><option value="all">All contact states</option><option value="contacted">Contacted</option><option value="not_contacted">Not contacted</option><option value="needs_review">Needs contact review</option></select>
      <select name="auditReady" defaultValue={auditReady} className="rounded border px-2 py-1.5 dark:bg-black/20"><option value="all">All audit states</option><option value="ready">Audit ready</option><option value="not_ready">Audit not ready</option></select>
      <select name="sort" defaultValue={sort} className="rounded border px-2 py-1.5 dark:bg-black/20"><option value="updated_desc">Recent action</option><option value="created_desc">Newest discovered</option><option value="name_asc">Business name</option></select>
      <select name="category" defaultValue={category} className="rounded border px-2 py-1.5 dark:bg-black/20"><option value="production">Production (real prospects)</option><option value="internal">Internal Avrrio</option><option value="qa_test">QA / Test fixtures</option><option value="all">All categories</option></select>
      <input type="hidden" name="stage" value={stage} /><button className="rounded bg-black px-3 py-1.5 text-white dark:bg-white dark:text-black">Apply filters</button>
    </form>
    <form action={runPipelineBulkAction} className="mt-4">
      <div className="mb-3 flex flex-wrap items-center gap-2"><select name="bulkAction" className="rounded border px-2 py-1.5 text-sm dark:bg-black/20" required><option value="">Bulk action…</option><option value="run_audit">Run audit</option><option value="prepare_outreach">Prepare outreach</option><option value="approve_outreach">Approve outreach batch</option><option value="pause">Pause selected prospects</option><option value="contact" disabled>Contact selected — safety locked</option></select><button className="rounded border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">Apply to selected</button><span className="text-xs text-black/50 dark:text-white/50">Bulk sending stays locked until compliance and domain-health prerequisites are verified.</span></div>
      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-black/[.03] text-xs uppercase tracking-wide text-black/50 dark:bg-white/[.04] dark:text-white/50"><tr><th className="p-3">Select</th><th>Business</th><th>Location</th><th>Industry</th><th>Opportunity</th><th>Audit</th><th>Contact info</th><th>Stage</th><th>Last action</th><th>Next action</th><th>Agent</th><th>Quality</th></tr></thead><tbody>
        {visible.map((p) => { const audit=p.audits[0]; const s=stageFor(p); const opportunity=opportunityScore(audit); const agent=s==="DISCOVERED"?"Audit":s==="AUDITED"?"Contact enrichment":["READY_TO_CONTACT","CONTACTED","REPLIED","QUALIFIED","PROPOSAL"].includes(s)?"Sales":s==="WON"?"Onboarding / Growth":"None"; const contactInfo=p.email?(p.emailVerified?"Email (verified)":"Email (unverified)"):p.phone?"Phone only":"Missing"; return <tr key={p.id} className="border-t border-black/5 dark:border-white/5"><td className="p-3"><input type="checkbox" name="prospectId" value={p.id} aria-label={`Select ${p.businessName}`} /></td><td><Link href={`/admin/prospects/${p.id}`} className="font-medium hover:underline">{p.businessName}</Link>{p.category !== "PRODUCTION" && <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${p.category === "QA_TEST" ? "bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-300" : "bg-blue-200 text-blue-900 dark:bg-blue-900/50 dark:text-blue-300"}`}>{p.category === "QA_TEST" ? "QA-TEST" : "INTERNAL"}</span>}<div className="text-xs text-black/40">{p.website}</div></td><td>{p.city}</td><td className={p.industry ? undefined : "text-black/50 dark:text-white/50"}>{p.industry ?? "Not available"}</td><td>{opportunity ?? "N/A"}</td><td>{audit?.status ?? "Not started"}</td><td className={needsContactReview(p) ? "text-amber-700 dark:text-amber-400" : undefined}>{contactInfo}</td><td>{s.replaceAll("_", " ")}</td><td>{p.events[0]?.type.replaceAll("_", " ") ?? "Discovered"}</td><td>{p.nextActionLabel?`${p.nextActionLabel}${p.nextActionDueAt?` (due ${p.nextActionDueAt.toLocaleDateString()})`:""}`:s==="DISCOVERED"?"Run audit":s==="AUDITED"?"Find verified contact":s==="READY_TO_CONTACT"?"Prepare outreach":"Review activity"}</td><td>{agent}</td><td>{audit?.overallLevel.replaceAll("_", " ") ?? "NOT AVAILABLE"}</td></tr>; })}
      </tbody></table></div>
    </form>
    <div className="mt-4 flex items-center justify-between text-sm"><span>Page {page} of {pages} · {staged.length} prospects</span><div className="flex gap-2">{page>1&&<Link className="rounded border px-3 py-1" href={`/admin/pipeline?stage=${stage}&category=${category}&page=${page-1}`}>Previous</Link>}{page<pages&&<Link className="rounded border px-3 py-1" href={`/admin/pipeline?stage=${stage}&category=${category}&page=${page+1}`}>Next</Link>}</div></div>
  </div>;
}
