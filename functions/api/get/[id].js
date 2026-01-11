export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });

  const id = String(params.id || '');
  if (!/^b[0-9a-zA-Z]{1,64}$/.test(id)) return new Response('Not Found', { status: 404 });

  const keyHash = request.headers.get('x-key-hash') || '';
  if (!/^[0-9a-f]{64}$/.test(keyHash)) return new Response('Bad x-key-hash', { status: 400 });

  const now = Math.floor(Date.now() / 1000);

  // 原子：只有第一次且 key_hash 匹配且未过期 才能把 consumed_at 从 NULL 改为 now，并取到元信息
  const row = await env.DB.prepare(
    `UPDATE images
       SET consumed_at = ?1
     WHERE id = ?2
       AND consumed_at IS NULL
       AND expires_at > ?1
       AND key_hash = ?3
     RETURNING r2_key, mime, iv_b64u`
  ).bind(now, id, keyHash).first();

  if (!row) return new Response('Not Found', { status: 404 });

  const obj = await env.BUCKET.get(row.r2_key);
  if (!obj) {
    // R2 已被 lifecycle 删除或异常丢失：这里直接 404，并清理 D1 记录
    await env.DB.prepare(`DELETE FROM images WHERE id = ?1`).bind(id).run();
    return new Response('Not Found', { status: 404 });
  }

  // 删除密文（阅后即焚）
  await env.BUCKET.delete(row.r2_key);

  return new Response(obj.body, {
    status: 200,
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'x-mime': row.mime,
      'x-iv': row.iv_b64u,
    }
  });
}
