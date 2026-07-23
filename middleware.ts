import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

// Middleware läuft im Edge Runtime — daher die slim Config OHNE Prisma.
const { auth } = NextAuth(authConfig);

// /api/cron ist hier ausgenommen, weil Vercel Cron ohne Session aufruft —
// die Cron-Routen authentifizieren sich selbst über CRON_SECRET (Bearer).
const PUBLIC_PATHS = ["/login", "/api/auth", "/public", "/api/calendar", "/api/cron", "/scan", "/q", "/angebot"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) return NextResponse.next();
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
