export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface FeedItem {
  id: string;
  prospectId: string | null;
  businessName: string;
  kind: "message" | "growth_question";
  direction?: string;
  status?: string;
  subject?: string | null;
  body: string;
  createdAt: Date;
}

export default async function SalesInboxPage() {
  const [messages, growthEvents] = await Promise.all([
    prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { prospect: { select: { businessName: true } } },
    }),
    prisma.event.findMany({
      where: { type: "growth_manager_question_asked" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { prospect: { select: { businessName: true } } },
    }),
  ]);

  const feed: FeedItem[] = [
    ...messages.map((m) => ({
      id: m.id,
      prospectId: m.prospectId,
      businessName: m.prospect.businessName,
      kind: "message" as const,
      direction: m.direction,
      status: m.status,
      subject: m.subject,
      body: m.body,
      createdAt: m.createdAt,
    })),
    ...growthEvents.map((e) => {
      const payload = e.payload as { question?: string; answer?: string } | null;
      return {
        id: e.id,
        prospectId: e.prospectId,
        businessName: e.prospect?.businessName ?? "Unknown",
        kind: "growth_question" as const,
        subject: "AI Growth Manager question",
        body: payload?.question
          ? `Q: ${payload.question}\nA: ${payload.answer ?? "(no answer recorded)"}`
          : "(question text not recorded — asked before this was tracked)",
        createdAt: e.createdAt,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Sales Inbox</h1>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Every outbound/inbound message and every AI Growth Manager conversation, across all
        prospects and customers.
      </p>

      {feed.length === 0 ? (
        <p className="mt-6 text-sm text-black/50 dark:text-white/50">Nothing yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {feed.map((item) => (
            <Link
              key={item.id}
              href={item.prospectId ? `/admin/prospects/${item.prospectId}` : "#"}
              className="block rounded-lg border border-black/10 p-3 text-sm hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
            >
              <div className="flex items-center justify-between text-xs text-black/50 dark:text-white/50">
                <span>
                  {item.businessName}
                  {item.kind === "message" ? ` · ${item.direction}` : " · growth manager"}
                  {item.status ? ` · ${item.status}` : ""}
                </span>
                <span>{item.createdAt.toLocaleString()}</span>
              </div>
              {item.subject && <p className="mt-1 font-medium">{item.subject}</p>}
              <p className="mt-1 whitespace-pre-wrap text-black/70 dark:text-white/70">
                {item.body.length > 300 ? `${item.body.slice(0, 300)}…` : item.body}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
