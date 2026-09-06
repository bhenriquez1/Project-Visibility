import type { DefaultSession } from "next-auth";

export type UserRole = "owner" | "customer";

declare module "next-auth" {
  interface Session {
    user: {
      role: UserRole;
      prospectId?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    prospectId?: string;
  }
}
