import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types/next-auth";

/**
 * Edge-safe subset of the auth config — no Prisma, no bcryptjs. Middleware runs on the Edge
 * runtime and can only check the session cookie/JWT here; the Credentials/Google providers and
 * the `jwt` callback (which query Prisma) live only in auth.ts, loaded by the Node.js API route.
 *
 * The `session` callback below is duplicated in auth.ts. It has to be — middleware builds its
 * own lightweight `NextAuth(authConfig)` instance (see proxy.ts) that does NOT inherit auth.ts's
 * callbacks, so without this, `req.auth.user.role` is always undefined at the edge and every
 * login bounces back to /login regardless of provider. This callback is pure (just copies
 * fields already baked into the JWT by auth.ts's `jwt` callback), so duplicating it is safe.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (token.role) session.user.role = token.role as UserRole;
      if (token.prospectId) session.user.prospectId = token.prospectId as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
