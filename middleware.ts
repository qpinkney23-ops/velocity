import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes (no auth needed)
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/api')
  ) {
    return NextResponse.next()
  }

  // TEMP AUTH CHECK (we'll wire Firebase auth next)
  const isLoggedIn = true // placeholder

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/applications/:path*',
    '/borrowers/:path*',
    '/underwriters/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
}
