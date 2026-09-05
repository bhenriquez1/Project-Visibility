import Link from "next/link";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 dark:border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold">
            Local Visibility AI
          </Link>
          <nav className="text-sm text-black/60 dark:text-white/60">
            <Link href="/#audit-form" className="hover:text-black dark:hover:text-white">
              Get your free audit
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-black/10 px-6 py-6 text-center text-xs text-black/40 dark:border-white/10 dark:text-white/40">
        Local Visibility AI is a product of Avrrio LLC.
      </footer>
    </div>
  );
}
