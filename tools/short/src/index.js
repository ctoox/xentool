/**
 * Short link tool — self-contained module.
 *
 *   GET  /s/<code>        public, 302 to the target
 *   GET  /s/              admin console (create + list + delete), cookie auth
 *   POST /s/login         password → signed cookie
 *   POST /s/logout        clear the cookie
 *   GET  /s/api           list links            (admin)
 *   POST /s/api           create a link         (admin)
 *   DELETE /s/api/<code>  delete a link         (admin)
 *   GET  /s/<code>+       click stats           (admin)
 *
 * The root path is deliberately NOT a short code: `xen.autos/<code>` would make
 * every future page share a namespace with random 6-char strings. Links live
 * under /s/ instead, so the apex stays free for whatever comes next.
 *
 * Storage record: { url, createdAt, hits, expiresAt }. Click counting is
 * best-effort: KV has no atomic increment and is eventually consistent, so
 * concurrent hits can undercount. The write goes through ctx.waitUntil so the
 * redirect is never delayed.
 */
import {
  json,
  html,
  health,
  fail,
  notFound,
  createStore,
  createAuth,
} from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const CODE_LENGTH = 6;
const MIN_TTL = 60;
const MAX_TTL = 10 * 365 * 24 * 3600;
const MAX_URL = 2048;
const MAX_LIST = 200;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

// Codes that would shadow a real route. Checked before generating a code.
const RESERVED = new Set([
  "api", "login", "logout", "s", "tools", "paste", "short", "admin",
  "health", "ping", "favicon", "robots", "index", "www",
]);

const TTL_OPTIONS = [
  { label: "永久", value: 0 },
  { label: "1 天", value: 86400 },
  { label: "30 天", value: 30 * 86400 },
  { label: "1 年", value: 365 * 86400 },
];

const NO_STORE = { "Cache-Control": "no-store" };

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const host = ctx.host ?? url.hostname;
  const basePath = ctx.basePath ?? "";
  const store = createStore(env, "short");
  const auth = createAuth(request, env, { cookieName: "xt_short" });
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const method = request.method;

  if (method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-short");

  if (path === "/login" && method === "POST") return login(request, auth, basePath);
  if (path === "/logout" && method === "POST") {
    return new Response(null, {
      status: 303,
      headers: { Location: `${basePath}/`, "Set-Cookie": auth.clearedCookie(), ...NO_STORE },
    });
  }

  const authorized = await auth.authorized();

  if (path === "/api") {
    if (!authorized) return unauthorized();
    if (method === "GET") return listLinks(store, host, basePath);
    if (method === "POST") return create(request, store, host, basePath);
    return fail("method not allowed", 405);
  }

  if (path.startsWith("/api/") && method === "DELETE") {
    if (!authorized) return unauthorized();
    const code = path.slice("/api/".length);
    if (!isCode(code)) return fail("invalid code", 400);
    await store.delete(code);
    return json({ deleted: true, code }, 200, NO_STORE);
  }

  if (path === "/" && method === "GET") {
    if (wantsHtml) {
      return html(
        authorized
          ? await renderConsole({ store, host, basePath })
          : renderLogin({ basePath, configured: auth.configured }),
        200,
        NO_STORE,
      );
    }
    return json(
      {
        tool: "short",
        storage: store.backend,
        durable: store.backend === "kv",
        admin: auth.configured ? "required" : "unset",
        usage: {
          visit: `GET ${basePath}/<code>`,
          console: `GET ${basePath}/  (admin)`,
          create: `POST ${basePath}/api  {"url":"https://example.com","ttl":0}  (admin)`,
          list: `GET ${basePath}/api  (admin)`,
          remove: `DELETE ${basePath}/api/<code>  (admin)`,
          stats: `GET ${basePath}/<code>+  (admin)`,
          auth: "Authorization: Bearer <ADMIN>",
        },
      },
      200,
      NO_STORE,
    );
  }

  const raw = path.slice(1);
  const isStats = raw.endsWith("+");
  const code = isStats ? raw.slice(0, -1) : raw;

  if (method === "GET" && isCode(code)) {
    const record = await readRecord(store, code);
    if (!record) {
      return wantsHtml
        ? html(renderMissing({ basePath, code }), 404, NO_STORE)
        : notFound("Short link not found or expired");
    }

    if (isStats) {
      if (!authorized) return unauthorized();
      return json(
        {
          code,
          target: record.url,
          hits: record.hits || 0,
          createdAt: record.createdAt || null,
          expiresAt: record.expiresAt || null,
          short: `https://${host}${basePath}/${code}`,
        },
        200,
        NO_STORE,
      );
    }

    const pending = bumpHits(store, code, record, ctx);
    if (typeof ctx.waitUntil !== "function") await pending;
    return new Response(null, {
      status: 302,
      headers: { Location: record.url, "Cache-Control": "no-store" },
    });
  }

  return wantsHtml ? html(renderMissing({ basePath, code }), 404, NO_STORE) : notFound();
}

const isCode = (value) => /^[a-z0-9]{4,16}$/.test(value);

function unauthorized() {
  return json({ error: "unauthorized", hint: "Authorization: Bearer <ADMIN>" }, 401, NO_STORE);
}

/* ---------------------------------------------------------------- auth flow */

async function readPassword(request) {
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try {
      return (await request.json())?.password ?? null;
    } catch {
      return null;
    }
  }
  const body = await request.text();
  return new URLSearchParams(body).get("password");
}

async function login(request, auth, basePath) {
  const type = request.headers.get("content-type") || "";
  const asJson = type.includes("application/json");
  const password = await readPassword(request);

  if (!auth.configured) {
    return asJson
      ? json({ error: "ADMIN is not configured" }, 503, NO_STORE)
      : new Response(null, {
          status: 303,
          headers: { Location: `${basePath}/?e=unset`, ...NO_STORE },
        });
  }

  if (!auth.checkPassword(password)) {
    return asJson
      ? json({ error: "invalid password" }, 401, NO_STORE)
      : new Response(null, { status: 303, headers: { Location: `${basePath}/?e=1`, ...NO_STORE } });
  }

  const cookie = await auth.sessionCookie();
  if (asJson) return json({ ok: true }, 200, { ...NO_STORE, "Set-Cookie": cookie });
  return new Response(null, {
    status: 303,
    headers: { Location: `${basePath}/`, "Set-Cookie": cookie, ...NO_STORE },
  });
}

/* --------------------------------------------------------------- link store */

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

/* ---------------------------------------------------------------------- API */

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
      if (
        !Number.isInteger(payload.ttl) ||
        (payload.ttl !== 0 && (payload.ttl < MIN_TTL || payload.ttl > MAX_TTL))
      ) {
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
    NO_STORE,
  );
}

async function collectLinks(store, host, basePath) {
  const codes = await store.list({ limit: MAX_LIST });
  const records = await Promise.all(codes.map((code) => readRecord(store, code)));

  return records
    .map((record, index) => ({ code: codes[index], record }))
    .filter((item) => item.record?.url)
    .sort((a, b) => (b.record.createdAt || 0) - (a.record.createdAt || 0))
    .map(({ code, record }) => ({
      code,
      target: record.url,
      hits: record.hits || 0,
      createdAt: record.createdAt || null,
      expiresAt: record.expiresAt || null,
      short: `https://${host}${basePath}/${code}`,
    }));
}

async function listLinks(store, host, basePath) {
  const links = await collectLinks(store, host, basePath);
  return json({ count: links.length, links }, 200, NO_STORE);
}

/* ---------------------------------------------------------------------- HTML */

const SHORT_CSS = String.raw`
.editor input.url{width:100%;border:0;background:transparent;color:var(--ink);padding:20px 16px;font:14.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;outline:none}
.editor input.url::placeholder{color:#5b6070}
.result .linkrow input{font-size:14px}
.login{max-width:380px;margin:0 auto}
.login input{width:100%;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.04);color:var(--ink);padding:12px 14px;font-size:14px;outline:none}
.login input:focus{border-color:rgba(34,211,238,.5);box-shadow:0 0 0 4px rgba(34,211,238,.09)}
.login .btn{width:100%;justify-content:center;margin-top:12px;padding:11px}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin:38px 0 12px}
.head h2{margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);font-weight:500}
table.links{width:100%;border-collapse:collapse;font-size:13px}
table.links th{text-align:left;font-weight:500;color:var(--dim);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:0 10px 8px;border-bottom:1px solid var(--line)}
table.links td{padding:11px 10px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
table.links code{font-family:ui-monospace,monospace;color:var(--cyan)}
table.links a{color:var(--ink);text-decoration:none}
table.links a:hover{color:var(--cyan)}
table.links .num{font-variant-numeric:tabular-nums;color:var(--ink)}
.mono{font-family:ui-monospace,monospace;font-size:12px;color:var(--dim);white-space:nowrap}
.trunc{display:block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dim);font-size:12.5px}
.mini{appearance:none;border:1px solid var(--line);background:transparent;color:var(--dim);border-radius:7px;padding:4px 9px;font-size:11.5px;cursor:pointer;font-family:inherit}
.mini:hover{color:#f09595;border-color:rgba(240,149,149,.4)}
.wrap{overflow-x:auto}
@media (max-width:640px){.trunc{max-width:140px}.mono{display:none}}
`;

function renderLogin({ basePath, configured }) {
  if (!configured) {
    return shell({
      title: "短链",
      basePath,
      style: SHORT_CSS,
      body: `
<div class="empty">
  <h2>还没有配置 ADMIN</h2>
  <p>短链的创建与管理需要管理员口令。在项目目录执行：</p>
  <p><code>npx wrangler secret put ADMIN</code></p>
  <p>然后重新访问本页。</p>
</div>`,
    });
  }

  return shell({
    title: "短链",
    basePath,
    style: SHORT_CSS,
    body: `
<div class="login">
  <h1>短链控制台</h1>
  <p class="lead">需要管理员口令才能创建和管理链接。</p>
  <form method="post" action="${escapeHtml(basePath)}/login">
    <input type="password" name="password" placeholder="ADMIN 口令" autocomplete="current-password" autofocus>
    <button class="btn primary" type="submit">进入</button>
  </form>
  <p class="error" id="login-error"></p>
</div>
<script>
if (new URLSearchParams(location.search).get('e')) {
  document.getElementById('login-error').textContent = '口令不正确，请重试。';
}
</script>`,
  });
}

async function renderConsole({ store, host, basePath }) {
  const links = await collectLinks(store, host, basePath);

  const options = TTL_OPTIONS.map(
    (opt) => `<option value="${opt.value}"${opt.value === 0 ? " selected" : ""}>${opt.label}</option>`,
  ).join("");

  const rows = links
    .map(
      ({ code, target, hits, expiresAt }) => `
<tr data-code="${escapeHtml(code)}">
  <td><code>${escapeHtml(code)}</code></td>
  <td><a href="${escapeHtml(basePath)}/${escapeHtml(code)}" target="_blank" rel="noopener">${escapeHtml(basePath)}/${escapeHtml(code)}</a></td>
  <td><span class="trunc" title="${escapeHtml(target)}">${escapeHtml(target)}</span></td>
  <td class="num">${hits}</td>
  <td class="mono">${escapeHtml(formatDate(expiresAt))}</td>
  <td><button class="mini" type="button" data-del="${escapeHtml(code)}">删除</button></td>
</tr>`,
    )
    .join("");

  const body = `
<h1>短链控制台</h1>
<p class="lead">生成短链、查看点击、删除失效链接。存储 backend：${store.backend === "kv" ? "kv（持久）" : "memory（不持久，仅测试）"}</p>

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
  </div>
</div>
<p class="error" id="error"></p>

<div class="head">
  <h2>已有链接 <span id="count">${links.length}</span></h2>
  <form method="post" action="${escapeHtml(basePath)}/logout"><button class="mini" type="submit">退出</button></form>
</div>
<div class="wrap">
<table class="links">
  <thead><tr><th>短码</th><th>链接</th><th>目标</th><th>点击</th><th>过期</th><th></th></tr></thead>
  <tbody id="rows">${rows || `<tr id="empty"><td colspan="6" class="mono">还没有链接，上面生成一条。</td></tr>`}</tbody>
</table>
</div>`;

  const script = String.raw`
(function(){
  var base = window.__BASE;
  var target = document.getElementById('target');
  var ttl = document.getElementById('ttl');
  var create = document.getElementById('create');
  var result = document.getElementById('result');
  var shortInput = document.getElementById('short');
  var openLink = document.getElementById('open');
  var copyBtn = document.getElementById('copy');
  var errEl = document.getElementById('error');
  var rows = document.getElementById('rows');
  var count = document.getElementById('count');

  function stamp(ms){
    if (!ms) return '永久';
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  }

  function cell(text, className){
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function addRow(link){
    var empty = document.getElementById('empty');
    if (empty) empty.remove();

    var tr = document.createElement('tr');
    tr.setAttribute('data-code', link.code);

    var codeCell = document.createElement('td');
    var codeEl = document.createElement('code');
    codeEl.textContent = link.code;
    codeCell.appendChild(codeEl);

    var linkCell = document.createElement('td');
    var anchor = document.createElement('a');
    anchor.href = base + '/' + link.code;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = base + '/' + link.code;
    linkCell.appendChild(anchor);

    var targetCell = document.createElement('td');
    var span = document.createElement('span');
    span.className = 'trunc';
    span.title = link.target;
    span.textContent = link.target;
    targetCell.appendChild(span);

    var actCell = document.createElement('td');
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'mini';
    del.setAttribute('data-del', link.code);
    del.textContent = '删除';
    actCell.appendChild(del);

    tr.appendChild(codeCell);
    tr.appendChild(linkCell);
    tr.appendChild(targetCell);
    tr.appendChild(cell('0', 'num'));
    tr.appendChild(cell(link.expiresAt ? stamp(link.expiresAt) : '永久', 'mono'));
    tr.appendChild(actCell);

    rows.insertBefore(tr, rows.firstChild);
    count.textContent = String(rows.querySelectorAll('tr[data-code]').length);
  }

  create.addEventListener('click', function(){
    if (!target.value) { errEl.textContent = '请输入链接'; return; }
    errEl.textContent = '';
    create.disabled = true;
    create.textContent = '生成中…';
    fetch(base + '/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target.value, ttl: parseInt(ttl.value, 10) })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      create.disabled = false;
      create.textContent = '生成短链';
      if (!res.ok) {
        if (res.data.error === 'unauthorized') { location.reload(); return; }
        errEl.textContent = res.data.error || '生成失败';
        return;
      }
      shortInput.value = res.data.short;
      openLink.href = base + '/' + res.data.code;
      result.hidden = false;
      shortInput.select();
      addRow(res.data);
      target.value = '';
    }).catch(function(e){
      create.disabled = false;
      create.textContent = '生成短链';
      errEl.textContent = '网络错误：' + e.message;
    });
  });

  rows.addEventListener('click', function(event){
    var btn = event.target.closest('[data-del]');
    if (!btn) return;
    var code = btn.getAttribute('data-del');
    if (!confirm('删除 ' + code + '？此操作不可撤销。')) return;
    fetch(base + '/api/' + code, { method: 'DELETE' }).then(function(r){
      if (!r.ok) { errEl.textContent = '删除失败'; return; }
      var tr = rows.querySelector('tr[data-code="' + code + '"]');
      if (tr) tr.remove();
      count.textContent = String(rows.querySelectorAll('tr[data-code]').length);
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

  return shell({ title: "短链控制台", body, basePath, script, style: SHORT_CSS });
}

function formatDate(ms) {
  if (!ms) return "永久";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function renderMissing({ basePath, code }) {
  const body = `
<div class="empty">
  <h2>短链不存在或已过期</h2>
  <p><code>${escapeHtml(code || "")}</code> 没有对应的目标地址。</p>
  <p><a class="btn" href="${escapeHtml(basePath)}/">打开控制台</a></p>
</div>`;
  return shell({ title: "短链", body, basePath, script: "", style: SHORT_CSS });
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    return handle(request, env, {
      path: url.pathname,
      basePath: "",
      host: url.hostname,
      waitUntil: typeof ctx?.waitUntil === "function" ? (p) => ctx.waitUntil(p) : undefined,
    });
  },
};
