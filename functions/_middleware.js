export async function onRequest({ request, next }) {
  const res = await next();
  const headers = new Headers(res.headers);

  // Safe headers that normally do NOT conflict with SEO / Google Ads
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

  // Prevent clickjacking (does not block you embedding ad iframes; it blocks others framing your page)
  headers.set('X-Frame-Options', 'DENY');

  // HSTS for this host
  headers.set('Strict-Transport-Security', 'max-age=31536000');

  // IMPORTANT:
  // - Do NOT set global CSP here (can break ads/analytics).
  // - Do NOT set global X-Robots-Tag here (you want / and 404 indexable if desired).

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
