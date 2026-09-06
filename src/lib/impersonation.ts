import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const IMPERSONATION_COOKIE = "impersonation_prospect_id";

export interface PortalViewer {
  prospectId: string;
  isImpersonating: boolean;
  businessName: string;
}

/**
 * Resolves who is "viewing" the customer portal right now — a real customer, or an admin in
 * read-only "View as customer" mode. Never trusts the cookie's prospect id blindly: it's
 * revalidated against a real WON prospect on every call, so a stale/tampered cookie can't grant
 * access to a prospect that no longer qualifies.
 */
export async function getPortalViewer(): Promise<PortalViewer | null> {
  const session = await auth();

  if (session?.user?.role === "customer" && session.user.prospectId) {
    const prospect = await prisma.prospect.findUnique({
      where: { id: session.user.prospectId },
      select: { businessName: true },
    });
    if (!prospect) return null;
    return { prospectId: session.user.prospectId, isImpersonating: false, businessName: prospect.businessName };
  }

  if (session?.user?.role === "owner") {
    const cookieStore = await cookies();
    const prospectId = cookieStore.get(IMPERSONATION_COOKIE)?.value;
    if (!prospectId) return null;

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { status: true, businessName: true },
    });
    if (!prospect || prospect.status !== "WON") return null;

    return { prospectId, isImpersonating: true, businessName: prospect.businessName };
  }

  return null;
}
