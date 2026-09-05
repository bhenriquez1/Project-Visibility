"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuditForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      businessName: String(form.get("businessName") ?? ""),
      website: String(form.get("website") ?? ""),
      city: String(form.get("city") ?? ""),
      email: String(form.get("email") ?? ""),
    };

    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }

      const { auditId } = await res.json();
      router.push(`/audit/${auditId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form id="audit-form" onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="businessName" className="text-sm font-medium">
          Business name
        </label>
        <input
          id="businessName"
          name="businessName"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="website" className="text-sm font-medium">
          Website
        </label>
        <input
          id="website"
          name="website"
          type="url"
          placeholder="https://"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="city" className="text-sm font-medium">
          City
        </label>
        <input
          id="city"
          name="city"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-black/20"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {submitting ? "Running your audit…" : "Get my free visibility audit"}
      </button>
    </form>
  );
}
