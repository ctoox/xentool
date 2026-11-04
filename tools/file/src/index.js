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
 *
 * R2 is the one binding here that bills instead of failing when the free
 * allowance runs out, so every upload is checked against the 60% cut-off in
 * quota.js before a byte is written.
 */
import {
  json,
  html,
  health,
  fail,
  notFound,
  createAuth,
  createBlobs,
  createQuota,
  quotaError,
} from "../../../packages/core/index.js";
import {
  page,
  card,
  btn,
  select,
  dropzone,
  copyLink,
  COPY_LINK_SCRIPT,
  notice,
  emptyState,
  stats,
  badge,
} from "../../../packages/ui/components.js";

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
  const quota = createQuota(env);
  const publicMode = String(env?.FILE_PUBLIC || "").toLowerCase() === "true";
  const method = request.method;

  if (method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-file");

  const allowed = publicMode || (await auth.authorized());

  if (path === "/" && method === "GET") {
    const available = blobs.backend === "r2";
    if (wantsHtml) {
      const usage = available ? await quota.snapshot("r2") : null;
      return html(
        renderPage({ basePath, available, gated: !publicMode, configured: auth.configured, usage }),
        available ? 200 : 503,
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
    return upload(request, blobs, host, basePath, url, quota, ctx);
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

    // A download is a Class B operation on R2; record it so the guard sees
    // read traffic too, not just the storage held.
    quota.bump("r2", { classB: 1 });
    const drain = quota.flush();
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(drain);

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

async function upload(request, blobs, host, basePath, url, quota, ctx) {
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

  // Storage is the dimension that starts billing, so it is checked before the
  // write rather than after. 507 is deliberately distinct from 429: this is a
  // capacity ceiling, not a rate limit, and retrying immediately will not help.
  const gate = await quota.guard("r2", { storageBytes: bytes.byteLength, classA: 1 });
  if (!gate.ok) return json({ ...quotaError(gate), tool: "file" }, 507, NO_STORE);

  const id = newId();
  const stored = await blobs.put(id, bytes, { contentType: mime, expiresIn: ttl, name });

  quota.bump("r2", { storageBytes: stored.size, classA: 1 });
  const drain = quota.flush();
  if (typeof ctx?.waitUntil === "function") ctx.waitUntil(drain);

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

const UPLOAD_SCRIPT = String.raw`
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
  var titleEl = drop.querySelector('[data-drop-title]');
  var hintEl = drop.querySelector('[data-drop-hint]');
  var selected = null;

  function choose(file){
    if (!file) return;
    selected = file;
    titleEl.textContent = file.name;
    if (hintEl) hintEl.textContent = (file.size / 1024).toFixed(1) + ' KB · 待上传';
    uploadBtn.disabled = false;
  }

  drop.addEventListener('click', function(){ picker.click(); });
  drop.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') picker.click(); });
  picker.addEventListener('change', function(){ choose(picker.files[0]); });

  ['dragenter','dragover'].forEach(function(name){
    drop.addEventListener(name, function(e){ e.preventDefault(); drop.classList.add('x-drop--hot'); });
  });
  ['dragleave','drop'].forEach(function(name){
    drop.addEventListener(name, function(e){ e.preventDefault(); drop.classList.remove('x-drop--hot'); });
  });
  drop.addEventListener('drop', function(e){
    if (e.dataTransfer && e.dataTransfer.files.length) choose(e.dataTransfer.files[0]);
  });

  uploadBtn.addEventListener('click', function(){
    if (!selected) return;
    errEl.textContent = '';
    uploadBtn.disabled = true;
    var label = uploadBtn.querySelector('span:last-child') || uploadBtn;
    label.textContent = '上传中…';

    var form = new FormData();
    form.append('file', selected);
    form.append('ttl', ttl.value);

    fetch(base + '/api', { method: 'POST', body: form }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      uploadBtn.disabled = false;
      label.textContent = '上传';
      if (!res.ok) {
        errEl.textContent = res.data.message || res.data.error || '上传失败';
        return;
      }
      urlInput.value = res.data.url;
      openLink.href = res.data.url;
      result.hidden = false;
      urlInput.select();
    }).catch(function(e){
      uploadBtn.disabled = false;
      label.textContent = '上传';
      errEl.textContent = '网络错误：' + e.message;
    });
  });
})();
`;

function renderPage({ basePath, available, gated, configured, usage }) {
  const banner = !available
    ? notice({
        tone: "warn",
        title: "R2 未绑定，文件功能不可用。",
        body: '需要在 wrangler.toml 中声明 [[r2_buckets]]，且 bucket 必须先创建。',
      })
    : gated && !configured
      ? notice({
          tone: "warn",
          title: "未配置 ADMIN，上传默认关闭。",
          body: "设置 npx wrangler secret put ADMIN，或显式设置 FILE_PUBLIC=true。",
        })
      : "";

  const quotaPanel = usage
    ? `<div style="margin-top:20px">
${stats([
  { value: fmtPct(usage.ratio), label: "R2 用量", hint: `${fmtGB(usage.used.storageBytes)} / ${fmtGB(usage.limits.storageBytes)}` },
  { value: fmtPct(usage.fields?.classA?.ratio || 0), label: "Class A", hint: "写入操作" },
  { value: fmtPct(usage.fields?.classB?.ratio || 0), label: "Class B", hint: "读取操作" },
])}
</div>`
    : "";

  const body = `
${banner}
${card({
  title: "上传文件",
  sub: `存放在 Cloudflare R2，到期自动清理。单文件上限 ${Math.round(MAX_BYTES / 1024 / 1024)} MB。`,
  body: `
    ${dropzone({ hint: "支持任意类型 · 默认保存 1 天" })}
    <div class="x-row" style="margin-top:14px">
      ${select({ label: "有效期", id: "ttl", options: TTL_OPTIONS, value: DEFAULT_TTL })}
      ${btn({ label: "上传", variant: "primary", attrs: { id: "upload", disabled: true } })}
    </div>
    ${copyLink({ label: "链接已生成" })}
    <p class="error" id="error" style="margin-top:10px"></p>
  `,
})}
${quotaPanel}
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "免费额度保护已开启。",
  body: "R2 存储超过免费额度的 60% 时会直接拒绝上传，避免产生账单；被拒绝的请求返回 507，重试无效。",
})}
</div>`;

  return page({
    title: "文件分享",
    lead: "上传即得链接，到期自动清理。超出免费额度 60% 自动熔断。",
    body,
    actions: available ? badge({ text: "R2", tone: "accent" }) : badge({ text: "未配置", tone: "off" }),
    script: UPLOAD_SCRIPT + COPY_LINK_SCRIPT,
    basePath,
  });
}

function renderMissing({ basePath }) {
  const body = emptyState({
    icon: "inbox",
    title: "文件不存在或已过期",
    desc: "链接可能已到期，或被上传者手动删除。",
    action: btn({ label: "上传新文件", href: `${basePath}/`, variant: "primary" }),
  });
  return page({ title: "文件分享", lead: "", body, basePath });
}

function fmtGB(bytes) {
  return `${((Number(bytes) || 0) / 1024 ** 3).toFixed(1)} GB`;
}

function fmtPct(ratio) {
  const pct = Math.round((Number(ratio) || 0) * 100);
  return `${pct}%`;
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
