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
import { page, card, btn, select, tabs, badge, notice } from "../../../packages/ui/components.js";

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

const AI_SCRIPT = String.raw`
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
    var label = btn.querySelector('span:last-child') || btn;
    var text = label.textContent;
    btn.disabled = true;
    label.textContent = '处理中…';
    out.textContent = '';
    post(path, body).then(function(res){
      btn.disabled = false;
      label.textContent = text;
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

const LANG_LABELS = { zh: "中文", en: "英文", ja: "日文", ko: "韩文", fr: "法文", de: "德文", es: "西班牙文", ru: "俄文" };
const LANG_OPTIONS = LANGS.map((code) => ({ label: LANG_LABELS[code] || code, value: code }));

function renderPage({ basePath, available, gated, configured }) {
  const banner = !available
    ? notice({
        tone: "warn",
        title: "Workers AI 绑定未配置。",
        body: '在 wrangler.toml 中加上 [ai] binding = "AI" 后重新部署即可启用。',
      })
    : gated && !configured
      ? notice({
          tone: "warn",
          title: "未配置 ADMIN，AI 接口默认关闭。",
          body: "设置 npx wrangler secret put ADMIN，或显式设置 AI_PUBLIC=true 开放。",
        })
      : "";

  const panel = (id, inner, hidden = false) => `<div id="view-${id}"${hidden ? " hidden" : ""}>${inner}</div>`;

  const body = `
${banner}
${tabs({
  items: [
    { key: "summary", label: "摘要", active: true },
    { key: "translate", label: "翻译" },
    { key: "embed", label: "向量" },
  ],
})}
${panel(
  "summary",
  card({
    title: "生成摘要",
    sub: "Llama 3.1 8B，运行在最近的边缘节点。",
    body: `
      <textarea class="x-textarea" id="summary-text" placeholder="粘贴需要摘要的文本…" spellcheck="false"></textarea>
      <div class="x-row" style="margin-top:12px">
        ${select({ label: "输出形式", id: "summary-style", options: [
          { label: "一段话", value: "brief" },
          { label: "要点列表", value: "bullets" },
          { label: "结构化提纲", value: "outline" },
        ], value: "brief" })}
        <span class="x-toolbar__spacer"></span>
        ${btn({ label: "生成摘要", variant: "primary", attrs: { id: "summary-run" } })}
      </div>
      <pre class="x-console" id="summary-out" style="margin-top:14px"></pre>
    `,
  }),
)}
${panel(
  "translate",
  card({
    title: "翻译",
    sub: "m2m100，支持中英日互译。",
    body: `
      <textarea class="x-textarea" id="translate-text" placeholder="粘贴需要翻译的文本…" spellcheck="false"></textarea>
      <div class="x-row" style="margin-top:12px">
        ${select({ label: "源语言", id: "translate-source", options: LANG_OPTIONS, value: "zh" })}
        <span class="x-muted" style="margin-top:18px">→</span>
        ${select({ label: "目标语言", id: "translate-target", options: LANG_OPTIONS, value: "en" })}
        <span class="x-toolbar__spacer"></span>
        ${btn({ label: "翻译", variant: "primary", attrs: { id: "translate-run" } })}
      </div>
      <pre class="x-console" id="translate-out" style="margin-top:14px"></pre>
    `,
  }),
  true,
)}
${panel(
  "embed",
  card({
    title: "文本向量",
    sub: "BGE-M3，1024 维。可用于相似度检索或写入 Vectorize。",
    body: `
      <textarea class="x-textarea" id="embed-text" placeholder="输入一段文本，得到 1024 维向量…" spellcheck="false"></textarea>
      <div class="x-row" style="margin-top:12px">
        <span class="x-toolbar__spacer"></span>
        ${btn({ label: "计算向量", variant: "primary", attrs: { id: "embed-run" } })}
      </div>
      <pre class="x-console" id="embed-out" style="margin-top:14px"></pre>
    `,
  }),
  true,
)}
<p class="error" id="ai-error"></p>`;

  return page({
    title: "AI 工具",
    lead: "摘要、翻译、向量与相似度，全部在 Cloudflare 边缘推理。模型：Llama 3.1 8B / m2m100 / BGE-M3。",
    body,
    actions: available ? badge({ text: "Workers AI", tone: "accent" }) : badge({ text: "未配置", tone: "off" }),
    script: AI_SCRIPT,
  });
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
