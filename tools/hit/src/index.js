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
import { json, html, health, fail } from "../../../packages/core/index.js";
import { escapeHtml } from "../../../packages/ui/shell.js";
import { page, card, btn, field, display, emptyState, notice, badge } from "../../../packages/ui/components.js";

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

const COUNTER_SCRIPT = String.raw`
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

function renderPage({ basePath }) {
  const body = `
${card({
  tint: true,
  title: "计数器",
  sub: "每个名字对应一个 Durable Object，写入被串行化，并发下不会丢计数。",
  body: `
    ${field({ label: "计数器名字", name: "name", id: "name", value: "demo", placeholder: "字母、数字、下划线" })}
    ${display({ value: "—", label: "当前值", id: "value" })}
    <div class="x-row" style="margin-top:22px">
      ${btn({ label: "+1", variant: "primary", attrs: { id: "inc" } })}
      ${btn({ label: "读取", attrs: { id: "peek" } })}
      ${btn({ label: "归零", variant: "ghost", attrs: { id: "reset" } })}
    </div>
    <p class="x-field__hint x-mono" id="meta"></p>
    <p class="error" id="error"></p>
  `,
  foot: `POST 语义由 GET + ?op= 表达，方便直接在浏览器地址栏或 curl 里调用。`,
})}
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "为什么不用 KV。",
  body: "KV 没有原子自增且最终一致，并发点击会少算；Durable Object 把写入串行化，结果是精确的。",
})}
</div>`;

  return page({
    title: "强一致计数",
    lead: "一个名字一个对象，读改写走同一条单线程队列。",
    body,
    actions: badge({ text: "Durable Objects", tone: "accent" }),
    script: COUNTER_SCRIPT,
    basePath,
  });
}

function renderCounter({ basePath, name, value, op }) {
  const body = `
${card({
  tint: true,
  body: `
    <div class="x-row" style="margin-bottom:18px">
      ${badge({ text: name, tone: "accent", dot: true })}
      ${badge({ text: op, tone: "off" })}
    </div>
    ${display({ value: value ?? "—", label: "当前计数" })}
    <div class="x-row" style="margin-top:24px">
      ${btn({ label: "+1", href: `${basePath}/${escapeHtml(name)}`, variant: "primary" })}
      ${btn({ label: "换一个计数器", href: `${basePath}/`, variant: "ghost" })}
    </div>
  `,
})}`;
  return page({ title: `计数 · ${name}`, lead: "", body: `<div class="x-fade">${body}</div>`, basePath });
}

function renderMissingBinding({ basePath }) {
  const body = `
${emptyState({
  icon: "bolt",
  title: "Durable Objects 未绑定",
  desc: "需要在 wrangler.toml 中声明 [[durable_objects.bindings]] 与 [[migrations]]，并在入口导出 Counter 类。",
  action: `${btn({ label: "返回", href: `${basePath}/`, variant: "ghost" })}`,
})}
<div style="margin-top:16px">
${notice({
  tone: "warn",
  title: "这是部署配置问题，不是代码问题。",
  body: "补上绑定并重新部署后，本页会自动可用，无需改动任何代码。",
})}
</div>`;
  return page({ title: "强一致计数", lead: "该能力当前未启用。", body, basePath });
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
