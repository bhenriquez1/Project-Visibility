export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { confirmUnsubscribe } from "@/lib/actions/prospectActions";

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ prospectId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { prospectId } = await params;
  const { done } = await searchParams;

  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { businessName: true, unsubscribedAt: true },
  });
  if (!prospect) notFound();

  const alreadyUnsubscribed = Boolean(prospect.unsubscribedAt) || done === "1";

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">{prospect.businessName}</h1>
      {alreadyUnsubscribed ? (
        <p className="mt-4 text-sm text-black/70 dark:text-white/70">
          You&apos;re unsubscribed — we won&apos;t send any more outreach to this address.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-black/70 dark:text-white/70">
            Stop receiving outreach emails from Local Visibility AI at this address?
          </p>
          <form
            action={async () => {
              "use server";
              await confirmUnsubscribe(prospectId);
            }}
            className="mt-6"
          >
            <button className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
              Unsubscribe
            </button>
          </form>
        </>
      )}
    </div>
  );
}
