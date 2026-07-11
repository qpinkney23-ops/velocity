import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hasSafeSessionCookieShape, isProtectedNavigationPath, safeNextDestination } from "@/lib/auth/navigation";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!isProtectedNavigationPath(pathname)) return NextResponse.next();
  const cookieName = process.env.NODE_ENV === "production" ? "__Host-velocity_session" : "velocity_session";
  if (!hasSafeSessionCookieShape(req.cookies.get(cookieName)?.value)) {
    const login = req.nextUrl.clone();
    login.pathname = "/auth/login";
    login.search = `?next=${encodeURIComponent(safeNextDestination(`${pathname}${search}`))}`;
    return NextResponse.redirect(login);
  }
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-velocity-pathname", pathname);
  requestHeaders.set("x-velocity-search", search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/applications/:path*", "/borrowers/:path*", "/queue/:path*", "/underwriters/:path*", "/settings/:path*", "/admin/:path*", "/upload/:path*", "/firebase-test/:path*", "/debug/:path*",
  ],
};
