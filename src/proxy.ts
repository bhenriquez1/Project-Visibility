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

  if (isAdminArea && (!isLoggedIn || role !== "admin")) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAdminLogin && isLoggedIn && role === "admin") {
    return NextResponse.redirect(new URL("/admin", req.nextUrl));
  }

  if (isPortalArea && (!isLoggedIn || role !== "customer")) {
    return NextResponse.redirect(new URL("/portal/login", req.nextUrl));
  }
  if (isPortalLogin && isLoggedIn && role === "customer") {
    return NextResponse.redirect(new URL("/portal", req.nextUrl));
  }
});

export const config = {
  matcher: ["/admin/:path*", "/login", "/portal/:path*"],
};
