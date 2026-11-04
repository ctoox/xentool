/**
 * Short link tool — self-contained module.
 *
 * Reachable two ways:
 *   /s/<code>          on any host (tool.xen.autos/s/abc123)
 *   /<code>            on the apex (xen.autos/abc123), resolved in src/index.js
 *
 * Storage record: { url, createdAt, hits, expiresAt }. Click counting is
 * best-effort: KV has no atomic increment and is eventually consistent, so
 * concurrent hits can undercount. Writes happen via ctx.waitUntil so the
 * redirect is never blocked.
 */
import { json, html, health, fail, notFound, createStore } from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const CODE_LENGTH = 6;
const MIN_TTL = 60;
const MAX_TTL = 10 * 365 * 24 * 3600;
const MAX_URL = 2048;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

// Paths the apex must keep for the portal itself, so a short code never
// shadows a real route.
const RESERVED = new Set([
  "tools", "paste", "s", "api", "health", "ping", "short", "admin",
  "favicon.svg", "favicon.ico", "robots.txt", "index.html", "www",
]);

const TTL_OPTIONS = [
  { label: "永久", value: 0 },
  { label: "1 天", value: 86400 },
  { label: "30 天", value: 30 * 86400 },
  { label: "1 年", value: 365 * 86400 },
];

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const host = ctx.host ?? url.hostname;
  const basePath = ctx.basePath ?? "";
  const store = createStore(env, "short");
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-short");

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return html(renderCreatePage({ basePath, durable: store.backend === "kv", host }), 200, {
        "Cache-Control": "public, max-age=60",
      });
    }
    return json({
      tool: "short",
      storage: store.backend,
      durable: store.backend === "kv",
      usage: {
        create: `POST ${basePath}/api  ({"url":"https://example.com","ttl":0})`,
        visit: `GET ${basePath}/<code>`,
        stats: `GET ${basePath}/<code>+`,
      },
    });
  }

  if (path === "/api" && request.method === "POST") {
    return create(request, store, host, basePath);
  }

  const raw = path.slice(1);
  const isStats = raw.endsWith("+");
  const code = isStats ? raw.slice(0, -1) : raw;

  if (request.method === "GET" && /^[a-z0-9]{4,16}$/.test(code)) {
    const record = await readRecord(store, code);
    if (!record) {
      return wantsHtml ? html(renderMissingPage({ basePath, code }), 404, { "Cache-Control": "no-store" }) : notFound("Short link not found or expired");
    }

    if (isStats) {
      return json({
        code,
        target: record.url,
        hits: record.hits || 0,
        createdAt: record.createdAt || null,
        expiresAt: record.expiresAt || null,
        short: `https://${host}${basePath}/${code}`,
      }, 200, { "Cache-Control": "no-store" });
    }

    const pending = bumpHits(store, code, record, ctx);
    if (typeof ctx.waitUntil !== "function") await pending;
    return new Response(null, {
      status: 302,
      headers: { Location: record.url, "Cache-Control": "no-store" },
    });
  }

  return wantsHtml ? html(renderMissingPage({ basePath, code }), 404, { "Cache-Control": "no-store" }) : notFound();
}

/**
 * Best-effort click counter. Returns the write promise so callers without a
 * waitUntil (tests, non-Worker runtimes) can await it; production passes the
 * promise to waitUntil so the 302 is never delayed.
 */
function bumpHits(store, code, record, ctx) {
  record.hits = (record.hits || 0) + 1;
  const remaining = record.expiresAt
    ? Math.max(MIN_TTL, Math.floor((record.expiresAt - Date.now()) / 1000))
    : undefined;
  const write = store
    .put(code, JSON.stringify(record), remaining ? { expirationTtl: remaining } : {})
    .catch(() => {});

  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(write);
    return Promise.resolve();
  }
  return write;
}

async function readRecord(store, code) {
  const raw = await store.get(code);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.url === "string") return parsed;
  } catch {
    // fall through
  }
  return null;
}

function normalizeUrl(input) {
  let raw = String(input || "").trim();
  if (!raw || raw.length > MAX_URL) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function newCode() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    if (!RESERVED.has(out) && !/^\d+$/.test(out)) return out;
  }
  return crypto.randomUUID().replace(/-/g, "").slice(0, CODE_LENGTH);
}

async function create(request, store, host, basePath) {
  const raw = await request.text();
  if (!raw) return fail("body required", 400);

  let target = raw;
  let ttl = 0;

  if ((request.headers.get("content-type") || "").includes("application/json")) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return fail("invalid JSON", 400);
    }
    target = payload?.url;
    if (payload?.ttl !== undefined) {
      if (!Number.isInteger(payload.ttl) || (payload.ttl !== 0 && (payload.ttl < MIN_TTL || payload.ttl > MAX_TTL))) {
        return fail(`ttl must be 0 or between ${MIN_TTL} and ${MAX_TTL}`, 400);
      }
      ttl = payload.ttl;
    }
  }

  const normalized = normalizeUrl(target);
  if (!normalized) return fail("invalid url", 400);

  const code = newCode();
  const record = {
    url: normalized,
    createdAt: Date.now(),
    hits: 0,
    expiresAt: ttl ? Date.now() + ttl * 1000 : null,
  };
  await store.put(code, JSON.stringify(record), ttl ? { expirationTtl: ttl } : {});

  return json(
    {
      code,
      short: `https://${host}${basePath}/${code}`,
      target: normalized,
      expiresIn: ttl || null,
      storage: store.backend,
    },
    201,
    { "Cache-Control": "no-store" },
  );
}

const SHORT_CSS = String.raw`
.editor input.url{width:100%;border:0;background:transparent;color:var(--ink);padding:20px 16px;font:14.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none}
.editor input.url::placeholder{color:#5b6070}
.result .linkrow input{font-size:14px}
`;

function renderCreatePage({ basePath, durable, host }) {
  const options = TTL_OPTIONS.map(
    (opt) => `<option value="${opt.value}"${opt.value === 0 ? " selected" : ""}>${opt.label}</option>`,
  ).join("");
  const preview = `${host}${basePath}/abc123`;

  const body = `
<h1>短链</h1>
<p class="lead">把长链接变成 <code>${escapeHtml(preview)}</code>，自动统计点击次数。</p>
<div class="editor">
  <input class="url" id="target" placeholder="https://example.com/very/long/path?utm=..." spellcheck="false" autocomplete="off">
  <div class="bar">
    <select id="ttl" aria-label="有效期">${options}</select>
    <span class="spacer"></span>
    <button class="btn primary" id="create" type="button">生成短链</button>
  </div>
</div>
<div class="result" id="result" hidden>
  <div class="label">短链已生成</div>
  <div class="linkrow">
    <input id="short" readonly>
    <button class="btn" id="copy" type="button">复制</button>
    <a class="btn" id="open" href="#" target="_blank" rel="noopener">访问</a>
    <a class="btn" id="stats" href="#" target="_blank" rel="noopener">统计</a>
  </div>
</div>
<p class="error" id="error"></p>
<p class="hint">存储 backend：${durable ? "kv（持久）" : "memory（不持久，仅测试）"}</p>`;

  const script = String.raw`
(function(){
  var target = document.getElementById('target');
  var ttl = document.getElementById('ttl');
  var create = document.getElementById('create');
  var result = document.getElementById('result');
  var shortInput = document.getElementById('short');
  var openLink = document.getElementById('open');
  var statsLink = document.getElementById('stats');
  var copyBtn = document.getElementById('copy');
  var errEl = document.getElementById('error');

  create.addEventListener('click', function(){
    if (!target.value) { errEl.textContent = '请输入链接'; return; }
    errEl.textContent = '';
    create.disabled = true;
    create.textContent = '生成中…';
    fetch(window.__BASE + '/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target.value, ttl: parseInt(ttl.value, 10) })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      create.disabled = false;
      create.textContent = '生成短链';
      if (!res.ok) { errEl.textContent = res.data.error || '生成失败'; return; }
      shortInput.value = res.data.short;
      openLink.href = window.__BASE + '/' + res.data.code;
      statsLink.href = window.__BASE + '/' + res.data.code + '+';
      result.hidden = false;
      shortInput.select();
    }).catch(function(e){
      create.disabled = false;
      create.textContent = '生成短链';
      errEl.textContent = '网络错误：' + e.message;
    });
  });

  copyBtn.addEventListener('click', function(){
    if (!shortInput.value) return;
    navigator.clipboard.writeText(shortInput.value).then(function(){
      copyBtn.textContent = '已复制';
      setTimeout(function(){ copyBtn.textContent = '复制'; }, 1200);
    });
  });
})();
`;

  return shell({ title: "短链", body, basePath, script, style: SHORT_CSS });
}

function renderMissingPage({ basePath, code }) {
  const body = `
<div class="empty">
  <h2>短链不存在或已过期</h2>
  <p><code>${escapeHtml(code || "")}</code> 没有对应的目标地址。</p>
  <p><a class="btn" href="${escapeHtml(basePath)}/">创建一条短链</a></p>
</div>`;
  return shell({ title: "短链", body, basePath, script: "" });
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return handle(request, env, { path: url.pathname, basePath: "", host: url.hostname });
  },
};
