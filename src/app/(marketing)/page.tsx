import { AuditForm } from "@/components/AuditForm";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold sm:text-4xl">
        See how your business actually shows up online
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-black/60 dark:text-white/60">
        Get a free, honest look at your Google visibility, profile completeness, reputation,
        website SEO, and the gap between you and nearby competitors — no card required, no
        ranking guarantees, just real signals.
      </p>
      <div className="mt-10">
        <AuditForm />
      </div>
    </div>
  );
}
