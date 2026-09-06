import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;
  const { pathname } = req.nextUrl;

  const isAdminArea = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/login";
  const isPortalArea = pathname.startsWith("/portal") && pathname !== "/portal/login";
  const isPortalLogin = pathname === "/portal/login";

  if (isAdminArea && (!isLoggedIn || role !== "owner")) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAdminLogin && isLoggedIn && role === "owner") {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  if (isPortalArea) {
    const isCustomer = isLoggedIn && role === "customer";
    // Presence check only — the cookie's prospect id is revalidated (WON status, real record)
    // server-side by getPortalViewer() on every render, so a stale/tampered cookie can't grant
    // access on its own. This just lets a deliberately-impersonating admin request through.
    const isImpersonatingAdmin = isLoggedIn && role === "owner" && req.cookies.has("impersonation_prospect_id");

    if (!isCustomer && !isImpersonatingAdmin) {
      return NextResponse.redirect(new URL(isLoggedIn && role === "owner" ? "/admin" : "/portal/login", req.nextUrl));
    }
  }
  if (isPortalLogin && isLoggedIn && role === "customer") {
    return NextResponse.redirect(new URL("/portal", req.nextUrl));
  }
});

export const config = {
  matcher: ["/admin/:path*", "/login", "/portal/:path*"],
};
