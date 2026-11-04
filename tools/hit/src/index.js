/**
 * Hit counter — exact counting through a Durable Object.
 *
 *   GET /hit/<name>              increment and return  (default)
 *   GET /hit/<name>?op=peek      read without changing
 *   GET /hit/<name>?op=reset     zero it
 *   GET /hit/                    UI
 *
 * Why a Durable Object: KV has no atomic increment and is eventually
 * consistent, so short-link clicks can undercount under concurrency. A Counter
 * object serialises every write through a single instance, which is exact.
 *
 * One object per name; `idFromName` makes the mapping deterministic, so
 * `/hit/deploys` always lands on the same object without any lookup table.
 */
import { json, html, health, fail, notFound } from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const NO_STORE = { "Cache-Control": "no-store" };
const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const OPS = new Set(["inc", "peek", "reset"]);

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const namespace = env?.COUNTER;

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-hit");

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return namespace
        ? html(renderPage({ basePath }), 200, NO_STORE)
        : html(renderMissingBinding({ basePath }), 503, NO_STORE);
    }
    return json(
      {
        tool: "hit",
        backend: "durable-object",
        available: Boolean(namespace),
        usage: {
          increment: `GET ${basePath}/<name>`,
          peek: `GET ${basePath}/<name>?op=peek`,
          reset: `GET ${basePath}/<name>?op=reset`,
        },
      },
      200,
      NO_STORE,
    );
  }

  if (!namespace) {
    return fail('COUNTER binding is not configured ([[durable_objects.bindings]] name = "COUNTER")', 503);
  }

  const name = path.slice(1);
  if (!NAME_PATTERN.test(name)) return fail("name must match [a-zA-Z0-9_-]{1,64}", 400);

  const op = url.searchParams.get("op") || "inc";
  if (!OPS.has(op)) return fail("op must be inc, peek or reset", 400);

  const stub = namespace.get(namespace.idFromName(name));
  const response = await stub.fetch(new URL(`https://counter/?op=${op}`));
  const data = await response.json().catch(() => ({ value: null, op }));

  if (wantsHtml) {
    return html(renderCounter({ basePath, name, value: data.value, op }), 200, NO_STORE);
  }
  return json({ name, value: data.value, op, backend: "durable-object" }, 200, NO_STORE);
}

/* ---------------------------------------------------------------------- UI */

const HIT_CSS = String.raw`
.number{font-size:76px;font-weight:600;letter-spacing:-.04em;line-height:1;margin:18px 0 6px;background:linear-gradient(96deg,var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.hint-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}
`;

function renderPage({ basePath }) {
  const body = `
<h1>强一致计数</h1>
<p class="lead">每个名字对应一个 Durable Object，写入被串行化，并发下不会丢计数。KV 做不到这一点。</p>
<div class="editor" style="padding:16px">
  <input class="field" id="name" value="demo" placeholder="计数器名字" style="width:100%">
</div>
<div class="hint-row">
  <button class="btn primary" id="inc" type="button">+1</button>
  <button class="btn" id="peek" type="button">读取</button>
  <button class="btn" id="reset" type="button">归零</button>
</div>
<div class="number" id="value">—</div>
<div class="meta" id="meta" style="color:var(--dim);font-size:12.5px"></div>
<p class="error" id="error"></p>`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var nameEl = document.getElementById('name');
  var valueEl = document.getElementById('value');
  var metaEl = document.getElementById('meta');
  var errEl = document.getElementById('error');

  function call(op){
    var name = nameEl.value.trim();
    if (!name) { errEl.textContent = '请输入名字'; return; }
    errEl.textContent = '';
    fetch(base + '/' + encodeURIComponent(name) + '?op=' + op).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      if (!res.ok) { errEl.textContent = res.data.error || '失败'; return; }
      valueEl.textContent = String(res.data.value);
      metaEl.textContent = res.data.name + ' · ' + res.data.backend;
    }).catch(function(e){
      errEl.textContent = '网络错误：' + e.message;
    });
  }

  document.getElementById('inc').addEventListener('click', function(){ call('inc'); });
  document.getElementById('peek').addEventListener('click', function(){ call('peek'); });
  document.getElementById('reset').addEventListener('click', function(){ call('reset'); });
  call('peek');
})();
`;

  return shell({ title: "强一致计数", body, basePath, script, style: HIT_CSS });
}

function renderCounter({ basePath, name, value, op }) {
  const body = `
<div class="meta"><span class="dot" aria-hidden="true"></span><code>${escapeHtml(name)}</code><span>${escapeHtml(op)}</span></div>
<div class="number">${escapeHtml(value ?? "—")}</div>
<div class="actions">
  <a class="btn" href="${escapeHtml(basePath)}/${escapeHtml(name)}">+1</a>
  <a class="btn" href="${escapeHtml(basePath)}/">换一个计数器</a>
</div>`;
  return shell({ title: `计数 ${name}`, body, basePath, script: "" });
}

function renderMissingBinding({ basePath }) {
  const body = `
<div class="empty">
  <h2>Durable Objects 未绑定</h2>
  <p>需要在 wrangler.toml 中声明 <code>[[durable_objects.bindings]]</code> 与 <code>[[migrations]]</code>，并导出 Counter 类。</p>
  <p><a class="btn" href="${escapeHtml(basePath)}/">返回</a></p>
</div>`;
  return shell({ title: "强一致计数", body, basePath, script: "" });
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
