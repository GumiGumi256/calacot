import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const scoped = /^\/([^/]+)\/admin(?:\/(.*))?$/.exec(pathname);
  const legacy = pathname === '/admin' || pathname.startsWith('/admin/');
  const session = await auth();
  const headers = new Headers(request.headers);
  // Only this proxy can provide the slug checked by the server layout/services.
  headers.delete('x-calacot-org-slug');

  if (scoped) {
    if (!session.userId) return session.redirectToSignIn({ returnBackUrl: request.url });
    let slug: string;
    try { slug = decodeURIComponent(scoped[1]); } catch { return new NextResponse(null, { status: 404 }); }
    // Failed Clerk activation leaves the old organization active: never render that tenant.
    if (!session.orgId || session.orgSlug !== slug) return new NextResponse(null, { status: 404 });
    headers.set('x-calacot-org-slug', slug);
    const destination = request.nextUrl.clone();
    destination.pathname = scoped[2] ? `/admin/${scoped[2]}` : '/admin/dashboard';
    return NextResponse.rewrite(destination, { request: { headers } });
  }

  if (legacy || (pathname === '/' && session.userId)) {
    if (!session.userId) return session.redirectToSignIn({ returnBackUrl: request.url });
    const destination = request.nextUrl.clone();
    if (session.orgId && session.orgSlug) {
      destination.pathname = `/${encodeURIComponent(session.orgSlug)}${legacy ? pathname : '/admin'}`;
    } else {
      destination.pathname = '/auth/redirect';
      destination.search = '';
      if (legacy) destination.searchParams.set('returnTo', pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(destination);
  }
  return NextResponse.next({ request: { headers } });
}, {
  organizationSyncOptions: {
    organizationPatterns: ['/:slug/admin', '/:slug/admin/(.*)'],
  },
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk-specific frontend API routes
    '/__clerk/(.*)',
  ],
}
