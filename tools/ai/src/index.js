/**
 * AI tool — Workers AI on the edge (summary / translation / embeddings).
 *
 *   GET  /ai/                    UI (browser) or capability JSON
 *   POST /ai/api/summary         {"text":"…","style":"brief|bullets|outline"}
 *   POST /ai/api/translate       {"text":"…","source":"zh","target":"en"}
 *   POST /ai/api/embed           {"text":"…"}
 *   POST /ai/api/similar         {"text":"…","candidates":["…"]}
 *
 * Inference costs money per token, so every POST is admin-gated unless the
 * deployment explicitly sets `AI_PUBLIC=true`. Fail-closed is the default:
 * without ADMIN bound, nothing runs. This mirrors the short-link console.
 */
import {
  json,
  html,
  health,
  fail,
  notFound,
  createAuth,
  createAI,
  AIUnavailable,
  cosine,
} from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const MAX_CHARS = 12000;
const MAX_TOKENS = 700;
const NO_STORE = { "Cache-Control": "no-store" };

const STYLES = {
  brief: "用一段话概括，不超过 120 字，只保留结论与关键数字。",
  bullets: "提炼要点，输出 3-6 条短句，每条一行，以 - 开头。",
  outline: "输出结构化提纲，两级标题，保留原文的论证顺序。",
};

const LANGS = ["zh", "en", "ja", "ko", "fr", "de", "es", "ru"];

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const ai = createAI(env);

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-ai");

  const auth = createAuth(request, env, { cookieName: "xt_ai" });
  const publicMode = String(env?.AI_PUBLIC || "").toLowerCase() === "true";
  const allowed = publicMode || (await auth.authorized());

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return html(
        renderPage({ basePath, available: ai.available, gated: !publicMode, configured: auth.configured }),
        ai.available ? 200 : 503,
        NO_STORE,
      );
    }
    return json(
      {
        tool: "ai",
        available: ai.available,
        models: ai.models,
        access: publicMode ? "public" : auth.configured ? "admin" : "unset",
        limits: { maxChars: MAX_CHARS, maxTokens: MAX_TOKENS },
        usage: {
          summary: `POST ${basePath}/api/summary  {"text":"…","style":"brief"}`,
          translate: `POST ${basePath}/api/translate  {"text":"…","source":"zh","target":"en"}`,
          embed: `POST ${basePath}/api/embed  {"text":"…"}`,
          similar: `POST ${basePath}/api/similar  {"text":"…","candidates":["…"]}`,
        },
      },
      200,
      NO_STORE,
    );
  }

  if (path.startsWith("/api/") && request.method === "POST") {
    if (!ai.available) {
      return fail("Workers AI binding is not configured (add [ai] binding = \"AI\" to wrangler.toml)", 503);
    }
    if (!allowed) {
      return json(
        { error: "unauthorized", hint: "Authorization: Bearer <ADMIN>, or set AI_PUBLIC=true" },
        401,
        NO_STORE,
      );
    }

    const payload = await readJson(request);
    if (!payload) return fail("invalid JSON body", 400);
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) return fail("text is required", 400);
    if (text.length > MAX_CHARS) return fail(`text must be at most ${MAX_CHARS} characters`, 413);

    try {
      if (path === "/api/summary") return await summary(ai, text, payload.style);
      if (path === "/api/translate") return await translate(ai, text, payload);
      if (path === "/api/embed") return await embed(ai, text);
      if (path === "/api/similar") return await similar(ai, text, payload.candidates);
    } catch (error) {
      if (error instanceof AIUnavailable) return fail("Workers AI binding is not configured", 503);
      return fail(`模型调用失败：${error.message}`, 502);
    }
    return notFound();
  }

  return wantsHtml
    ? html(renderPage({ basePath, available: ai.available, gated: !publicMode, configured: auth.configured }), 404, NO_STORE)
    : notFound();
}

async function summary(ai, text, styleKey) {
  const style = STYLES[styleKey] || STYLES.brief;
  const output = await ai.chat({
    system: `你是一个精确的文本编辑。${style}不要编造原文没有的信息。输出中文，除非原文是英文。`,
    prompt: text,
    maxTokens: MAX_TOKENS,
  });
  return json({ summary: output, style: styleKey in STYLES ? styleKey : "brief", model: ai.models.chat }, 200, NO_STORE);
}

async function translate(ai, text, payload) {
  const source = LANGS.includes(payload.source) ? payload.source : "zh";
  const target = LANGS.includes(payload.target) ? payload.target : "en";
  if (source === target) return fail("source and target must differ", 400);

  const output = await ai.translate({ text, source, target });
  if (!output) return fail("模型没有返回译文，可能是语种组合不支持", 502);
  return json({ translation: output, source, target, model: ai.models.translate }, 200, NO_STORE);
}

async function embed(ai, text) {
  const vector = await ai.embed(text);
  return json(
    {
      dimensions: vector.length,
      model: ai.models.embed,
      // The full vector is only useful for copy-paste; keep the payload small
      // by returning the head plus a checksum-ish length.
      preview: vector.slice(0, 8).map((value) => Number(value.toFixed(5))),
      vector,
    },
    200,
    NO_STORE,
  );
}

async function similar(ai, text, candidates) {
  if (!Array.isArray(candidates) || !candidates.length) return fail("candidates must be a non-empty array", 400);
  if (candidates.length > 50) return fail("at most 50 candidates", 400);

  const query = await ai.embed(text);
  const scored = [];
  for (let i = 0; i < candidates.length; i++) {
    const candidate = String(candidates[i] || "").slice(0, MAX_CHARS);
    if (!candidate) continue;
    const vector = await ai.embed(candidate);
    scored.push({ index: i, score: Number(cosine(query, vector).toFixed(4)), text: candidate.slice(0, 120) });
  }
  scored.sort((a, b) => b.score - a.score);
  return json({ model: ai.models.embed, results: scored }, 200, NO_STORE);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------- UI */

const AI_CSS = String.raw`
.tabs{display:flex;gap:6px;margin:0 0 20px;flex-wrap:wrap}
.tab{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--dim);padding:8px 14px;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit}
.tab.on{color:var(--ink);border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.10)}
.notice{padding:12px 14px;border:1px solid rgba(244,114,182,.3);border-radius:10px;background:rgba(244,114,182,.07);color:#f0a6c8;font-size:13px;margin:0 0 18px}
.out{min-height:120px}
`;

function renderPage({ basePath, available, gated, configured }) {
  const notice = !available
    ? `<div class="notice">Workers AI 绑定未配置。在 wrangler.toml 中加上 <code>[ai] binding = "AI"</code> 后重新部署即可启用。</div>`
    : gated && !configured
      ? `<div class="notice">未配置 ADMIN，AI 接口默认关闭。设置 <code>npx wrangler secret put ADMIN</code>，或显式设置 <code>AI_PUBLIC=true</code> 开放。</div>`
      : "";

  const body = `
<h1>AI 工具</h1>
<p class="lead">摘要、翻译、向量与相似度，全部在 Cloudflare 边缘推理。模型：Llama 3.1 8B / m2m100 / BGE-M3。</p>
${notice}
<div class="tabs" id="tabs">
  <button class="tab on" type="button" data-tab="summary">摘要</button>
  <button class="tab" type="button" data-tab="translate">翻译</button>
  <button class="tab" type="button" data-tab="embed">向量</button>
</div>

<div id="view-summary">
  <div class="editor"><textarea id="summary-text" placeholder="粘贴需要摘要的文本…" spellcheck="false"></textarea></div>
  <div class="bar" style="display:flex;gap:10px;padding:12px 0;flex-wrap:wrap">
    <select id="summary-style">
      <option value="brief">一段话</option>
      <option value="bullets">要点列表</option>
      <option value="outline">结构化提纲</option>
    </select>
    <span class="spacer"></span>
    <button class="btn primary" type="button" id="summary-run">生成摘要</button>
  </div>
  <pre class="out" id="summary-out"></pre>
</div>

<div id="view-translate" hidden>
  <div class="editor"><textarea id="translate-text" placeholder="粘贴需要翻译的文本…" spellcheck="false"></textarea></div>
  <div class="bar" style="display:flex;gap:10px;padding:12px 0;flex-wrap:wrap">
    <select id="translate-source"><option value="zh">中文</option><option value="en">英文</option><option value="ja">日文</option></select>
    <span>→</span>
    <select id="translate-target"><option value="en">英文</option><option value="zh">中文</option><option value="ja">日文</option></select>
    <span class="spacer"></span>
    <button class="btn primary" type="button" id="translate-run">翻译</button>
  </div>
  <pre class="out" id="translate-out"></pre>
</div>

<div id="view-embed" hidden>
  <div class="editor"><textarea id="embed-text" placeholder="输入一段文本，得到 1024 维向量…" spellcheck="false"></textarea></div>
  <div class="bar" style="display:flex;gap:10px;padding:12px 0">
    <span class="spacer"></span>
    <button class="btn primary" type="button" id="embed-run">计算向量</button>
  </div>
  <pre class="out" id="embed-out"></pre>
</div>

<p class="error" id="ai-error"></p>`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var errEl = document.getElementById('ai-error');

  var tabs = document.getElementById('tabs');
  tabs.addEventListener('click', function(e){
    var btn = e.target.closest('[data-tab]');
    if (!btn) return;
    var name = btn.getAttribute('data-tab');
    var all = tabs.querySelectorAll('[data-tab]');
    for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i] === btn);
    ['summary','translate','embed'].forEach(function(key){
      document.getElementById('view-' + key).hidden = key !== name;
    });
  });

  function post(path, body){
    errEl.textContent = '';
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).catch(function(e){
      return { ok: false, data: { error: '网络错误：' + e.message } };
    });
  }

  function run(btn, out, path, body, render){
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '处理中…';
    out.textContent = '';
    post(path, body).then(function(res){
      btn.disabled = false;
      btn.textContent = label;
      if (!res.ok) { errEl.textContent = res.data.error || '请求失败'; return; }
      out.textContent = render(res.data);
    });
  }

  document.getElementById('summary-run').addEventListener('click', function(){
    var text = document.getElementById('summary-text').value;
    if (!text) { errEl.textContent = '请输入文本'; return; }
    run(this, document.getElementById('summary-out'), '/api/summary',
      { text: text, style: document.getElementById('summary-style').value },
      function(d){ return d.summary; });
  });

  document.getElementById('translate-run').addEventListener('click', function(){
    var text = document.getElementById('translate-text').value;
    if (!text) { errEl.textContent = '请输入文本'; return; }
    run(this, document.getElementById('translate-out'), '/api/translate',
      { text: text, source: document.getElementById('translate-source').value, target: document.getElementById('translate-target').value },
      function(d){ return d.translation; });
  });

  document.getElementById('embed-run').addEventListener('click', function(){
    var text = document.getElementById('embed-text').value;
    if (!text) { errEl.textContent = '请输入文本'; return; }
    run(this, document.getElementById('embed-out'), '/api/embed',
      { text: text },
      function(d){
        return '维度  ' + d.dimensions + '\n模型  ' + d.model + '\n前 8  ' + d.preview.join(', ');
      });
  });
})();
`;

  return shell({ title: "AI 工具", body, basePath, script, style: AI_CSS });
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
