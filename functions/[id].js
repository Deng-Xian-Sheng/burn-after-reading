function notFoundHtml() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>404</title>
<style>
  html,body{height:100%;margin:0;background:#05070b;color:#e8eaed;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial}
  .wrap{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}
  .big{font-size:110px;line-height:1;font-weight:800;letter-spacing:6px;position:relative}
  .big:before,.big:after{content:attr(data-text);position:absolute;left:0;top:0;opacity:.8}
  .big:before{color:#ff4d6d;transform:translate(2px,0);clip-path:polygon(0 0,100% 0,100% 45%,0 45%);animation:g1 1.2s infinite linear}
  .big:after{color:#4dd2ff;transform:translate(-2px,0);clip-path:polygon(0 55%,100% 55%,100% 100%,0 100%);animation:g2 1s infinite linear}
  @keyframes g1{0%{transform:translate(2px,0)}20%{transform:translate(3px,-1px)}40%{transform:translate(1px,1px)}60%{transform:translate(4px,0)}80%{transform:translate(2px,1px)}100%{transform:translate(2px,0)}}
  @keyframes g2{0%{transform:translate(-2px,0)}25%{transform:translate(-4px,1px)}50%{transform:translate(-1px,-1px)}75%{transform:translate(-3px,0)}100%{transform:translate(-2px,0)}}
  .txt{color:#9aa0a6;font-size:16px;letter-spacing:1px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="big" data-text="404">404</div>
    <div class="txt">有内鬼，中止交易！</div>
  </div>
</body>
</html>`;
  return new Response(html, { status: 404, headers: { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' } });
}

function viewHtml(id) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>burn</title>
<meta name="referrer" content="no-referrer"/>
<style>
  html,body{height:100%}
  body{margin:0;background:#000;overflow:hidden}
</style>
</head>
<body>
<script>
  window.__BURN_ID__ = ${JSON.stringify(id)};
</script>
<script src="/view.js"></script>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' } });
}

export async function onRequest({ request, env, params }) {
  const id = String(params.id || '');
  if (!/^b[0-9a-zA-Z]{1,64}$/.test(id)) return notFoundHtml();

  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT expires_at, consumed_at FROM images WHERE id = ?1`
  ).bind(id).first();

  if (!row) return notFoundHtml();
  if (row.consumed_at !== null) return notFoundHtml();
  if (Number(row.expires_at) <= now) {
    // 过期：清理 D1（R2 由 lifecycle 或后续访问清理）
    await env.DB.prepare(`DELETE FROM images WHERE id = ?1`).bind(id).run();
    return notFoundHtml();
  }

  return viewHtml(id);
}
