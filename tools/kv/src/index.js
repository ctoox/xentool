/**
 * KV console — inspect the shared namespace from the browser.
 *
 *   GET    /kv/            console (admin only)
 *   GET    /kv/api?prefix= list keys
 *   GET    /kv/api/<key>   read one value
 *   PUT    /kv/api/<key>   write one value        (only keys under "kv:")
 *   DELETE /kv/api/<key>   delete one key         (only keys under "kv:")
 *
 * Why writes are restricted: every tool shares one KV namespace and owns a
 * prefix (paste:, short:, file: …). A free-form editor over the whole
 * namespace is one typo away from destroying production pastes, so writes are
 * allowed only inside the `kv:` scratch prefix — the namespace stays readable
 * everywhere, which is what inspection actually needs.
 */
import { json, html, health, fail, notFound, createAuth } from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const NO_STORE = { "Cache-Control": "no-store" };
const WRITE_PREFIX = "kv:";
const MAX_VALUE = 64 * 1024;
const MAX_LIST = 200;

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const kv = env?.KV ?? env?.XENTOOL_KV ?? null;
  const method = request.method;

  if (method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-kv");

  const auth = createAuth(request, env, { cookieName: "xt_kv" });

  // Sign-in lives here rather than being borrowed from the short-link console:
  // the cookie name is tool-scoped, so another tool's cookie would not match.
  if (path === "/login" && method === "POST") return login(request, auth, basePath);
  if (path === "/logout" && method === "POST") {
    return new Response(null, {
      status: 303,
      headers: { Location: `${basePath}/`, "Set-Cookie": auth.clearedCookie(), ...NO_STORE },
    });
  }

  const authorized = await auth.authorized();

  if (!kv) {
    if (wantsHtml) return html(renderBlocked({ basePath, reason: "missing" }), 503, NO_STORE);
    return fail("KV binding is not configured", 503);
  }

  if (!authorized) {
    if (wantsHtml) return html(renderBlocked({ basePath, reason: "locked", configured: auth.configured }), 401, NO_STORE);
    return json({ error: "unauthorized", hint: "Authorization: Bearer <ADMIN>" }, 401, NO_STORE);
  }

  if (path === "/" && method === "GET") {
    if (wantsHtml) return html(renderConsole({ basePath }), 200, NO_STORE);
    return json(
      {
        tool: "kv",
        backend: "kv",
        writePrefix: WRITE_PREFIX,
        limits: { maxValue: MAX_VALUE, maxList: MAX_LIST },
        usage: {
          list: `GET ${basePath}/api?prefix=`,
          read: `GET ${basePath}/api/<key>`,
          write: `PUT ${basePath}/api/<key>  (key must start with ${WRITE_PREFIX})`,
          remove: `DELETE ${basePath}/api/<key>  (key must start with ${WRITE_PREFIX})`,
        },
      },
      200,
      NO_STORE,
    );
  }

  if (path === "/api" && method === "GET") {
    const prefix = url.searchParams.get("prefix") || "";
    const listed = await kv.list({ prefix, limit: MAX_LIST });
    const keys = (listed.keys || []).map((key) => ({
      name: key.name,
      expiration: key.expiration || null,
      editable: key.name.startsWith(WRITE_PREFIX),
    }));
    return json({ count: keys.length, prefix, writable: WRITE_PREFIX, keys }, 200, NO_STORE);
  }

  if (path.startsWith("/api/")) {
    const key = decodeURIComponent(path.slice("/api/".length));
    if (!key) return fail("key is required", 400);

    if (method === "GET") {
      const value = await kv.get(key);
      if (value === null) return json({ key, value: null, exists: false }, 404, NO_STORE);
      return json({ key, value, exists: true }, 200, NO_STORE);
    }

    const writable = key.startsWith(WRITE_PREFIX);
    if (!writable) {
      return fail(`writes are restricted to keys starting with "${WRITE_PREFIX}"`, 403);
    }

    if (method === "PUT") {
      const body = await request.text();
      const size = new TextEncoder().encode(body).length;
      if (size > MAX_VALUE) return fail(`value must be at most ${MAX_VALUE} bytes`, 413);
      await kv.put(key, body);
      return json({ key, written: size }, 200, NO_STORE);
    }

    if (method === "DELETE") {
      await kv.delete(key);
      return json({ key, deleted: true }, 200, NO_STORE);
    }
  }

  return wantsHtml ? html(renderConsole({ basePath }), 404, NO_STORE) : notFound();
}

/* ------------------------------------------------------------------- auth */

async function login(request, auth, basePath) {
  const type = request.headers.get("content-type") || "";
  const asJson = type.includes("application/json");
  const password = asJson
    ? await request.json().then((body) => body?.password ?? null).catch(() => null)
    : new URLSearchParams(await request.text()).get("password");

  if (!auth.configured) {
    return asJson ? json({ error: "ADMIN is not configured" }, 503, NO_STORE) : new Response(null, {
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

/* ---------------------------------------------------------------------- UI */

const KV_CSS = String.raw`
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
.toolbar input{flex:1;min-width:180px}
table.keys{width:100%;border-collapse:collapse;font-size:13px}
table.keys th{text-align:left;font-weight:500;color:var(--dim);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:0 10px 8px;border-bottom:1px solid var(--line)}
table.keys td{padding:10px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}
table.keys code{font-family:ui-monospace,monospace;font-size:12px}
table.keys tr.sel{background:rgba(34,211,238,.07)}
.badge{font:10.5px ui-monospace,monospace;padding:2px 6px;border-radius:5px;border:1px solid var(--line);color:var(--dim)}
.badge.w{color:var(--cyan);border-color:rgba(34,211,238,.35)}
.wrap{overflow-x:auto}
.split{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px}
@media (max-width:760px){.split{grid-template-columns:1fr}}
`;

function renderConsole({ basePath }) {
  const body = `
<h1>KV 控制台</h1>
<p class="lead">浏览共享 namespace 的全部键。可写区域限定在 <code>kv:</code> 前缀，避免误改其他工具的数据。</p>
<div class="toolbar">
  <input class="field" id="prefix" placeholder="按前缀过滤，例如 paste:" value="">
  <button class="btn" id="reload" type="button">刷新</button>
  <span class="spacer" style="flex:1"></span>
  <button class="btn" id="new" type="button">新建 kv: 键</button>
</div>
<div class="wrap">
<table class="keys">
  <thead><tr><th>键</th><th>过期</th><th>可写</th></tr></thead>
  <tbody id="rows"><tr><td colspan="3" class="muted">加载中…</td></tr></tbody>
</table>
</div>
<div class="split">
  <div>
    <div class="label">值</div>
    <textarea id="value" placeholder="选中左侧任意键查看内容…" spellcheck="false" style="min-height:180px" readonly></textarea>
  </div>
  <div>
    <div class="label">编辑（仅 kv: 前缀）</div>
    <textarea id="editor" placeholder="选择或新建一个 kv: 键后在此写入…" spellcheck="false" style="min-height:180px"></textarea>
    <div class="row" style="display:flex;gap:10px;margin-top:10px">
      <button class="btn primary" id="save" type="button">保存</button>
      <button class="btn" id="remove" type="button">删除</button>
    </div>
  </div>
</div>
<p class="error" id="error"></p>`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var rows = document.getElementById('rows');
  var prefix = document.getElementById('prefix');
  var value = document.getElementById('value');
  var editor = document.getElementById('editor');
  var errEl = document.getElementById('error');
  var current = null;

  function el(tag, text, cls){
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }

  function stamp(ms){
    return ms ? new Date(ms).toISOString().replace('T',' ').slice(0,16) : '—';
  }

  function select(name, editable){
    current = name;
    var all = rows.querySelectorAll('tr[data-key]');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('sel', all[i].getAttribute('data-key') === name);
    }
    fetch(base + '/api/' + encodeURIComponent(name)).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      value.value = res.ok ? res.data.value : '(读取失败)';
      editor.value = editable && res.ok ? res.data.value : '';
      editor.readOnly = !editable;
    });
  }

  function load(){
    errEl.textContent = '';
    rows.innerHTML = '';
    var loading = el('tr');
    var cell = el('td', '加载中…', 'muted');
    cell.setAttribute('colspan', '3');
    loading.appendChild(cell);
    rows.appendChild(loading);

    var q = prefix.value ? '?prefix=' + encodeURIComponent(prefix.value) : '';
    fetch(base + '/api' + q).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      rows.innerHTML = '';
      if (!res.ok) {
        errEl.textContent = res.data.error || '读取失败';
        return;
      }
      if (!res.data.keys.length) {
        var empty = el('tr');
        var c = el('td', '没有匹配的键', 'muted');
        c.setAttribute('colspan', '3');
        empty.appendChild(c);
        rows.appendChild(empty);
        return;
      }
      res.data.keys.forEach(function(item){
        var tr = el('tr');
        tr.setAttribute('data-key', item.name);

        var nameCell = el('td');
        nameCell.appendChild(el('code', item.name));
        nameCell.style.cursor = 'pointer';
        nameCell.addEventListener('click', function(){ select(item.name, item.editable); });

        tr.appendChild(nameCell);
        tr.appendChild(el('td', stamp(item.expiration), 'muted'));
        var flag = el('td');
        flag.appendChild(el('span', item.editable ? '可写' : '只读', 'badge' + (item.editable ? ' w' : '')));
        tr.appendChild(flag);

        rows.appendChild(tr);
      });
      var first = rows.querySelector('tr[data-key]');
      if (first) first.querySelector('td').click();
    }).catch(function(e){
      errEl.textContent = '网络错误：' + e.message;
    });
  }

  document.getElementById('reload').addEventListener('click', load);

  document.getElementById('new').addEventListener('click', function(){
    var name = prompt('新键名（必须以 kv: 开头）', 'kv:demo');
    if (!name) return;
    if (name.indexOf('kv:') !== 0) { errEl.textContent = '键名必须以 kv: 开头'; return; }
    current = name;
    editor.readOnly = false;
    editor.value = '';
    value.value = '';
  });

  document.getElementById('save').addEventListener('click', function(){
    if (!current || current.indexOf('kv:') !== 0) { errEl.textContent = '请先选择或新建一个 kv: 键'; return; }
    fetch(base + '/api/' + encodeURIComponent(current), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: editor.value
    }).then(function(r){
      if (!r.ok) { errEl.textContent = '保存失败'; return; }
      errEl.textContent = '';
      load();
    });
  });

  document.getElementById('remove').addEventListener('click', function(){
    if (!current || current.indexOf('kv:') !== 0) { errEl.textContent = '只能删除 kv: 前缀的键'; return; }
    if (!confirm('删除 ' + current + '？')) return;
    fetch(base + '/api/' + encodeURIComponent(current), { method: 'DELETE' }).then(function(r){
      if (!r.ok) { errEl.textContent = '删除失败'; return; }
      current = null;
      value.value = '';
      editor.value = '';
      load();
    });
  });

  load();
})();
`;

  return shell({ title: "KV 控制台", body, basePath, script, style: KV_CSS });
}

function renderBlocked({ basePath, reason, configured }) {
  const body =
    reason === "missing"
      ? `<div class="empty"><h2>KV 未绑定</h2><p>在 wrangler.toml 中声明 <code>[[kv_namespaces]]</code> 后重新部署。</p></div>`
      : configured
        ? `<div class="login" style="max-width:380px;margin:0 auto">
  <h1>KV 控制台</h1>
  <p class="lead">需要管理员口令。</p>
  <form method="post" action="${escapeHtml(basePath)}/login"><input type="password" name="password" placeholder="ADMIN 口令" style="width:100%;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.04);color:var(--ink);padding:12px 14px"><button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:12px;padding:11px">进入</button></form>
  <p class="error" id="login-error"></p>
</div>
<script>
if (new URLSearchParams(location.search).get('e')) {
  document.getElementById('login-error').textContent = '口令不正确，请重试。';
}
</script>`
        : `<div class="empty"><h2>还没有配置 ADMIN</h2><p>KV 控制台需要管理员口令：<code>npx wrangler secret put ADMIN</code></p></div>`;
  return shell({ title: "KV 控制台", body, basePath, script: "" });
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
