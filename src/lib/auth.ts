import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { encryptSecret } from "@/lib/crypto";
import { logEvent } from "@/lib/events";
import type { UserRole } from "@/types/next-auth";

const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
    // Customer sign-in. Deliberately absent (not just unconfigured) when GOOGLE_OAUTH_CLIENT_ID
    // isn't set, so /portal/login can show an explicit "not configured" state — see
    // src/app/portal/login/page.tsx.
    ...(googleClientId && googleClientSecret
      ? [
          Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            authorization: {
              params: {
                access_type: "offline",
                prompt: "consent",
                scope:
                  "openid email profile https://www.googleapis.com/auth/business.manage",
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;

      const email = user.email;
      if (!email) return false;

      const prospect = await prisma.prospect.findUnique({ where: { email } });
      if (!prospect || prospect.status !== "WON") {
        // Not a paying customer (yet) — no account exists for this email to sign into.
        return false;
      }

      if (account.refresh_token) {
        await prisma.googleBusinessConnection.upsert({
          where: { prospectId: prospect.id },
          update: {
            googleAccountEmail: email,
            encryptedRefreshToken: encryptSecret(account.refresh_token),
            scope: account.scope ?? "",
            revokedAt: null,
          },
          create: {
            prospectId: prospect.id,
            googleAccountEmail: email,
            encryptedRefreshToken: encryptSecret(account.refresh_token),
            scope: account.scope ?? "",
          },
        });
      }

      await prisma.prospect.update({ where: { id: prospect.id }, data: { lastLoginAt: new Date() } });
      await logEvent("customer_login", { prospectId: prospect.id });

      return true;
    },

    async jwt({ token, account, user }) {
      if (account?.provider === "credentials") {
        token.role = "admin";
      } else if (account?.provider === "google" && user?.email) {
        const prospect = await prisma.prospect.findUnique({ where: { email: user.email } });
        if (prospect) {
          token.role = "customer";
          token.prospectId = prospect.id;
        }
      }
      return token;
    },

    async session({ session, token }) {
      // next-auth v5 beta's JWT type doesn't reliably pick up the module augmentation in
      // src/types/next-auth.d.ts for this callback's inferred signature — the runtime value is
      // correct (set in the jwt callback above), just cast past the type-checker here.
      if (token.role) session.user.role = token.role as UserRole;
      if (token.prospectId) session.user.prospectId = token.prospectId as string;
      return session;
    },
  },
});
