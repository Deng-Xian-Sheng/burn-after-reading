function b64uToBytes(b64u){
  const b64 = b64u.replaceAll('-','+').replaceAll('_','/') + '==='.slice((b64u.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function sha256Hex(bytes){
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function lockDown(){
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('dragstart', e => e.preventDefault());
  document.addEventListener('selectstart', e => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p' || k === 'c')) e.preventDefault();
  }, {capture:true});
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchCipher(id, keyHash){
  const maxTry = 6;
  const delays = [0, 250, 400, 650, 1000, 1500];
  let lastText = '';
  for(let i=0;i<maxTry;i++){
    if (delays[i]) await sleep(delays[i]);
    const res = await fetch(`/api/get/${encodeURIComponent(id)}`, {
      headers: { 'x-key-hash': keyHash }
    });

    if(res.status === 503){
      lastText = await res.text().catch(()=> '');
      continue; // retry
    }
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`读取失败：${res.status} ${t}`.trim());
    }
    const mime = res.headers.get('x-mime') || 'application/octet-stream';
    const ivB64u = res.headers.get('x-iv');
    const cipherBuf = await res.arrayBuffer();
    return { mime, ivB64u, cipherBuf };
  }
  throw new Error(`暂时不可用，请稍后刷新重试。${lastText ? ' ' + lastText : ''}`.trim());
}

async function main(){
  lockDown();

  const keyB64u = (location.hash || '').replace(/^#/, '');
  if(!keyB64u){
    document.body.textContent = '缺少解密密钥（#key）。';
    return;
  }
  const keyBytes = b64uToBytes(keyB64u);
  const keyHash = await sha256Hex(keyBytes);

  const { mime, ivB64u, cipherBuf } = await fetchCipher(window.__BURN_ID__, keyHash);
  const ivBytes = b64uToBytes(ivB64u);

  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'AES-GCM'}, false, ['decrypt']);
  const plainBuf = await crypto.subtle.decrypt({name:'AES-GCM', iv: ivBytes}, key, cipherBuf);

  const blob = new Blob([plainBuf], {type: mime});
  const url = URL.createObjectURL(blob);

  const img = document.createElement('img');
  img.src = url;
  img.alt = 'burn-after-reading';
  img.style.maxWidth = '100vw';
  img.style.maxHeight = '100vh';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'contain';
  img.style.userSelect = 'none';
  img.style.webkitUserDrag = 'none';
  img.style.webkitTouchCallout = 'none';

  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.appendChild(img);
}
main().catch(err => {
  document.body.textContent = '解密失败：' + (err?.message || String(err));
});
