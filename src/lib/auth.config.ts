import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe subset of the auth config — no Prisma, no bcryptjs. Middleware runs on the Edge
 * runtime and can only check the session cookie/JWT here; the Credentials provider itself
 * (which needs Node APIs) lives in auth.ts and is only loaded by the Node.js API route.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
} satisfies NextAuthConfig;
