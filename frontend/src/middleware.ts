import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define public routes that unauthenticated users can access
  const publicPrefixes = [
    '/login',
    '/verify-email',
    '/reset-password',
    '/setup-employee',
    '/api/proxy',
    '/api/auth',
    '/_next',
    '/static',
    '/favicon.ico',
  ];

  const isPublic = publicPrefixes.some((prefix) => pathname.startsWith(prefix)) || pathname.includes('.');

  if (isPublic) {
    return NextResponse.next();
  }

  // Check for the secure access_token HttpOnly cookie
  const token = request.cookies.get('access_token')?.value;

  if (!token && pathname === '/') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
