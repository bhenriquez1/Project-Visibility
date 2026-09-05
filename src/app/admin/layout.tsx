import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Executive & Financials" },
  { href: "/admin/pipeline", label: "Prospecting" },
  { href: "/admin/inbox", label: "Sales Inbox" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/approvals", label: "Approval Center" },
  { href: "/admin/ai-trace", label: "AI Trace" },
  { href: "/admin/data-sources", label: "Data Sources" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/system", label: "System Health" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-black/10 p-4 dark:border-white/10">
        <div className="mb-6 text-sm font-semibold">Owner Command Center</div>
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
        <div className="mt-auto pt-6 text-xs text-black/50 dark:text-white/50">
          <div className="mb-2 truncate">{session?.user?.email}</div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
