/**
 * File share tool — R2-backed temporary file links.
 *
 *   GET    /file/                upload page (browser) or capability JSON
 *   POST   /file/api             multipart (field "file") or a raw body
 *   GET    /file/<id>            download; ?download=1 forces an attachment
 *   GET    /file/api             list stored objects                       (admin)
 *   DELETE /file/api/<id>        delete one object                          (admin)
 *
 * R2 has no TTL, so expiry rides in customMetadata and is enforced on read and
 * by the cron sweep. Uploading is admin-gated by default for the same reason
 * as AI: storage and egress are billed. `FILE_PUBLIC=true` opens it up.
 */
import {
  json,
  html,
  health,
  fail,
  notFound,
  createAuth,
  createBlobs,
} from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const MAX_BYTES = 25 * 1024 * 1024;
const MIN_TTL = 300;
const MAX_TTL = 30 * 24 * 3600;
const DEFAULT_TTL = 24 * 3600;
const ID_PATTERN = /^[a-z0-9]{8,16}$/;
const NO_STORE = { "Cache-Control": "no-store" };

const TTL_OPTIONS = [
  { label: "1 小时", value: 3600 },
  { label: "1 天", value: 86400 },
  { label: "7 天", value: 7 * 86400 },
  { label: "30 天", value: MAX_TTL },
];

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const host = ctx.host ?? url.hostname;
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const blobs = createBlobs(env, "file");
  const auth = createAuth(request, env, { cookieName: "xt_file" });
  const publicMode = String(env?.FILE_PUBLIC || "").toLowerCase() === "true";
  const method = request.method;

  if (method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-file");

  const allowed = publicMode || (await auth.authorized());

  if (path === "/" && method === "GET") {
    if (wantsHtml) {
      return html(
        renderPage({ basePath, available: blobs.backend === "r2", gated: !publicMode, configured: auth.configured }),
        blobs.backend === "r2" ? 200 : 503,
        NO_STORE,
      );
    }
    return json(
      {
        tool: "file",
        storage: blobs.backend,
        durable: blobs.backend === "r2",
        available: blobs.backend === "r2",
        access: publicMode ? "public" : auth.configured ? "admin" : "unset",
        limits: { maxBytes: MAX_BYTES, minTtl: MIN_TTL, maxTtl: MAX_TTL, defaultTtl: DEFAULT_TTL },
        usage: {
          upload: `POST ${basePath}/api  multipart field "file", or raw body with ?name=&ttl=`,
          read: `GET ${basePath}/<id>`,
          list: `GET ${basePath}/api  (admin)`,
          remove: `DELETE ${basePath}/api/<id>  (admin)`,
        },
      },
      200,
      NO_STORE,
    );
  }

  if (path === "/api" && method === "POST") {
    if (blobs.backend !== "r2") {
      return fail("R2 binding is not configured (add [[r2_buckets]] with binding = \"R2\" to wrangler.toml)", 503);
    }
    if (!allowed) return unauthorized("upload");
    return upload(request, blobs, host, basePath, url);
  }

  if (path === "/api" && method === "GET") {
    if (!allowed) return unauthorized("list");
    const objects = await blobs.list({ limit: 100 });
    return json(
      {
        count: objects.length,
        storage: blobs.backend,
        files: objects.map((object) => ({
          id: object.id,
          name: object.name,
          size: object.size,
          expiresAt: object.expiresAt,
          url: `https://${host}${basePath}/${object.id}`,
        })),
      },
      200,
      NO_STORE,
    );
  }

  if (path.startsWith("/api/") && method === "DELETE") {
    if (!allowed) return unauthorized("delete");
    const id = path.slice("/api/".length);
    if (!ID_PATTERN.test(id)) return fail("invalid id", 400);
    await blobs.delete(id);
    return json({ deleted: true, id }, 200, NO_STORE);
  }

  const id = path.slice(1);
  if (method === "GET" && ID_PATTERN.test(id)) {
    const object = await blobs.get(id);
    if (!object) {
      return wantsHtml ? html(renderMissing({ basePath }), 404, NO_STORE) : notFound("File not found or expired");
    }

    const disposition = url.searchParams.has("download") ? "attachment" : "inline";
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.size),
        "Content-Disposition": `${disposition}; filename="${sanitizeFilename(object.name || id)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return wantsHtml ? html(renderMissing({ basePath }), 404, NO_STORE) : notFound();
}

function unauthorized(action) {
  return json(
    { error: "unauthorized", action, hint: "Authorization: Bearer <ADMIN>, or set FILE_PUBLIC=true" },
    401,
    NO_STORE,
  );
}

async function upload(request, blobs, host, basePath, url) {
  const contentType = request.headers.get("content-type") || "";
  let bytes;
  let name = url.searchParams.get("name") || "";
  let mime = "application/octet-stream";
  let ttl = DEFAULT_TTL;

  const rawTtl = Number(url.searchParams.get("ttl"));
  if (Number.isInteger(rawTtl) && rawTtl >= MIN_TTL && rawTtl <= MAX_TTL) ttl = rawTtl;

  if (contentType.includes("multipart/form-data")) {
    let form;
    try {
      form = await request.formData();
    } catch {
      return fail("malformed multipart body", 400);
    }
    const file = form.get("file");
    if (!file || typeof file === "string") return fail('multipart field "file" is required', 400);
    bytes = new Uint8Array(await file.arrayBuffer());
    name = name || file.name || "";
    mime = file.type || mime;

    const formTtl = Number(form.get("ttl"));
    if (Number.isInteger(formTtl) && formTtl >= MIN_TTL && formTtl <= MAX_TTL) ttl = formTtl;
  } else {
    const buffer = await request.arrayBuffer();
    bytes = new Uint8Array(buffer);
    mime = contentType.split(";")[0] || mime;
  }

  if (!bytes.byteLength) return fail("file is empty", 400);
  if (bytes.byteLength > MAX_BYTES) return fail(`file must be at most ${MAX_BYTES} bytes`, 413);

  const id = newId();
  const stored = await blobs.put(id, bytes, { contentType: mime, expiresIn: ttl, name });

  return json(
    {
      id,
      url: `https://${host}${basePath}/${id}`,
      name: sanitizeFilename(name || id),
      size: stored.size,
      contentType: mime,
      expiresIn: ttl,
      storage: blobs.backend,
    },
    201,
    NO_STORE,
  );
}

function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

/** Header values cannot carry quotes or control characters. */
function sanitizeFilename(name) {
  return String(name)
    .replace(/[\r\n"]/g, "")
    .replace(/[^\w.\-() ]+/g, "_")
    .slice(0, 120) || "download";
}

/* ---------------------------------------------------------------------- UI */

const FILE_CSS = String.raw`
.drop{border:1.5px dashed rgba(148,163,184,.35);border-radius:14px;padding:44px 20px;text-align:center;transition:border-color .18s,background .18s;cursor:pointer}
.drop.hot{border-color:rgba(34,211,238,.6);background:rgba(34,211,238,.06)}
.drop p{margin:6px 0;color:var(--dim);font-size:13px}
.drop b{color:var(--ink)}
.notice{padding:12px 14px;border:1px solid rgba(244,114,182,.3);border-radius:10px;background:rgba(244,114,182,.07);color:#f0a6c8;font-size:13px;margin:0 0 18px}
.bar{display:flex;gap:10px;padding:12px 0;flex-wrap:wrap;align-items:center}
`;

function renderPage({ basePath, available, gated, configured }) {
  const notice = !available
    ? `<div class="notice">R2 未绑定，文件功能不可用。需要在 wrangler.toml 中声明 <code>[[r2_buckets]]</code>，且 bucket 必须先创建。</div>`
    : gated && !configured
      ? `<div class="notice">未配置 ADMIN，上传默认关闭。设置 <code>npx wrangler secret put ADMIN</code>，或显式设置 <code>FILE_PUBLIC=true</code>。</div>`
      : "";

  const options = TTL_OPTIONS.map(
    (opt) => `<option value="${opt.value}"${opt.value === DEFAULT_TTL ? " selected" : ""}>${opt.label}</option>`,
  ).join("");

  const body = `
<h1>文件分享</h1>
<p class="lead">上传即得链接，存放在 Cloudflare R2，到期自动清理。单文件上限 25 MB。</p>
${notice}
<div class="drop" id="drop">
  <p><b>点击选择文件</b>，或把文件拖到这里</p>
  <p>支持任意类型 · 默认保存 1 天</p>
  <input type="file" id="picker" hidden>
</div>
<div class="bar">
  <select id="ttl" aria-label="有效期">${options}</select>
  <span class="spacer" style="flex:1"></span>
  <button class="btn primary" type="button" id="upload" disabled>上传</button>
</div>
<div class="result" id="result" hidden>
  <div class="label">链接已生成</div>
  <div class="linkrow">
    <input id="url" readonly>
    <button class="btn" id="copy" type="button">复制</button>
    <a class="btn" id="open" href="#" target="_blank" rel="noopener">打开</a>
  </div>
</div>
<p class="error" id="error"></p>`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var drop = document.getElementById('drop');
  var picker = document.getElementById('picker');
  var uploadBtn = document.getElementById('upload');
  var ttl = document.getElementById('ttl');
  var result = document.getElementById('result');
  var urlInput = document.getElementById('url');
  var openLink = document.getElementById('open');
  var errEl = document.getElementById('error');
  var selected = null;

  function choose(file){
    if (!file) return;
    selected = file;
    drop.querySelector('b').textContent = file.name;
    drop.querySelectorAll('p')[1].textContent = (file.size / 1024).toFixed(1) + ' KB · 待上传';
    uploadBtn.disabled = false;
  }

  drop.addEventListener('click', function(){ picker.click(); });
  picker.addEventListener('change', function(){ choose(picker.files[0]); });

  ['dragenter','dragover'].forEach(function(name){
    drop.addEventListener(name, function(e){ e.preventDefault(); drop.classList.add('hot'); });
  });
  ['dragleave','drop'].forEach(function(name){
    drop.addEventListener(name, function(e){ e.preventDefault(); drop.classList.remove('hot'); });
  });
  drop.addEventListener('drop', function(e){
    if (e.dataTransfer && e.dataTransfer.files.length) choose(e.dataTransfer.files[0]);
  });

  uploadBtn.addEventListener('click', function(){
    if (!selected) return;
    errEl.textContent = '';
    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中…';

    var form = new FormData();
    form.append('file', selected);
    form.append('ttl', ttl.value);

    fetch(base + '/api', { method: 'POST', body: form }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      uploadBtn.disabled = false;
      uploadBtn.textContent = '上传';
      if (!res.ok) { errEl.textContent = res.data.error || '上传失败'; return; }
      urlInput.value = res.data.url;
      openLink.href = res.data.url;
      result.hidden = false;
      urlInput.select();
    }).catch(function(e){
      uploadBtn.disabled = false;
      uploadBtn.textContent = '上传';
      errEl.textContent = '网络错误：' + e.message;
    });
  });

  document.getElementById('copy').addEventListener('click', function(){
    if (!urlInput.value) return;
    var btn = this;
    navigator.clipboard.writeText(urlInput.value).then(function(){
      btn.textContent = '已复制';
      setTimeout(function(){ btn.textContent = '复制'; }, 1200);
    });
  });
})();
`;

  return shell({ title: "文件分享", body, basePath, script, style: FILE_CSS });
}

function renderMissing({ basePath }) {
  const body = `
<div class="empty">
  <h2>文件不存在或已过期</h2>
  <p>链接可能已到期，或被上传者手动删除。</p>
  <p><a class="btn" href="${escapeHtml(basePath)}/">上传新文件</a></p>
</div>`;
  return shell({ title: "文件分享", body, basePath, script: "" });
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
