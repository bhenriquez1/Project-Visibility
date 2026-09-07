export const dynamic = "force-dynamic";
import Link from "next/link";
import { getNeedsAttentionItems, type AttentionCategory, type AttentionItem } from "@/lib/needsAttention";

const CATEGORY_LABELS: Record<AttentionCategory, string> = {
  failed_audit: "Failed audits",
  missing_contact: "Missing verified contact",
  delivery_failure: "Message delivery failures",
  unanswered_reply: "Replies awaiting review",
  overdue_follow_up: "Overdue follow-ups",
  payment_failure: "Payment failures",
  provider_problem: "Provider / infrastructure problems",
};

const CATEGORY_ORDER: AttentionCategory[] = [
  "payment_failure",
  "unanswered_reply",
  "overdue_follow_up",
  "missing_contact",
  "delivery_failure",
  "failed_audit",
  "provider_problem",
];

function Row({ item }: { item: AttentionItem }) {
  const content = (
    <>
      <span className="font-medium">{item.businessName ?? "Unknown prospect"}</span>
      <span className="text-black/60 dark:text-white/60"> — {item.detail}</span>
    </>
  );
  return (
    <li className="flex items-center justify-between gap-4 border-t border-black/5 py-2 text-sm first:border-t-0 dark:border-white/5">
      <span>{item.prospectId ? <Link href={`/admin/prospects/${item.prospectId}`} className="hover:underline">{content}</Link> : content}</span>
      <span className="shrink-0 text-xs text-black/40 dark:text-white/40">{item.occurredAt.toLocaleString()}</span>
    </li>
  );
}

export default async function NeedsAttentionPage() {
  const items = await getNeedsAttentionItems();
  const grouped = new Map<AttentionCategory, AttentionItem[]>();
  for (const item of items) grouped.set(item.category, [...(grouped.get(item.category) ?? []), item]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Needs Attention</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Everything across the pipeline currently waiting on Brian — aggregated from real
        pipeline, delivery, and billing state, not a synthetic score.
      </p>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">Nothing needs attention right now.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {CATEGORY_ORDER.map((category) => {
            const categoryItems = grouped.get(category);
            if (!categoryItems || categoryItems.length === 0) return null;
            return (
              <section key={category} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                <h2 className="text-sm font-semibold">
                  {CATEGORY_LABELS[category]} <span className="text-black/40 dark:text-white/40">· {categoryItems.length}</span>
                </h2>
                <ul className="mt-2">
                  {categoryItems.map((item, i) => (
                    <Row key={`${item.prospectId ?? "none"}-${i}`} item={item} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
