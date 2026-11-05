/**
 * Markdown — a paste that renders.
 *
 *   GET  /              editor with a live preview (client-side render)
 *   POST /api/md        create, returns { id, url }
 *   GET  /<id>          rendered document (server-side render)
 *   GET  /<id>?raw=1    the source, as plain text
 *   GET  /api/admin/md  list (Bearer $ADMIN)
 *   DEL  /api/admin/md/<id>  revoke
 *
 * Why this is a separate namespace instead of `?md=1` on /paste: the link is
 * the whole product here, and a recipient who has to remember a query
 * parameter will not. Sniffing the content instead is worse — `# TODO` and a
 * commented-out shell script both look like headings, and /paste holds far
 * more code than prose.
 *
 * Two hard rules shape the renderer:
 *   - the source is always reachable (`?raw=1`), so a shared document is never
 *     a one-way door
 *   - no raw HTML is ever honoured (see toolkit-core/markdown.js)
 *
 * Burn-after-reading is deliberately not offered. The page has a "source"
 * toggle; with burn on, a reader clicking it would destroy the document they
 * were about to read.
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
  copyLink,
  COPY_LINK_SCRIPT,
  notice,
  emptyState,
  badge,
} from "../../../packages/ui/components.js";
import { markdownDocument, markdownTitle } from "../../../src/toolkit-core/markdown.js";

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const host = ctx.host ?? url.hostname;
  const basePath = ctx.basePath ?? "";
  const store = createStore(env, "md");
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-md");

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return html(renderEditor({ basePath, durable: store.backend === "kv" }), 200, {
        "Cache-Control": "public, max-age=60",
      });
    }
    return json({
      tool: "md",
      storage: store.backend,
      durable: store.backend === "kv",
      limits: { maxBytes: MAX_BYTES, ttls: TTL_OPTIONS.map((option) => option.value) },
      usage: {
        create: `POST ${basePath}/api/md  ({"content":"# hi","ttl":604800})`,
        read: `GET ${basePath}/<id>  (?raw=1 for the source)`,
      },
    });
  }

  if (path === "/api/md" && request.method === "POST") {
    return create(request, store, host, basePath);
  }

  if (path === "/api/admin/md" && request.method === "GET") {
    if (!isAdmin(request, env)) return fail("unauthorized", 401);
    const items = await listRecords(store, "md");
    return json({ ok: true, count: items.length, items }, 200, NO_STORE);
  }

  if (path.startsWith("/api/admin/md/") && request.method === "DELETE") {
    if (!isAdmin(request, env)) return fail("unauthorized", 401);
    const revokeId = path.slice("/api/admin/md/".length);
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
        : notFound("Document not found or expired");
    }
    if (wantsHtml && !url.searchParams.has("raw")) {
      return html(renderDocumentPage({ id, record, basePath }), 200, NO_STORE);
    }
    return text(record.content, 200, NO_STORE);
  }

  return wantsHtml ? html(renderMissingPage({ basePath }), 404, NO_STORE) : notFound();
}

async function create(request, store, host, basePath) {
  // `allowBurn: false` — see the header comment: burn plus a source toggle is
  // a way for a reader to delete the document by trying to read it properly.
  const parsed = await parseCreate(request, { allowBurn: false });
  if (!parsed.ok) return fail(parsed.message, parsed.status);

  const { id } = await saveRecord(store, {
    content: parsed.content,
    ttl: parsed.ttl,
    burn: false,
    size: parsed.size,
    title: markdownTitle(parsed.content, ""),
  });

  return json(
    {
      id,
      url: shareUrl({ host, basePath, id }),
      title: markdownTitle(parsed.content, ""),
      expiresIn: parsed.ttl,
      storage: store.backend,
    },
    201,
    NO_STORE,
  );
}

/* ---------------------------------------------------------------------- UI */

const EDITOR_STYLE = `
.md-editor{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch}
.md-editor__pane{display:flex;flex-direction:column;min-width:0}
.md-editor__label{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--dim);margin-bottom:7px}
/* font-size comes from --field-fs-mono, not a hardcoded value: iOS zooms the
   page on focus below 16px and never zooms back out. */
.md-editor__source .x-textarea{min-height:400px;flex:1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--field-fs-mono);line-height:1.7;resize:vertical}
.md-editor__preview{min-height:400px;max-height:70vh;overflow-y:auto;padding:18px 20px;border:1px solid var(--line);border-radius:var(--r);background:rgba(0,0,0,.18)}
.md-editor__hint{color:var(--dim);font-size:13px;margin:0}
@media (max-width:900px){
  .md-editor{grid-template-columns:1fr}
  .md-editor__source .x-textarea{min-height:220px}
  .md-editor__preview{min-height:200px;max-height:50vh}
}
`;

function renderEditor({ basePath, durable }) {
  // The admin panel is a single screen covering both link kinds, and it lives
  // under /paste. When this worker runs on its own host later there is no
  // panel to point at, so the link is only rendered for the path-mounted case.
  const adminLink = basePath
    ? `<div class="x-row" style="margin-top:14px">
  ${btn({ label: "管理已发布的文档", href: "/paste/admin", variant: "ghost" })}
  <span class="x-muted" style="font-size:12.5px">和 paste 共用同一个管理面板，可以让未到期的文档立刻失效。</span>
</div>`
    : "";

  const body = `
${card({
  title: "写 Markdown",
  sub: "左边写，右边实时渲染。发布后得到一个直接显示排版效果的短链，源码始终通过 ?raw=1 可取。",
  body: `
    <div class="md-editor">
      <div class="md-editor__pane md-editor__source">
        <span class="md-editor__label">源码</span>
        <textarea class="x-textarea" id="content" spellcheck="false" placeholder="# 标题&#10;&#10;正文，支持 **粗体**、*斜体*、\`行内代码\`、[链接](https://xen.autos)。&#10;&#10;- 列表&#10;- [x] 任务&#10;&#10;\`\`\`js&#10;console.log('fenced code');&#10;\`\`\`&#10;&#10;| 列 | 列 |&#10;|:--|--:|&#10;| a | 1 |&#10;&#10;> 引用"></textarea>
      </div>
      <div class="md-editor__pane">
        <span class="md-editor__label">预览</span>
        <div class="md-editor__preview md" id="preview"><p class="md-editor__hint">在左边输入，这里会实时渲染。</p></div>
      </div>
    </div>
    <div class="x-row" style="margin-top:14px">
      ${select({ label: "过期时间", id: "ttl", options: TTL_OPTIONS, value: TTL_OPTIONS[2].value })}
      <span class="x-toolbar__spacer"></span>
      ${btn({ label: "发布", variant: "primary", attrs: { id: "create" } })}
    </div>
    ${copyLink({ label: "链接已生成" })}
    <p class="error" id="error" style="margin-top:10px"></p>
    <p class="x-muted" id="count" style="font-size:12.5px;margin:10px 0 0">0 字符</p>
  `,
  foot: `存储 backend：${durable ? "kv（持久）" : "memory（不持久，仅测试）"}`,
})}
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "文档里不会执行任何 HTML。",
  body: "原始标签一律按文字显示，链接只放行 http、https、mailto 和页内锚点。图片会以你自己的 IP 向图床发请求，介意的话用链接代替。",
})}
</div>
${adminLink}`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var content = document.getElementById('content');
  var preview = document.getElementById('preview');
  var count = document.getElementById('count');
  var ttl = document.getElementById('ttl');
  var create = document.getElementById('create');
  var result = document.getElementById('result');
  var urlInput = document.getElementById('url');
  var openLink = document.getElementById('open');
  var errEl = document.getElementById('error');
  var label = create.querySelector('span:last-child') || create;
  var paint = null;
  var timer = null;

  // /core/ is served from the site root, not from this tool's basePath.
  import('/core/markdown.js').then(function(mod){
    paint = function(){
      preview.innerHTML = mod.markdownToHtml(content.value, { headingOffset: 1 });
      if (!content.value.trim()){
        preview.innerHTML = '<p class="md-editor__hint">在左边输入，这里会实时渲染。</p>';
      }
    };
    paint();
  }).catch(function(e){
    var p = document.createElement('p');
    p.className = 'x-muted';
    p.textContent = '预览模块加载失败：' + e.message;
    preview.textContent = '';
    preview.appendChild(p);
  });

  function schedule(){
    var bytes = new TextEncoder().encode(content.value).length;
    count.textContent = content.value.length + ' 字符 · ' + Math.ceil(bytes / 1024) + ' KB';
    if (timer) clearTimeout(timer);
    timer = setTimeout(function(){ if (paint) paint(); }, 140);
  }
  content.addEventListener('input', schedule);
  schedule();

  create.addEventListener('click', function(){
    if (!content.value.trim()) { errEl.textContent = '内容不能为空'; return; }
    errEl.textContent = '';
    create.disabled = true;
    label.textContent = '发布中…';
    fetch(base + '/api/md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.value, ttl: parseInt(ttl.value, 10) })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      create.disabled = false;
      label.textContent = '发布';
      if (!res.ok) { errEl.textContent = res.data.message || res.data.error || '发布失败'; return; }
      urlInput.value = res.data.url;
      openLink.href = base + '/' + res.data.id;
      result.hidden = false;
      urlInput.select();
    }).catch(function(e){
      create.disabled = false;
      label.textContent = '发布';
      errEl.textContent = '网络错误：' + e.message;
    });
  });
})();
`;

  return page({
    title: "Markdown",
    lead: "写 markdown，得到一个正常显示排版效果的链接。",
    body,
    style: EDITOR_STYLE,
    actions: durable ? badge({ text: "KV 持久", tone: "accent" }) : badge({ text: "内存（不持久）", tone: "warn" }),
    script: script + COPY_LINK_SCRIPT,
    basePath,
  });
}

function renderDocumentPage({ id, record, basePath }) {
  // The document hands its own `# heading` to the page as the h1, so the body
  // below starts below it instead of repeating the same words twice.
  const { title, html: rendered } = markdownDocument(record.content);
  const created = record.createdAt
    ? new Date(record.createdAt).toISOString().slice(0, 10)
    : "";

  const body = `
<article class="md">${rendered}</article>
<div class="x-row" style="margin-top:28px;padding-top:18px;border-top:1px solid var(--line)">
  ${btn({ label: "复制链接", variant: "primary", attrs: { id: "copy" } })}
  ${btn({ label: "看源码", href: `${basePath}/${id}?raw=1`, variant: "ghost" })}
  ${btn({ label: "新写一篇", href: `${basePath}/`, variant: "ghost" })}
</div>
<p class="x-muted" style="font-size:12.5px;margin:12px 0 0">
  ${escapeHtml(id)}${created ? ` · 创建于 ${escapeHtml(created)}` : ""} · 到期自动删除
</p>`;

  const script = String.raw`
(function(){
  var btn = document.getElementById('copy');
  var label = btn.querySelector('span:last-child') || btn;
  btn.addEventListener('click', function(){
    var url = location.origin + location.pathname;
    navigator.clipboard.writeText(url).then(function(){
      label.textContent = '已复制';
      setTimeout(function(){ label.textContent = '复制链接'; }, 1200);
    });
  });
})();
`;

  return page({ title, lead: "", body, script, basePath });
}

function renderMissingPage({ basePath }) {
  const body = emptyState({
    icon: "inbox",
    title: "文档不存在或已过期",
    desc: "链接可能已到期，或已被管理员失效。",
    action: btn({ label: "写一篇新的", href: `${basePath}/`, variant: "primary" }),
  });
  return page({ title: "Markdown", lead: "", body, basePath });
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return handle(request, env, { path: url.pathname, basePath: "", host: url.hostname });
  },
};
