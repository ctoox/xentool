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
import {
  json,
  text,
  html,
  health,
  fail,
  notFound,
  createStore,
  NO_STORE,
  MAX_BYTES,
  MIN_TTL,
  DEFAULT_TTL,
  MAX_TTL,
  ID_PATTERN,
  TTL_OPTIONS,
  readRecord,
  isAdmin,
  parseCreate,
  saveRecord,
  listRecords,
  shareUrl,
} from "../../../packages/core/index.js";
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

  /*
   * Admin: list what is still alive and revoke a single paste. The page itself
   * is inert HTML — it renders nothing until a token is supplied, and the API
   * refuses everything without `Authorization: Bearer $ADMIN`.
   */
  if (path === "/admin" && request.method === "GET") {
    if (!env.ADMIN) return wantsHtml ? html(renderMissingPage({ basePath }), 404, NO_STORE) : notFound();
    return html(renderAdminPage({ basePath }), 200, NO_STORE);
  }

  if (path === "/api/admin/pastes" && request.method === "GET") {
    if (!isAdmin(request, env)) return fail("unauthorized", 401);
    return listPastes(store);
  }

  if (path.startsWith("/api/admin/pastes/") && request.method === "DELETE") {
    if (!isAdmin(request, env)) return fail("unauthorized", 401);
    const revokeId = path.slice("/api/admin/pastes/".length);
    if (!ID_PATTERN.test(revokeId)) return fail("invalid id", 400);
    await store.delete(revokeId);
    return json({ ok: true, id: revokeId, revoked: true }, 200, NO_STORE);
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
  const parsed = await parseCreate(request);
  if (!parsed.ok) return fail(parsed.message, parsed.status);

  const { id } = await saveRecord(store, {
    content: parsed.content,
    ttl: parsed.ttl,
    burn: parsed.burn,
    size: parsed.size,
  });

  return json(
    {
      id,
      url: shareUrl({ host, basePath, id }),
      expiresIn: parsed.ttl,
      burn: parsed.burn,
      storage: store.backend,
    },
    201,
    NO_STORE,
  );
}

async function listPastes(store) {
  const items = await listRecords(store, "paste");
  return json({ ok: true, count: items.length, items }, 200, NO_STORE);
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
</div>
<div class="x-row" style="margin-top:14px">
  ${btn({ label: "管理已分享的链接", href: `${basePath}/admin`, variant: "ghost" })}
  <span class="x-muted" style="font-size:12.5px">可以让未到期的链接立刻失效。</span>
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

function renderAdminPage({ basePath }) {
  const style = `
.paste-admin__list{display:none}
.paste-admin__table td.paste-nowrap{white-space:nowrap}
.paste-item{border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.18);padding:12px 14px;margin:0 0 10px}
.paste-item__top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.paste-item__top a{color:var(--ink);text-decoration:none;font-weight:600;font-size:13.5px}
.paste-item__preview{margin:8px 0 0;font-size:13px;color:var(--ink-2);line-height:1.55;word-break:break-word}
.paste-item__meta{margin:7px 0 0;font-size:12px;color:var(--dim);line-height:1.6}
.paste-item__revoke{margin-left:auto}
@media (max-width:700px){
  .paste-admin__table{display:none}
  .paste-admin__list{display:block}
}
`;

  const body = `
${card({
  sub: "列出尚未过期的链接，并可以让其中任意一条立刻失效。删除后 KV 记录消失，再打开就是 404。",
  body: `
    <div class="x-row" style="align-items:flex-end;gap:10px">
      <label class="x-field" style="flex:1 1 220px;margin:0;min-width:0">
        <span class="x-field__label">管理令牌</span>
        <input class="x-input" id="token" type="password" autocomplete="off" placeholder="服务端 ADMIN 变量">
      </label>
      <div class="x-row" style="margin:0;flex:none">
        ${btn({ label: "解锁", variant: "primary", attrs: { id: "unlock" } })}
        ${btn({ label: "刷新", variant: "ghost", attrs: { id: "refresh" } })}
      </div>
    </div>
    <p class="error" id="error"></p>
    <div id="panel"></div>
  `,
  foot: "令牌只存在当前标签页的 sessionStorage，关掉页面就没了；服务端用 ADMIN 变量比对。",
})}`;

  const script = String.raw`
(function(){
  var token = document.getElementById('token');
  var unlock = document.getElementById('unlock');
  var refresh = document.getElementById('refresh');
  var error = document.getElementById('error');
  var panel = document.getElementById('panel');

  function esc(value){
    var d = document.createElement('div');
    d.textContent = value == null ? '' : String(value);
    return d.innerHTML;
  }
  function size(n){
    if (n == null) return '—';
    if (n < 1024) return n + ' B';
    return (n / 1024).toFixed(1) + ' KB';
  }
  function pad(n){ return (n < 10 ? '0' : '') + n; }
  function time(ts){
    if (!ts) return '—';
    var d = new Date(ts);
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function left(ts){
    if (!ts) return '—';
    var ms = ts - Date.now();
    if (ms <= 0) return '已过期';
    var hours = Math.floor(ms / 3600000);
    if (hours < 1) return Math.max(1, Math.floor(ms / 60000)) + ' 分钟后';
    if (hours < 24) return hours + ' 小时后';
    return Math.floor(hours / 24) + ' 天后';
  }

  function previewOf(item){
    if (item.legacy) return '<span class="x-muted">旧记录，没有元数据</span>';
    if (!item.preview) return '<span class="x-muted">（空）</span>';
    return esc(item.preview) + (item.preview.length >= 60 ? '…' : '');
  }

  /* Markdown documents live under /md with their own keys and their own
   * revoke endpoint, but they belong in this one list — "my shared links"
   * is a single mental model, and two admin screens would mean one of them
   * gets forgotten. */
  /* Markdown lives under /md at the site root, not under this tool's
   * basePath, so its URLs must not be built from window.__BASE. */
  var MD_ROOT = '/md';
  function hrefOf(item){
    return item.kind === 'md' ? MD_ROOT + '/' + item.id : window.__BASE + '/' + item.id;
  }
  function kindBadge(item){
    return item.kind === 'md'
      ? '<span class="x-badge x-badge--accent" style="margin-right:6px">MD</span>'
      : '';
  }

  function render(items){
    if (!items.length){
      panel.innerHTML = '<p class="x-muted" style="margin-top:14px">当前没有未过期的链接。</p>';
      return;
    }

    var tableRows = items.map(function(item){
      return '<tr>' +
        '<td>' + kindBadge(item) + '<a href="' + esc(hrefOf(item)) + '" target="_blank" rel="noopener"><b>' + esc(item.id) + '</b></a>' +
          (item.burn ? ' <span class="x-badge x-badge--warn">阅后即焚</span>' : '') + '</td>' +
        '<td class="paste-nowrap">' + esc(time(item.createdAt)) + '</td>' +
        '<td class="paste-nowrap">' + esc(left(item.expiresAt)) + '<br><span class="x-muted" style="font-size:12px">' + esc(time(item.expiresAt)) + '</span></td>' +
        '<td class="paste-nowrap">' + esc(size(item.size)) + '</td>' +
        '<td>' + previewOf(item) + '</td>' +
        '<td style="text-align:right"><button type="button" class="x-btn x-btn--danger" data-revoke="' + esc(item.id) + '" data-kind="' + esc(item.kind || 'paste') + '">失效</button></td>' +
      '</tr>';
    }).join('');

    var cards = items.map(function(item){
      return '<div class="paste-item">' +
        '<div class="paste-item__top">' +
          '<a href="' + esc(hrefOf(item)) + '" target="_blank" rel="noopener">' + esc(item.id) + '</a>' +
          kindBadge(item) +
          (item.burn ? '<span class="x-badge x-badge--warn">阅后即焚</span>' : '') +
          '<button type="button" class="x-btn x-btn--danger paste-item__revoke" data-revoke="' + esc(item.id) + '" data-kind="' + esc(item.kind || 'paste') + '">失效</button>' +
        '</div>' +
        '<p class="paste-item__preview">' + previewOf(item) + '</p>' +
        '<p class="paste-item__meta">剩余 ' + esc(left(item.expiresAt)) + ' · ' + esc(size(item.size)) +
          (item.createdAt ? ' · 创建于 ' + esc(time(item.createdAt)) : '') + '</p>' +
      '</div>';
    }).join('');

    panel.innerHTML =
      '<div class="x-table-wrap paste-admin__table" style="margin-top:14px"><table class="x-table">' +
        '<thead><tr><th>链接</th><th>创建</th><th>剩余</th><th>大小</th><th>内容预览</th><th></th></tr></thead>' +
        '<tbody>' + tableRows + '</tbody></table></div>' +
      '<div class="paste-admin__list" style="margin-top:14px">' + cards + '</div>' +
      '<p class="x-muted" style="margin-top:10px;font-size:12.5px">共 ' + items.length + ' 条。点「失效」会立即删除，不可恢复。</p>';
  }

  function readJson(r){
    return r.json().then(function(data){ return { status: r.status, data: data }; });
  }

  function load(){
    var value = token.value.trim();
    error.textContent = '';
    if (!value) { error.textContent = '先填管理令牌'; return; }
    panel.innerHTML = '<p class="x-muted" style="margin-top:14px">读取中…</p>';

    var opts = { headers: { Authorization: 'Bearer ' + value }, cache: 'no-store' };
    Promise.all([
      fetch(window.__BASE + '/api/admin/pastes', opts).then(readJson),
      fetch(MD_ROOT + '/api/admin/md', opts).then(readJson)
    ]).then(function(results){
      for (var i = 0; i < results.length; i++){
        if (results[i].status === 401){
          panel.innerHTML = '';
          error.textContent = '令牌不对，或服务端没有配置 ADMIN。';
          sessionStorage.removeItem('xentool.admin');
          return;
        }
      }
      for (var j = 0; j < results.length; j++){
        if (results[j].status !== 200){
          panel.innerHTML = '';
          error.textContent = results[j].data.message || results[j].data.error || ('读取失败（' + results[j].status + '）');
          return;
        }
      }
      var items = [];
      results.forEach(function(res){ items = items.concat(res.data.items || []); });
      items.sort(function(a, b){ return (b.createdAt || 0) - (a.createdAt || 0); });
      sessionStorage.setItem('xentool.admin', value);
      render(items);
    }).catch(function(e){
      panel.innerHTML = '';
      error.textContent = '网络错误：' + e.message;
    });
  }

  function revoke(id, kind){
    if (!window.confirm('让 ' + id + ' 立刻失效？删除后无法恢复。')) return;
    var url = kind === 'md'
      ? MD_ROOT + '/api/admin/md/' + id
      : window.__BASE + '/api/admin/pastes/' + id;
    fetch(url, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token.value.trim() }
    }).then(function(r){
      if (r.ok) { load(); return; }
      return r.json().then(function(d){ error.textContent = d.message || d.error || '删除失败'; });
    }).catch(function(e){ error.textContent = '网络错误：' + e.message; });
  }

  panel.addEventListener('click', function(event){
    var button = event.target.closest('[data-revoke]');
    if (button) revoke(button.getAttribute('data-revoke'), button.getAttribute('data-kind'));
  });

  unlock.addEventListener('click', load);
  refresh.addEventListener('click', load);
  token.addEventListener('keydown', function(event){
    if (event.key === 'Enter') load();
  });

  var saved = sessionStorage.getItem('xentool.admin');
  if (saved) { token.value = saved; load(); }
})();
`;

  return page({
    title: "链接管理",
    lead: "未过期的 paste 和 markdown 文档都在这里，可以随时撤回。",
    body,
    style,
    script,
    basePath,
  });
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
