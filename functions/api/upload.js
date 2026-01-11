function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control':'no-store', ...(init.headers || {}) },
    ...init
  });
}

function base62Id(len = 11){
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = 'b'; // prefix to avoid collisions with static filenames
  for(let i=0;i<len;i++){
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const keyHash = request.headers.get('x-key-hash') || '';
  const ivB64u = request.headers.get('x-iv') || '';
  const mime = (request.headers.get('x-mime') || '').toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(keyHash)) return new Response('Bad x-key-hash', { status: 400 });
  if (!/^[A-Za-z0-9_-]{16}$/.test(ivB64u)) return new Response('Bad x-iv', { status: 400 }); // 12 bytes -> 16 b64u chars
  if (!mime.startsWith('image/')) return new Response('Bad x-mime', { status: 400 });

  const buf = await request.arrayBuffer();
  const size = buf.byteLength;
  if (size <= 0) return new Response('Empty body', { status: 400 });
  if (size > 5 * 1024 * 1024) return new Response('File too large (max 5MB)', { status: 413 });

  const id = base62Id(11);
  const kvKey = `img:${id}`;
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 24 * 3600;

  // KV: 24h automatic expiration
  await env.KV.put(kvKey, buf, { expirationTtl: 24 * 3600 });

  await env.DB.prepare(
    `INSERT INTO images (id, key_hash, kv_key, mime, iv_b64u, size, created_at, expires_at, consumed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL)`
  ).bind(id, keyHash, kvKey, mime, ivB64u, size, now, expires).run();

  const origin = new URL(request.url).origin;
  const url = `${origin}/${id}`;
  return json({ id, url });
}
