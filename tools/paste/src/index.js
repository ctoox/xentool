/**
 * Paste tool — self-contained module with both an API and a browser UI.
 *
 * Served in-process at /paste/ today; the default export makes the same code
 * a standalone Worker later (paste.xen.autos) without edits.
 *
 * Content negotiation: browsers (Accept: text/html) get pages, everything else
 * gets plain text / JSON. `?raw=1` forces raw output in a browser.
 *
 * Storage record: { v: 1, content, createdAt, burn }. Plain strings written by
 * older versions are still readable.
 */
import { json, text, html, health, fail, notFound, createStore } from "../../../packages/core/index.js";

const MAX_BYTES = 64 * 1024;
const MIN_TTL = 60;
const DEFAULT_TTL = 7 * 24 * 3600;
const MAX_TTL = 30 * 24 * 3600;
const ID_PATTERN = /^[a-z0-9]{6,16}$/;
const NO_STORE = { "Cache-Control": "no-store" };

const TTL_OPTIONS = [
  { label: "1 小时", value: 3600 },
  { label: "1 天", value: 86400 },
  { label: "7 天", value: DEFAULT_TTL },
  { label: "30 天", value: MAX_TTL },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const host = ctx.host ?? url.hostname;
  const basePath = ctx.basePath ?? "";
  const store = createStore(env, "paste");
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-paste");

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return html(renderCreatePage({ basePath, durable: store.backend === "kv" }), 200, {
        "Cache-Control": "public, max-age=60",
      });
    }
    return json({
      tool: "paste",
      storage: store.backend,
      durable: store.backend === "kv",
      limits: { maxBytes: MAX_BYTES, minTtl: MIN_TTL, maxTtl: MAX_TTL, defaultTtl: DEFAULT_TTL },
      usage: {
        create: `POST ${basePath}/api/paste  (plain text or {"content":"...","ttl":604800,"burn":false})`,
        read: `GET ${basePath}/<id>  (?raw=1 for plain text in a browser)`,
      },
    });
  }

  if (path === "/api/paste" && request.method === "POST") {
    return create(request, store, host, basePath);
  }

  const id = path.slice(1);
  if (request.method === "GET" && ID_PATTERN.test(id)) {
    const record = await readRecord(store, id);
    if (!record) {
      return wantsHtml
        ? html(renderMissingPage({ basePath }), 404, NO_STORE)
        : notFound("Paste not found or expired");
    }
    if (wantsHtml && !url.searchParams.has("raw")) {
      return html(renderViewPage({ id, record, basePath }), 200, NO_STORE);
    }
    return text(record.content, 200, NO_STORE);
  }

  return wantsHtml ? html(renderMissingPage({ basePath }), 404, NO_STORE) : notFound();
}

async function create(request, store, host, basePath) {
  const raw = await request.text();
  const size = new TextEncoder().encode(raw).length;
  if (!raw || size > MAX_BYTES) {
    return fail(`content must be 1-${MAX_BYTES} bytes`, size > MAX_BYTES ? 413 : 400);
  }

  let content = raw;
  let ttl = DEFAULT_TTL;
  let burn = false;

  if ((request.headers.get("content-type") || "").includes("application/json")) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return fail("invalid JSON", 400);
    }
    if (typeof payload?.content !== "string" || !payload.content) {
      return fail("content must be a non-empty string", 400);
    }
    content = payload.content;
    if (payload.ttl !== undefined) {
      if (!Number.isInteger(payload.ttl) || payload.ttl < MIN_TTL || payload.ttl > MAX_TTL) {
        return fail(`ttl must be an integer between ${MIN_TTL} and ${MAX_TTL}`, 400);
      }
      ttl = payload.ttl;
    }
    burn = payload.burn === true;
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  await store.put(
    id,
    JSON.stringify({ v: 1, content, createdAt: Date.now(), burn }),
    { expirationTtl: ttl },
  );

  return json(
    {
      id,
      url: `https://${host}${basePath}/${id}`,
      expiresIn: ttl,
      burn,
      storage: store.backend,
    },
    201,
    NO_STORE,
  );
}

async function readRecord(store, id) {
  const raw = await store.get(id);
  if (raw === null || raw === undefined) return null;

  let record = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.content === "string") {
      record = parsed;
    }
  } catch {
    // legacy plain-text record
  }
  if (!record) record = { v: 0, content: raw, createdAt: null, burn: false };

  if (record.burn) await store.delete(id);
  return record;
}

const PAGE_CSS = String.raw`
:root{--bg:#06070a;--ink:#e8eaf0;--dim:#8b90a0;--line:rgba(255,255,255,.09);--cyan:#22d3ee;--violet:#a78bfa}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.4}
.aura .a1{width:440px;height:440px;left:-150px;top:-170px;background:rgba(34,211,238,.30)}
.aura .a2{width:400px;height:400px;right:-130px;top:-90px;background:rgba(167,139,250,.24)}
.top{position:sticky;top:0;z-index:5;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(6,7,10,.6);border-bottom:1px solid var(--line)}
.top-in{max-width:820px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:var(--ink);text-decoration:none}
.logo .badge{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--violet));display:grid;place-items:center;color:#06070a;font:700 12px ui-monospace,monospace}
.back{font-size:13px;color:var(--dim);text-decoration:none}
.back:hover{color:var(--cyan)}
main{position:relative;z-index:1;max-width:820px;margin:0 auto;padding:36px 24px 72px}
h1{margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em}
.lead{margin:8px 0 22px;color:var(--dim);font-size:13.5px}
.editor{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03);overflow:hidden}
textarea{width:100%;min-height:260px;border:0;background:transparent;color:var(--ink);font:13.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:16px;resize:vertical;outline:none}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-top:1px solid var(--line);background:rgba(0,0,0,.18)}
select,.btn{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--ink);padding:8px 13px;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
select:hover,.btn:hover{background:rgba(255,255,255,.1)}
.btn.primary{background:linear-gradient(135deg,rgba(34,211,238,.92),rgba(167,139,250,.92));border-color:transparent;color:#06070a;font-weight:600}
.btn.primary:hover{filter:brightness(1.06)}
.btn:disabled{opacity:.55;cursor:default}
.check{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--dim);cursor:pointer;user-select:none}
.check input{accent-color:#22d3ee}
.spacer{flex:1}
.result{margin-top:18px;padding:16px;border:1px solid rgba(34,211,238,.3);border-radius:12px;background:rgba(34,211,238,.06)}
.result .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cyan);margin-bottom:9px}
.linkrow{display:flex;gap:8px;flex-wrap:wrap}
.linkrow input{flex:1;min-width:200px;border:1px solid var(--line);border-radius:9px;background:rgba(0,0,0,.3);color:var(--ink);padding:9px 12px;font:12.5px ui-monospace,monospace;outline:none}
.error{margin:14px 0 0;color:#f09595;font-size:13px;min-height:20px}
.hint{margin:22px 0 0;color:var(--dim);font-size:12px;font-family:ui-monospace,monospace}
.meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dim);font-size:12.5px;margin:0 0 14px}
.meta code{font-family:ui-monospace,monospace;color:var(--ink);background:rgba(255,255,255,.05);padding:2px 7px;border-radius:6px}
.dot{width:6px;height:6px;border-radius:50%;background:#1d9e75;box-shadow:0 0 8px rgba(29,158,117,.9)}
pre.content{margin:0;padding:18px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.35);font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:64vh;overflow:auto}
.actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.empty{margin:48px 0;text-align:center;color:var(--dim)}
.empty h2{margin:0 0 8px;font-size:18px;color:var(--ink);font-weight:600}
@media (max-width:640px){main{padding:24px 16px 56px}h1{font-size:21px}textarea{min-height:200px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

function shell({ title, body, basePath, script }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>${escapeHtml(title)} · xentool</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span></div>
<div class="top"><div class="top-in">
  <a class="logo" href="/"><span class="badge" aria-hidden="true">X</span>xentool</a>
  <a class="back" href="/">← 返回工具库</a>
</div></div>
<main>${body}</main>
<script>window.__BASE=${JSON.stringify(basePath).replace(/</g, "\\u003c")};</script>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}

function renderCreatePage({ basePath, durable }) {
  const options = TTL_OPTIONS.map(
    (opt) => `<option value="${opt.value}"${opt.value === DEFAULT_TTL ? " selected" : ""}>${opt.label}</option>`,
  ).join("");

  const body = `
<h1>Paste</h1>
<p class="lead">纯文本暂存，链接即分享。内容存放在 Cloudflare KV，到期自动删除。</p>
<div class="editor">
  <textarea id="content" placeholder="粘贴或输入文本…（上限 64 KB）" spellcheck="false"></textarea>
  <div class="bar">
    <select id="ttl" aria-label="过期时间">${options}</select>
    <label class="check"><input type="checkbox" id="burn"> 阅后即焚</label>
    <span class="spacer"></span>
    <button class="btn primary" id="create" type="button">创建链接</button>
  </div>
</div>
<div class="result" id="result" hidden>
  <div class="label">链接已生成</div>
  <div class="linkrow">
    <input id="url" readonly>
    <button class="btn" id="copy" type="button">复制</button>
    <a class="btn" id="open" href="#" target="_blank" rel="noopener">打开</a>
  </div>
</div>
<p class="error" id="error"></p>
<p class="hint">存储 backend：${durable ? "kv（持久）" : "memory（不持久，仅测试）"}</p>`;

  const script = String.raw`
(function(){
  var content = document.getElementById('content');
  var ttl = document.getElementById('ttl');
  var burn = document.getElementById('burn');
  var create = document.getElementById('create');
  var result = document.getElementById('result');
  var urlInput = document.getElementById('url');
  var openLink = document.getElementById('open');
  var copyBtn = document.getElementById('copy');
  var errEl = document.getElementById('error');

  create.addEventListener('click', function(){
    if (!content.value) { errEl.textContent = '内容不能为空'; return; }
    errEl.textContent = '';
    create.disabled = true;
    create.textContent = '创建中…';
    fetch(window.__BASE + '/api/paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.value, ttl: parseInt(ttl.value, 10), burn: burn.checked })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      create.disabled = false;
      create.textContent = '创建链接';
      if (!res.ok) { errEl.textContent = res.data.error || '创建失败'; return; }
      urlInput.value = res.data.url;
      openLink.href = window.__BASE + '/' + res.data.id;
      result.hidden = false;
      urlInput.select();
    }).catch(function(e){
      create.disabled = false;
      create.textContent = '创建链接';
      errEl.textContent = '网络错误：' + e.message;
    });
  });

  copyBtn.addEventListener('click', function(){
    if (!urlInput.value) return;
    navigator.clipboard.writeText(urlInput.value).then(function(){
      copyBtn.textContent = '已复制';
      setTimeout(function(){ copyBtn.textContent = '复制'; }, 1200);
    });
  });
})();
`;

  return shell({ title: "Paste", body, basePath, script });
}

function renderViewPage({ id, record, basePath }) {
  const burnNote = record.burn ? " · 阅后即焚，本次读取后已销毁" : "";
  const body = `
<div class="meta"><span class="dot" aria-hidden="true"></span>Paste <code>${escapeHtml(id)}</code><span>到期自动删除${burnNote}</span></div>
<pre class="content" id="content">${escapeHtml(record.content)}</pre>
<div class="actions">
  <button class="btn primary" id="copy" type="button">复制全文</button>
  <a class="btn" href="${escapeHtml(basePath)}/${escapeHtml(id)}?raw=1">原始文本</a>
  <a class="btn" href="${escapeHtml(basePath)}/">新建</a>
</div>`;

  const script = String.raw`
(function(){
  var btn = document.getElementById('copy');
  var pre = document.getElementById('content');
  btn.addEventListener('click', function(){
    navigator.clipboard.writeText(pre.textContent).then(function(){
      btn.textContent = '已复制';
      setTimeout(function(){ btn.textContent = '复制全文'; }, 1200);
    });
  });
})();
`;

  return shell({ title: `Paste ${id}`, body, basePath, script });
}

function renderMissingPage({ basePath }) {
  const body = `
<div class="empty">
  <h2>内容不存在或已过期</h2>
  <p>链接可能已到期，或已被阅后即焚销毁。</p>
  <p><a class="btn" href="${escapeHtml(basePath)}/">新建一个 Paste</a></p>
</div>`;
  return shell({ title: "Paste", body, basePath, script: "" });
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return handle(request, env, { path: url.pathname, basePath: "", host: url.hostname });
  },
};
