export const dynamic = "force-dynamic";

import { signIn } from "@/lib/auth";

export default function CustomerLoginPage() {
  const googleConfigured = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Sign in to your dashboard</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Sign in with the Google account that manages your business&apos;s Google Business Profile.
      </p>

      {googleConfigured ? (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/portal" });
          }}
          className="mt-6"
        >
          <button className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            Sign in with Google
          </button>
        </form>
      ) : (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          Google sign-in is not configured yet (GOOGLE_OAUTH_CLIENT_ID / SECRET missing). See
          INFRASTRUCTURE.md for setup.
        </div>
      )}

      <p className="mt-6 text-xs text-black/40 dark:text-white/40">
        Only available once you&apos;re an active Local Visibility AI customer.
      </p>
    </div>
  );
}
