export async function onRequest({ request, next }) {
  const res = await next();

  const headers = new Headers(res.headers);

  // Security headers
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

  // Reasonable isolation (should be safe for this app)
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // HSTS for this host (does NOT affect sibling subdomains of daylog.top)
  headers.set('Strict-Transport-Security', 'max-age=31536000');

  // CSP: no inline script; allow inline styles for our simple pages
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "connect-src 'self'",
    ].join('; ')
  );

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
