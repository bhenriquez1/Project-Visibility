import Link from "next/link";
import { signOut } from "@/lib/auth";
import { getPortalViewer } from "@/lib/impersonation";
import { stopImpersonation } from "@/lib/actions/impersonationActions";

const NAV = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/reviews", label: "Reviews" },
  { href: "/portal/competitors", label: "Competitors" },
  { href: "/portal/ask", label: "Ask your AI Growth Manager" },
  { href: "/portal/billing", label: "Billing" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();

  // /portal/login has no nav chrome — it's the only page reachable without a valid viewer.
  if (!viewer) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {viewer.isImpersonating && (
        <div className="flex items-center justify-between border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200">
          <span>
            Viewing as <strong>{viewer.businessName}</strong> — read-only. No changes you make here
            take effect.
          </span>
          <form
            action={async () => {
              "use server";
              await stopImpersonation();
            }}
          >
            <button type="submit" className="rounded-md border border-amber-400 px-3 py-1 text-xs font-medium">
              Stop viewing as customer
            </button>
          </form>
        </div>
      )}
      <div className="flex flex-1">
        <aside className="flex w-56 flex-col border-r border-black/10 p-4 dark:border-white/10">
          <div className="mb-6 text-sm font-semibold">Local Visibility AI</div>
          <nav className="flex flex-col gap-1 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {!viewer.isImpersonating && (
            <div className="mt-auto pt-6 text-xs text-black/50 dark:text-white/50">
              <div className="mb-2 truncate">{viewer.businessName}</div>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/portal/login" });
                }}
              >
                <button type="submit" className="underline">
                  Sign out
                </button>
              </form>
            </div>
          )}
        </aside>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
