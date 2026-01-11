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
function nextFrame(){ return new Promise(r => requestAnimationFrame(() => r())); }

function getBurnId(){
  const el = document.querySelector('meta[name="burn-id"]');
  return el?.getAttribute('content') || '';
}

/* ---------- lightweight loading UI ---------- */
let loadingEl = null;
function ensureLoading(){
  if (loadingEl) return loadingEl;
  document.body.style.margin = '0';
  document.body.style.height = '100vh';
  document.body.style.background = '#000';
  document.body.style.color = '#e8eaed';
  document.body.style.fontFamily = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial';

  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.inset = '0';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '10px';
  wrap.style.background = '#000';
  wrap.style.zIndex = '9999';

  const spinner = document.createElement('div');
  spinner.style.width = '28px';
  spinner.style.height = '28px';
  spinner.style.border = '3px solid rgba(255,255,255,0.18)';
  spinner.style.borderTopColor = 'rgba(255,255,255,0.8)';
  spinner.style.borderRadius = '999px';
  spinner.style.animation = 'spin 0.9s linear infinite';

  const text = document.createElement('div');
  text.style.color = '#9aa0a6';
  text.style.fontSize = '14px';
  text.textContent = '加载中…';

  const style = document.createElement('style');
  style.textContent = `@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`;

  wrap.appendChild(style);
  wrap.appendChild(spinner);
  wrap.appendChild(text);

  wrap._text = text;
  loadingEl = wrap;
  document.body.appendChild(wrap);
  return wrap;
}
async function setLoading(msg){
  const el = ensureLoading();
  el._text.textContent = msg;
  // give browser a chance to paint the new text
  await nextFrame();
}
function hideLoading(){
  if (loadingEl) loadingEl.remove();
  loadingEl = null;
}

/* ---------- burn view ---------- */
function renderBurned(reason){
  hideLoading();
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.height = '100vh';
  document.body.style.background = '#05070b';
  document.body.style.color = '#e8eaed';
  document.body.style.fontFamily = 'ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial';

  const wrap = document.createElement('div');
  wrap.style.height = '100%';
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'center';
  wrap.style.justifyContent = 'center';
  wrap.style.gap = '10px';
  wrap.style.textAlign = 'center';
  wrap.style.padding = '24px';

  const big = document.createElement('div');
  big.textContent = '已焚毁';
  big.style.fontSize = '64px';
  big.style.fontWeight = '800';
  big.style.letterSpacing = '4px';

  const txt = document.createElement('div');
  txt.textContent = reason ? `（${reason}）刷新/重新打开链接将返回 404` : '刷新/重新打开链接将返回 404';
  txt.style.color = '#9aa0a6';
  txt.style.fontSize = '14px';

  wrap.appendChild(big);
  wrap.appendChild(txt);
  document.body.appendChild(wrap);
}

function setupAutoBurn(id){
  const k = `burn:viewed:${id}`;
  let burned = false;

  const burnNow = (reason) => {
    if (burned) return;
    burned = true;
    try { sessionStorage.setItem(k, '1'); } catch {}
    renderBurned(reason || '');
  };

  // If restored from bfcache or already viewed in this tab, burn immediately
  try {
    if (sessionStorage.getItem(k) === '1') burnNow('本标签页已查看过');
  } catch {}

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) burnNow('页面进入后台');
  });
  window.addEventListener('pagehide', () => burnNow('离开页面'));
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) burnNow('从缓存恢复');
  });

  return { burnNow };
}

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
      continue;
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

  const id = getBurnId();
  if(!id){
    document.body.textContent = '缺少 id。';
    return;
  }

  setupAutoBurn(id);

  await setLoading('正在加载…');

  const keyB64u = (location.hash || '').replace(/^#/, '');
  if(!keyB64u){
    hideLoading();
    document.body.textContent = '缺少解密密钥（#key）。';
    return;
  }

  // Immediately remove #key from address bar
  history.replaceState(null, '', location.pathname + location.search);

  await setLoading('正在获取密文…');

  const keyBytes = b64uToBytes(keyB64u);
  const keyHash = await sha256Hex(keyBytes);

  const { mime, ivB64u, cipherBuf } = await fetchCipher(id, keyHash);

  await setLoading('正在解密…');

  const ivBytes = b64uToBytes(ivB64u);
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'AES-GCM'}, false, ['decrypt']);
  const plainBuf = await crypto.subtle.decrypt({name:'AES-GCM', iv: ivBytes}, key, cipherBuf);

  // best-effort secret wipe
  keyBytes.fill(0);

  await setLoading('正在渲染…');

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

  img.onload = () => hideLoading();

  document.body.style.margin = '0';
  document.body.style.background = '#000';
  document.body.appendChild(img);

  try { sessionStorage.setItem(`burn:viewed:${id}`, '1'); } catch {}
}
main().catch(err => {
  hideLoading();
  document.body.textContent = '解密失败：' + (err?.message || String(err));
});
