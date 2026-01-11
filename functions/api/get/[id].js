export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

  const id = String(params.id || '');
  if (!/^b[0-9a-zA-Z]{1,64}$/.test(id)) return new Response('Not Found', { status: 404 });

  const keyHash = request.headers.get('x-key-hash') || '';
  if (!/^[0-9a-f]{64}$/.test(keyHash)) return new Response('Bad x-key-hash', { status: 400 });

  const now = Math.floor(Date.now() / 1000);

  // 先校验（不消耗），避免 DoS：只有 key_hash 匹配才会去读 KV
  const meta = await env.DB.prepare(
    `SELECT kv_key, mime, iv_b64u
       FROM images
      WHERE id = ?1
        AND consumed_at IS NULL
        AND expires_at > ?2
        AND key_hash = ?3`
  ).bind(id, now, keyHash).first();

  if (!meta) return new Response('Not Found', { status: 404 });

  // KV is eventually consistent: right after upload, reads might briefly miss.
  const cipher = await env.KV.get(meta.kv_key, { type: 'arrayBuffer' });
  if (!cipher) {
    return new Response('Not ready, retry', {
      status: 503,
      headers: {
        'cache-control': 'no-store',
        'retry-after': '1'
      }
    });
  }

  // 原子消耗：只有第一次能成功把 consumed_at 从 NULL 改为 now
  const r = await env.DB.prepare(
    `UPDATE images
        SET consumed_at = ?1
      WHERE id = ?2
        AND consumed_at IS NULL
        AND expires_at > ?1
        AND key_hash = ?3`
  ).bind(now, id, keyHash).run();

  if ((r?.meta?.changes || 0) !== 1) {
    // 已被别人读走/或过期/或 key 不匹配
    return new Response('Not Found', { status: 404 });
  }

  // 删除密文（阅后即焚）
  await env.KV.delete(meta.kv_key);

  return new Response(cipher, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-mime': meta.mime,
      'x-iv': meta.iv_b64u,
    }
  });
}
