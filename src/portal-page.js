import { PROTOCOL_VERSION } from "../packages/core/index.js";
import { TOKENS, BASE_CSS } from "../packages/ui/theme.js";
import { topbar, toolCard, chips } from "../packages/ui/components.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ICONS = {
  url: '<path d="M9.5 14.5l5-5"/><path d="M8 11l-1.6 1.6a3.5 3.5 0 005 5L13 16"/><path d="M16 13l1.6-1.6a3.5 3.5 0 00-5-5L11 8"/>',
  base64:
    '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M7 10h2M11 10h2M15 10h2M7 14h2M11 14h2M15 14h2"/>',
  json: '<path d="M9 5H8a2 2 0 00-2 2v3a2 2 0 01-2 2 2 2 0 012 2v3a2 2 0 002 2h1"/><path d="M15 5h1a2 2 0 012 2v3a2 2 0 002 2 2 2 0 00-2 2v3a2 2 0 01-2 2h-1"/>',
  jwt: '<circle cx="9" cy="9" r="3"/><path d="M11.3 11.3L19 19M15.8 15.8l2-2M18 18l2-2"/>',
  hash: '<path d="M9.5 4l-2 16M16.5 4l-2 16M4 9h16M3.5 15h16"/>',
  uuid: '<rect x="4" y="6" width="16" height="12" rx="2"/><circle cx="9" cy="11" r="1.6"/><path d="M6.5 15.6c.6-1.4 1.6-2.1 2.5-2.1s1.9.7 2.5 2.1M14 10h4M14 13h4"/>',
  time: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.3l3 1.8"/>',
  regex: '<path d="M12 5v14M5.5 8.5l13 7M18.5 8.5l-13 7"/>',
  color: '<path d="M12 4s5 5.6 5 9.2a5 5 0 01-10 0C7 9.6 12 4 12 4z"/>',
  "ai-summary": '<path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4z"/>',
  "ai-translate":
    '<path d="M4 6h8M8 6v2c0 3-2 5-4 6"/><path d="M6 12c2 2 4 3 6 3"/><path d="M13 18l3-8 3 8M14.5 15h3"/>',
  paste:
    '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  short:
    '<path d="M10.5 13.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5l1-1"/>',
  chat: '<path d="M4 5h16v10H9l-5 4V5z"/><path d="M8 9h8M8 12h5"/>',
  image:
    '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 16l5-4 4 3 3-2 4 3"/>',
  ocr: '<path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3"/><path d="M8 12h8"/>',
  summarize: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 10h6M9 13h6M9 16h4"/>',
  translate:
    '<path d="M4 6h8M8 6v2c0 3-2 5-4 6"/><path d="M6 12c2 2 4 3 6 3"/><path d="M13 18l3-8 3 8M14.5 15h3"/>',
  ai: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><circle cx="18.5" cy="17.5" r="2"/>',
  file: '<path d="M13 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V9z"/><path d="M13 3v6h6"/>',
  hit: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  room: '<path d="M4 5h16v10H9l-5 4z"/><circle cx="9" cy="10" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
  sql: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  kv: '<rect x="3" y="6" width="18" height="5" rx="1.5"/><rect x="3" y="13" width="18" height="5" rx="1.5"/><path d="M7 8.5h.01M7 15.5h.01"/>',
  status: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  vector:
    '<circle cx="6" cy="17" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="15" r="2"/><path d="M7.5 15.6L10.6 7.7M13.6 7.2l2.9 6.1M8 17.4l8-.2"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M20 20v.01M14 20v.01"/>',
  cidr: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="18" cy="18" r="2"/>',
  cron: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.2 1.9"/><path d="M4 4l2 2M20 4l-2 2"/>',
  diff: '<path d="M8 4v12M4 8h8"/><path d="M16 20V8M12 16h8"/>',
  markdown:
    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 15V9l2.5 3L12 9v6"/><path d="M16 9v6M14 13l2 2 2-2"/>',
};

const DEFAULT_ICON = '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/>';

function iconSvg(id) {
  const body = ICONS[id] || DEFAULT_ICON;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/**
 * Preferred order for the category chips. Anything not listed still shows up,
 * appended after these — ordering is a presentation concern, membership is not.
 */
const CATEGORY_ORDER = ["边缘能力", "存储", "编码转换", "开发辅助", "网络", "文本处理"];

/**
 * Renders the portal as a complete, self-contained HTML document.
 *
 * Every tool is in the DOM. Paging would fight the search box (you cannot
 * filter what you did not render) and 100+ cards is still a few hundred KB of
 * inline markup that gzips well. What does not scale is *finding*: hence the
 * category chips, the count, and a card/list toggle that halves the height of
 * each entry on small screens.
 */
export function renderPortal({
  tools = [],
  host = "tool.xen.autos",
  site = {},
  protocol = PROTOCOL_VERSION,
} = {}) {
  const brand = escapeHtml(site.name || "xentool");
  const tagline = escapeHtml(site.tagline || "AI 工具库");
  const lead = escapeHtml(site.description || "一个入口，聚合边缘侧的 AI 工具。无需安装，打开即用。");
  const live = tools.filter((tool) => tool.status === "available").length;

  const withCategory = tools.map((tool) => ({
    ...tool,
    category: tool.category || "其他",
  }));

  const counts = new Map();
  for (const tool of withCategory) counts.set(tool.category, (counts.get(tool.category) || 0) + 1);
  const chipItems = CATEGORY_ORDER.filter((name) => counts.has(name))
    .concat([...counts.keys()].filter((name) => !CATEGORY_ORDER.includes(name)))
    .map((name) => ({ id: name, name, count: counts.get(name) }));

  const cards = withCategory
    .map(
      (tool, index) =>
        // Cap the stagger: at 100 tools an unbounded delay means the last card
        // appears six seconds after load, which reads as "broken", not "polished".
        `<div class="x-stagger" style="--i:${Math.min(index, 11)}">${toolCard(tool, {
          icon: iconSvg(tool.id),
        })}</div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>${brand} · ${tagline}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>
${TOKENS}
${BASE_CSS}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(520px circle at var(--mx,50%) var(--my,30%),rgba(34,211,238,.09),transparent 62%)}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55}
.aura .a1{width:520px;height:520px;left:-140px;top:-180px;background:rgba(34,211,238,.26)}
.aura .a2{width:460px;height:460px;right:-120px;top:-120px;background:rgba(167,139,250,.24)}
.aura .a3{width:520px;height:520px;left:38%;top:44%;background:rgba(244,114,182,.12)}
.wrap{position:relative;z-index:1;max-width:var(--content);margin:0 auto;padding:0 24px 72px}
.nav-links{display:flex;align-items:center;gap:6px;font-size:13px}
.nav-links a{display:inline-flex;align-items:center;height:34px;padding:0 11px;border-radius:8px;color:var(--dim);text-decoration:none;transition:color .18s var(--ease),background .18s var(--ease)}
.nav-links a:hover{color:var(--ink);background:var(--surface-2)}
.pill{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:999px;font-size:12px;color:var(--dim);background:var(--surface)}
.pill i{width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 3px rgba(34,211,238,.16);animation:pulse 2.4s ease-in-out infinite}
.pill--down i{background:var(--danger);box-shadow:0 0 0 3px rgba(251,113,133,.18);animation:none}
.hero{padding:64px 0 28px;text-align:center}
.kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border:1px solid var(--line);border-radius:999px;font-size:12px;color:var(--dim);background:var(--surface)}
.kicker b{color:var(--cyan);font-weight:500}
h1{margin:20px 0 0;font-size:clamp(34px,6.4vw,60px);line-height:1.05;letter-spacing:-.04em;font-weight:600}
h1 .grad{background:linear-gradient(96deg,var(--cyan) 0%,var(--violet) 46%,var(--pink) 96%);-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p.lead{margin:16px auto 0;max-width:560px;color:var(--dim);font-size:14.5px;line-height:1.65}
.hero-stats{display:flex;justify-content:center;gap:26px;margin:22px 0 0;flex-wrap:wrap}
.hero-stat b{display:block;font-size:19px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hero-stat span{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.catalog-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:34px 0 12px;flex-wrap:wrap}
.catalog-head h2{margin:0;font-size:12.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:500}
.catalog-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.catalog-tools .x-search{position:relative;width:230px}
.catalog-tools .x-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:14px;height:14px;fill:none;stroke:var(--dim);stroke-width:1.9;stroke-linecap:round;pointer-events:none}
.catalog-tools .x-search input{width:100%;height:34px;padding:0 12px 0 33px;border:1px solid var(--line-2);border-radius:9px;background:rgba(0,0,0,.3);color:var(--ink);font-size:var(--field-fs);outline:none;transition:border-color .16s var(--ease),box-shadow .16s var(--ease)}
.catalog-tools .x-search input:focus{border-color:rgba(34,211,238,.55);box-shadow:var(--sh-glow)}
.catalog-tools .x-search input::placeholder{color:var(--hint)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));gap:14px}
.x-stagger{animation:rise .5s cubic-bezier(.22,.7,.3,1) both;animation-delay:calc(var(--i,0) * 26ms)}
.x-stagger.hidden{display:none}
.empty{margin:44px 0;text-align:center;color:var(--dim);font-size:13px;display:none}
.empty.show{display:block}
.empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:6px}
footer{margin-top:52px;padding-top:20px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;font-size:12px;color:var(--dim)}
footer .meta{display:flex;gap:6px;flex-wrap:wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
footer a{display:inline-flex;align-items:center;min-height:32px;padding:0 8px;border-radius:7px;color:var(--dim);text-decoration:none;transition:color .18s,background .18s}
footer a:hover{color:var(--cyan);background:var(--surface-2)}
footer a:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (max-width:900px){
  .wrap{padding:0 20px 64px}
  .hero{padding:44px 0 22px}
  .catalog-tools .x-search{width:100%}
  .catalog-tools{width:100%}
  .catalog-tools .x-search{order:2;flex:1 1 100%}
}
@media (max-width:640px){
  .wrap{padding:0 16px 56px}
  .hero{padding:34px 0 18px}
  .nav-links a{padding:0 9px}
  .nav-links .hide-sm{display:none}
  .hero-stats{gap:18px}
  .catalog-head{margin:26px 0 10px;gap:10px}
  .catalog-tools .x-search input{height:var(--tap)}
  .cards{grid-template-columns:1fr;gap:10px}
  .x-view-toggle button{height:36px}
  footer{font-size:11.5px}
  footer a{min-height:var(--tap)}
}
@media (pointer:coarse){
  .x-view-toggle button{height:var(--tap);padding:0 13px}
  .nav-links a{height:var(--tap)}
  .pill{height:var(--tap)}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
  .x-tool-card:hover{transform:none}
}
</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
${topbar({
  brand: site.name || "xentool",
  back: "",
  right: `<div class="nav-links">
    <a href="#tools">工具</a>
    <a href="/tools" class="hide-sm">工作台</a>
    <a href="/status/" class="hide-sm">能力</a>
    <a href="/api/tools" class="hide-sm">API</a>
    <span class="pill" id="status"><i aria-hidden="true"></i><span>检测中</span></span>
  </div>`,
})}
<div class="wrap">
  <header class="hero">
    <span class="kicker">Edge-native · <b>Cloudflare Workers</b></span>
    <h1><span class="grad">${brand}</span></h1>
    <p class="lead">${lead}</p>
    <div class="hero-stats">
      <div class="hero-stat"><b>${tools.length}</b><span>工具</span></div>
      <div class="hero-stat"><b>${live}</b><span>已上线</span></div>
      <div class="hero-stat"><b>0</b><span>外部依赖</span></div>
    </div>
  </header>

  <div class="catalog-head" id="tools">
    <h2>全部工具 <span class="x-result-count" id="count" role="status" aria-live="polite">${tools.length}</span></h2>
    <div class="catalog-tools">
      <div class="x-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="q" type="search" placeholder="搜索工具…" autocomplete="off" aria-label="搜索工具">
      </div>
      <div class="x-view-toggle" role="group" aria-label="显示方式">
        <button type="button" data-view="card" aria-pressed="true" title="卡片视图">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>
          <span>卡片</span>
        </button>
        <button type="button" data-view="list" aria-pressed="false" title="紧凑视图">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          <span>紧凑</span>
        </button>
      </div>
    </div>
  </div>

  <div style="margin:0 0 14px">${chips({ items: chipItems, allCount: tools.length })}</div>

  <div class="cards" id="cards" data-view="card">${cards}</div>
  <p class="empty" id="empty" role="status" aria-live="polite"><b>没有匹配的工具</b>换个关键词，或选择「全部」分类。</p>

  <footer>
    <div class="meta"><span>protocol v${escapeHtml(protocol)}</span><span>${escapeHtml(host)}</span></div>
    <div class="meta"><a href="/api/tools">/api/tools</a><a href="/health">/health</a><a href="https://github.com/ctoox/xentool">source</a></div>
  </footer>
</div>
<script>
(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduce && window.matchMedia && window.matchMedia('(hover:hover)').matches) {
    document.addEventListener('mousemove', function(e){
      document.documentElement.style.setProperty('--mx', e.clientX + 'px');
      document.documentElement.style.setProperty('--my', e.clientY + 'px');
    });
  }

  var q = document.getElementById('q');
  var cardsEl = document.getElementById('cards');
  var countEl = document.getElementById('count');
  var emptyEl = document.getElementById('empty');
  var items = [].slice.call(document.querySelectorAll('[data-search]'));
  var category = 'all';

  function apply() {
    var term = (q && q.value ? q.value : '').trim().toLowerCase();
    var shown = 0;
    for (var i = 0; i < items.length; i++) {
      var node = items[i];
      var wrap = node.parentNode;
      var hay = node.getAttribute('data-search') || '';
      var cat = node.getAttribute('data-cat') || '';
      var hit = (!term || hay.indexOf(term) !== -1) && (category === 'all' || cat === category);
      wrap.classList.toggle('hidden', !hit);
      if (hit) shown++;
    }
    if (countEl) countEl.textContent = shown;
    if (emptyEl) emptyEl.classList.toggle('show', shown === 0);
    updateChipCounts();
  }

  /*
   * Rewrite the count on each category chip so it reflects what the current
   * search leaves behind. A chip that still shows its server-rendered total
   * while a search is active promises entries the list no longer contains.
   */
  function updateChipCounts() {
    var chipRow = document.querySelector('.x-chips');
    if (!chipRow) return;
    var chips = chipRow.querySelectorAll('[data-cat]');
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      var slot = chip.querySelector('.x-chip__count');
      if (!slot) continue;
      var id = chip.getAttribute('data-cat');
      var n = countFor(id === 'all' ? '' : id);
      slot.textContent = String(n);
      chip.classList.toggle('x-chip--empty', n === 0);
    }
  }

  /* How many items of a category survive the current search term. */
  function countFor(cat) {
    var term = (q && q.value ? q.value : '').trim().toLowerCase();
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      var node = items[i];
      var hay = node.getAttribute('data-search') || '';
      var c = node.getAttribute('data-cat') || '';
      if (cat && c !== cat) continue;
      if (!term || hay.indexOf(term) !== -1) n++;
    }
    return n;
  }

  if (q) q.addEventListener('input', apply);

  var chipRow = document.querySelector('.x-chips');
  if (chipRow) {
    chipRow.addEventListener('click', function(e){
      var btn = e.target.closest('[data-cat]');
      if (!btn) return;
      category = btn.getAttribute('data-cat');
      var all = chipRow.querySelectorAll('[data-cat]');
      for (var i = 0; i < all.length; i++) {
        var on = all[i] === btn;
        all[i].classList.toggle('x-chip--on', on);
        all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      apply();
    });
  }

  // Scope the toggle to the buttons. The catalog container also carries a
  // data-view attribute, so a looser selector picked it up too: the container
  // was given a stray aria-pressed and a click handler, which meant clicking
  // any tool card rewrote the saved view preference.
  var toggles = document.querySelectorAll('.x-view-toggle button[data-view]');
  function setView(view) {
    if (view !== 'list') view = 'card';
    cardsEl.setAttribute('data-view', view);
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute('aria-pressed', toggles[i].getAttribute('data-view') === view ? 'true' : 'false');
    }
    try { localStorage.setItem('xentool:view', view); } catch (e) {}
  }
  for (var t = 0; t < toggles.length; t++) {
    toggles[t].addEventListener('click', function(){ setView(this.getAttribute('data-view')); });
  }
  var saved = null;
  try { saved = localStorage.getItem('xentool:view'); } catch (e) {}
  // On phones the compact view is the better default: it roughly doubles how
  // many tools fit on one screen, which matters once the catalog is 100+.
  if (!saved && window.matchMedia && window.matchMedia('(max-width: 640px)').matches) saved = 'list';
  if (saved) setView(saved);

  var pill = document.getElementById('status');
  if (pill && window.fetch) {
    fetch('/health').then(function(r){ return r.ok ? r.json() : Promise.reject(); })
      .then(function(){
        pill.querySelector('span').textContent = '运行正常';
      })
      .catch(function(){
        pill.classList.add('pill--down');
        pill.querySelector('span').textContent = '状态未知';
      });
  }
})();
</script>
</body>
</html>`;
}
