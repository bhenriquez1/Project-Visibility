"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/events";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || session.user.role !== "admin") {
    throw new Error("Not authenticated as an admin.");
  }
  return session.user.email;
}

export async function startImpersonation(prospectId: string) {
  const adminEmail = await requireAdmin();

  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } });
  if (prospect.status !== "WON") {
    throw new Error("Can only view as a customer, not a prospect who hasn't converted.");
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATION_COOKIE, prospectId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 60, // 30 minutes — deliberately short-lived
    path: "/",
  });

  await logEvent("impersonation_started", { prospectId, payload: { adminEmail } });
  redirect("/portal");
}

export async function stopImpersonation() {
  const adminEmail = await requireAdmin();
  const cookieStore = await cookies();
  const prospectId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  cookieStore.delete(IMPERSONATION_COOKIE);

  if (prospectId) {
    await logEvent("impersonation_ended", { prospectId, payload: { adminEmail } });
  }
  redirect("/admin/customers");
}
