const MAX_BYTES = 5 * 1024 * 1024;

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const pickBtn = document.getElementById('pickBtn');
const pasteHintBtn = document.getElementById('pasteHintBtn');

const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const linkEl = document.getElementById('link');
const copyBtn = document.getElementById('copyBtn');
const openBtn = document.getElementById('openBtn');

function setStatus(msg){
  statusEl.classList.remove('hidden');
  statusEl.textContent = msg;
}
function showResult(url){
  resultEl.classList.remove('hidden');
  linkEl.textContent = url;
  openBtn.href = url;
}
function b64uFromBytes(bytes){
  let bin = '';
  const chunk = 0x8000;
  for (let i=0;i<bytes.length;i+=chunk){
    bin += String.fromCharCode(...bytes.subarray(i, i+chunk));
  }
  return btoa(bin).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function sha256Hex(bytes){
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function encryptImage(file){
  const plain = new Uint8Array(await file.arrayBuffer());
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const ivBytes = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
  const cipherBuf = await crypto.subtle.encrypt({name:'AES-GCM', iv: ivBytes}, key, plain);
  return { cipherBytes: new Uint8Array(cipherBuf), keyBytes, ivBytes };
}

async function uploadEncrypted({cipherBytes, keyBytes, ivBytes, mime}){
  const keyHash = await sha256Hex(keyBytes);
  const ivB64u = b64uFromBytes(ivBytes);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-key-hash': keyHash,
      'x-iv': ivB64u,
      'x-mime': mime,
    },
    body: cipherBytes
  });

  if(!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error(`上传失败：${res.status} ${t}`.trim());
  }
  return res.json();
}

async function handleFile(file){
  resultEl.classList.add('hidden');
  if(!file) return;

  if(file.size > MAX_BYTES){
    setStatus(`文件过大：${(file.size/1024/1024).toFixed(2)} MB（上限 5MB）`);
    return;
  }
  if(!file.type || !file.type.startsWith('image/')){
    setStatus('请选择图片文件（image/*）。');
    return;
  }

  setStatus('正在加密（浏览器端）...');
  const {cipherBytes, keyBytes, ivBytes} = await encryptImage(file);

  setStatus('正在上传密文...');
  const {id, url} = await uploadEncrypted({
    cipherBytes, keyBytes, ivBytes, mime: file.type
  });

  const keyB64u = b64uFromBytes(keyBytes);
  const fullUrl = `${url}#${keyB64u}`;
  setStatus(`完成：${id}`);
  showResult(fullUrl);
}

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));

pasteHintBtn.addEventListener('click', () => {
  setStatus('请直接在此页面按 Ctrl+V 粘贴图片。');
});

document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items){
    if(item.kind === 'file'){
      const f = item.getAsFile();
      if(f){
        handleFile(f);
        e.preventDefault();
        return;
      }
    }
  }
});

drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0];
  handleFile(f);
});

copyBtn?.addEventListener('click', async () => {
  const url = linkEl.textContent || '';
  await navigator.clipboard.writeText(url);
  setStatus('已复制到剪贴板。');
});
