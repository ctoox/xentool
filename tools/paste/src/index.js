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
import { escapeHtml } from "../../../packages/ui/shell.js";
import {
  page,
  card,
  btn,
  select,
  checkbox,
  copyLink,
  COPY_LINK_SCRIPT,
  notice,
  emptyState,
  badge,
} from "../../../packages/ui/components.js";

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

function renderCreatePage({ basePath, durable }) {
  const body = `
${card({
  title: "创建 Paste",
  sub: "纯文本暂存，链接即分享。内容存放在 Cloudflare KV，到期自动删除。",
  body: `
    <textarea class="x-textarea" id="content" placeholder="粘贴或输入文本…（上限 64 KB）" spellcheck="false" style="min-height:240px"></textarea>
    <div class="x-row" style="margin-top:14px">
      ${select({ label: "过期时间", id: "ttl", options: TTL_OPTIONS, value: DEFAULT_TTL })}
      ${checkbox({ label: "阅后即焚", id: "burn" })}
      <span class="x-toolbar__spacer"></span>
      ${btn({ label: "创建链接", variant: "primary", attrs: { id: "create" } })}
    </div>
    ${copyLink({ label: "链接已生成" })}
    <p class="error" id="error" style="margin-top:10px"></p>
  `,
  foot: `存储 backend：${durable ? "kv（持久）" : "memory（不持久，仅测试）"}`,
})}
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "内容不经过第三方。",
  body: "文本直接写入 KV，链接之外没有索引；阅后即焚的条目在第一次读取后立刻删除。",
})}
</div>`;

  const script = String.raw`
(function(){
  var content = document.getElementById('content');
  var ttl = document.getElementById('ttl');
  var burn = document.getElementById('burn');
  var create = document.getElementById('create');
  var result = document.getElementById('result');
  var urlInput = document.getElementById('url');
  var openLink = document.getElementById('open');
  var errEl = document.getElementById('error');
  var label = create.querySelector('span:last-child') || create;

  create.addEventListener('click', function(){
    if (!content.value) { errEl.textContent = '内容不能为空'; return; }
    errEl.textContent = '';
    create.disabled = true;
    label.textContent = '创建中…';
    fetch(window.__BASE + '/api/paste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.value, ttl: parseInt(ttl.value, 10), burn: burn.checked })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      create.disabled = false;
      label.textContent = '创建链接';
      if (!res.ok) { errEl.textContent = res.data.message || res.data.error || '创建失败'; return; }
      urlInput.value = res.data.url;
      openLink.href = window.__BASE + '/' + res.data.id;
      result.hidden = false;
      urlInput.select();
    }).catch(function(e){
      create.disabled = false;
      label.textContent = '创建链接';
      errEl.textContent = '网络错误：' + e.message;
    });
  });
})();
`;

  return page({
    title: "Paste",
    lead: "纯文本暂存，链接即分享。到期自动删除。",
    body,
    actions: durable ? badge({ text: "KV 持久", tone: "accent" }) : badge({ text: "内存（不持久）", tone: "warn" }),
    script: script + COPY_LINK_SCRIPT,
    basePath,
  });
}

function renderViewPage({ id, record, basePath }) {
  const burnNote = record.burn ? " · 阅后即焚，本次读取后已销毁" : "";
  const body = `
<div class="x-row" style="margin-bottom:14px">
  <span class="x-dot x-dot--ok" aria-hidden="true"></span>
  <span class="x-muted" style="font-size:12.5px">Paste</span>
  ${badge({ text: id, tone: "accent" })}
  <span class="x-muted" style="font-size:12.5px">到期自动删除${burnNote}</span>
</div>
<pre class="x-code__body paste-body" id="content">${escapeHtml(record.content)}</pre>
<div class="x-row" style="margin-top:16px">
  ${btn({ label: "复制全文", variant: "primary", attrs: { id: "copy" } })}
  ${btn({ label: "原始文本", href: `${basePath}/${id}?raw=1`, variant: "ghost" })}
  ${btn({ label: "新建", href: `${basePath}/`, variant: "ghost" })}
</div>`;

  const script = String.raw`
(function(){
  var btn = document.getElementById('copy');
  var pre = document.getElementById('content');
  var label = btn.querySelector('span:last-child') || btn;
  btn.addEventListener('click', function(){
    navigator.clipboard.writeText(pre.textContent).then(function(){
      label.textContent = '已复制';
      setTimeout(function(){ label.textContent = '复制全文'; }, 1200);
    });
  });
})();
`;

  return page({ title: `Paste ${id}`, lead: "", body, script, basePath });
}

function renderMissingPage({ basePath }) {
  const body = emptyState({
    icon: "inbox",
    title: "内容不存在或已过期",
    desc: "链接可能已到期，或已被阅后即焚销毁。",
    action: btn({ label: "新建一个 Paste", href: `${basePath}/`, variant: "primary" }),
  });
  return page({ title: "Paste", lead: "", body, basePath });
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return handle(request, env, { path: url.pathname, basePath: "", host: url.hostname });
  },
};
