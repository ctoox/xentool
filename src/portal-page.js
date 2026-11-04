import { PROTOCOL_VERSION } from "../packages/core/index.js";

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
};

const DEFAULT_ICON = '<circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/>';

function iconSvg(id) {
  const body = ICONS[id] || DEFAULT_ICON;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/**
 * Renders the portal as a complete, self-contained HTML document.
 * No external CSS, fonts, scripts or images: the page stays intact even if
 * every other endpoint is down. The inline script only enhances the page
 * (search filter, pointer glow, card tilt, health pill).
 */
export function renderPortal({
  tools = [],
  host = "tool.xen.autos",
  site = {},
  protocol = PROTOCOL_VERSION,
} = {}) {
  const brand = escapeHtml(site.name || "itools");
  const tagline = escapeHtml(site.tagline || "AI 工具库");
  const lead = escapeHtml(site.description || "一个入口，聚合边缘侧的 AI 工具。无需安装，打开即用。");
  const live = tools.filter((tool) => tool.status === "available").length;

  const cards = tools
    .map((tool, index) => {
      const available = tool.status === "available";
      const name = escapeHtml(tool.name || tool.id);
      const desc = escapeHtml(tool.description || "");
      const href = escapeHtml(tool.href || tool.path || "/");
      const tags = (tool.tags || [])
        .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
        .join("");
      const searchText = escapeHtml(
        [tool.id, tool.name, tool.description, ...(tool.tags || [])].join(" ").toLowerCase(),
      );
      const statusLabel = available ? "已上线" : "即将上线";

      const inner = `<span class="glow" aria-hidden="true"></span>
        <div class="card-top">
          <span class="icon">${iconSvg(tool.id)}</span>
          <span class="state${available ? " on" : ""}"><i aria-hidden="true"></i>${statusLabel}</span>
        </div>
        <h3>${name}</h3>
        <p>${desc}</p>
        <div class="card-foot">
          <div class="tags">${tags}</div>
          <span class="arrow" aria-hidden="true">→</span>
        </div>`;

      const tag = available ? "a" : "div";
      const attrs = available ? ` href="${href}"` : "";

      return `<${tag} class="card${available ? "" : " soon"}"${attrs} data-search="${searchText}" style="--i:${index}">${inner}</${tag}>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>${brand} · ${tagline}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>
:root{--bg:#06070a;--ink:#e8eaf0;--dim:#8b90a0;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.14);--cyan:#22d3ee;--violet:#a78bfa;--pink:#f472b6;--mx:50%;--my:30%}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(520px circle at var(--mx) var(--my),rgba(34,211,238,.10),transparent 62%)}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.62}
.aura .a1{width:520px;height:520px;left:-140px;top:-180px;background:rgba(34,211,238,.28)}
.aura .a2{width:460px;height:460px;right:-120px;top:-120px;background:rgba(167,139,250,.26)}
.aura .a3{width:520px;height:520px;left:38%;top:44%;background:rgba(244,114,182,.14)}
.grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(760px circle at 50% 0%,#000 12%,transparent 78%);-webkit-mask-image:radial-gradient(760px circle at 50% 0%,#000 12%,transparent 78%)}
.wrap{position:relative;z-index:1;max-width:1080px;margin:0 auto;padding:0 24px 72px}
nav{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(6,7,10,.55);border-bottom:1px solid var(--line)}
.logo{display:flex;align-items:center;gap:10px;font-weight:600;letter-spacing:-.01em;font-size:15px}
.logo .badge{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--violet));display:grid;place-items:center;color:#06070a;font:700 12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.nav-links{display:flex;align-items:center;gap:18px;font-size:13px}
.nav-links a{color:var(--dim);text-decoration:none;transition:color .18s}
.nav-links a:hover{color:var(--ink)}
.pill{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border:1px solid var(--line);border-radius:999px;font-size:12px;color:var(--dim);background:rgba(255,255,255,.03)}
.pill i{width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 3px rgba(34,211,238,.16);animation:pulse 2.4s ease-in-out infinite}
.hero{padding:72px 0 40px;text-align:center}
.kicker{display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border:1px solid var(--line);border-radius:999px;font-size:12px;color:var(--dim);background:rgba(255,255,255,.03)}
.kicker b{color:var(--cyan);font-weight:500}
h1{margin:22px 0 0;font-size:clamp(38px,7vw,68px);line-height:1.04;letter-spacing:-.04em;font-weight:600}
h1 .grad{background:linear-gradient(96deg,var(--cyan) 0%,var(--violet) 46%,var(--pink) 96%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{margin:18px auto 0;max-width:520px;color:var(--dim);font-size:15px}
.search{margin:32px auto 0;max-width:420px;position:relative}
.search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--dim);pointer-events:none}
.search input{width:100%;padding:13px 16px 13px 40px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s}
.search input::placeholder{color:#6b7183}
.search input:focus{border-color:rgba(34,211,238,.5);box-shadow:0 0 0 4px rgba(34,211,238,.10)}
.stats{display:flex;justify-content:center;gap:28px;margin:28px 0 0;flex-wrap:wrap}
.stat{text-align:center}
.stat b{display:block;font-size:20px;font-weight:600;letter-spacing:-.02em}
.stat span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.section{display:flex;align-items:center;justify-content:space-between;margin:44px 0 18px;gap:16px}
.section h2{margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:500}
.section .count{font-size:12px;color:var(--dim);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:16px}
.card{position:relative;display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:16px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018));color:inherit;text-decoration:none;overflow:hidden;transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .18s ease,border-color .2s ease,box-shadow .25s ease;animation:rise .55s cubic-bezier(.22,.7,.3,1) both;animation-delay:calc(var(--i,0) * 65ms)}
.card .glow{position:absolute;inset:-40% 40% 55% -40%;background:radial-gradient(circle at 30% 30%,rgba(34,211,238,.35),transparent 62%);opacity:0;transition:opacity .3s;pointer-events:none}
a.card:hover{border-color:rgba(34,211,238,.42);box-shadow:0 18px 44px -18px rgba(34,211,238,.5),inset 0 1px 0 rgba(255,255,255,.08)}
a.card:hover .glow{opacity:1}
a.card:hover .arrow{transform:translateX(3px);color:var(--cyan)}
a.card:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.card.soon{opacity:.72}
.card.soon:hover{opacity:.9}
.card.hidden{display:none}
.card-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;color:var(--cyan);background:rgba(34,211,238,.10);border:1px solid rgba(34,211,238,.22)}
.icon svg{width:19px;height:19px}
.state{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dim);white-space:nowrap}
.state i{width:5px;height:5px;border-radius:50%;background:#5b6070}
.state.on{color:rgba(34,211,238,.9)}
.state.on i{background:var(--cyan);box-shadow:0 0 8px rgba(34,211,238,.9)}
.card h3{margin:2px 0 0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.card p{margin:0;font-size:13px;line-height:1.6;color:var(--dim);min-height:42px}
.card-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:2px}
.tags{display:flex;gap:6px;flex-wrap:wrap}
.tag{font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:3px 8px;border-radius:6px;border:1px solid var(--line);color:var(--dim);background:rgba(255,255,255,.03)}
.arrow{color:var(--dim);font-size:15px;transition:transform .18s,color .18s}
.card.soon .arrow{display:none}
.empty{display:none;padding:40px 0;text-align:center;color:var(--dim);font-size:13px}
footer{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;align-items:center;font-size:12px;color:var(--dim)}
footer .meta{display:flex;gap:16px;flex-wrap:wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
footer a{color:var(--dim);text-decoration:none;transition:color .18s}
footer a:hover{color:var(--cyan)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.card{transform:none!important}}
@media (max-width:640px){.wrap{padding:0 16px 56px}.hero{padding:48px 0 28px}.nav-links .hide-sm{display:none}.stats{gap:20px}}
</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
<div class="grid" aria-hidden="true"></div>
<div class="wrap">
  <nav>
    <div class="logo"><span class="badge" aria-hidden="true">X</span>${brand}</div>
    <div class="nav-links">
      <a href="#tools">工具</a>
      <a href="/api/tools" class="hide-sm">API</a>
      <a href="https://github.com/ctoox/xentool" class="hide-sm">GitHub</a>
      <span class="pill" id="status"><i aria-hidden="true"></i><span>检测中</span></span>
    </div>
  </nav>

  <header class="hero">
    <span class="kicker">Edge-native · <b>Cloudflare Workers</b></span>
    <h1><span class="grad">${brand}</span></h1>
    <p class="lead">${lead}</p>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="q" type="search" placeholder="搜索工具…" autocomplete="off" aria-label="搜索工具">
    </div>
    <div class="stats">
      <div class="stat"><b>${tools.length}</b><span>工具</span></div>
      <div class="stat"><b>${live}</b><span>已上线</span></div>
      <div class="stat"><b>0</b><span>外部依赖</span></div>
    </div>
  </header>

  <div class="section" id="tools"><h2>全部工具</h2><span class="count">${tagline}</span></div>
  <div class="cards" id="cards">${cards}</div>
  <p class="empty" id="empty">没有匹配的工具</p>

  <footer>
    <div class="meta"><span>protocol v${escapeHtml(protocol)}</span><span>${escapeHtml(host)}</span></div>
    <div class="meta"><a href="/api/tools">/api/tools</a><a href="/health">/health</a><a href="https://github.com/ctoox/xentool">source</a></div>
  </footer>
</div>
<script>
(function(){
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(!reduce&&window.matchMedia&&window.matchMedia('(hover:hover)').matches){
    document.addEventListener('mousemove',function(e){
      document.documentElement.style.setProperty('--mx',e.clientX+'px');
      document.documentElement.style.setProperty('--my',e.clientY+'px');
    });
    var tilts=document.querySelectorAll('a.card');
    for(var i=0;i<tilts.length;i++){
      (function(card){
        card.addEventListener('mousemove',function(e){
          var r=card.getBoundingClientRect();
          var px=(e.clientX-r.left)/r.width-0.5;
          var py=(e.clientY-r.top)/r.height-0.5;
          card.style.setProperty('--ry',(px*4).toFixed(2)+'deg');
          card.style.setProperty('--rx',(py*-4).toFixed(2)+'deg');
        });
        card.addEventListener('mouseleave',function(){
          card.style.setProperty('--ry','0deg');
          card.style.setProperty('--rx','0deg');
        });
      })(tilts[i]);
    }
  }

  var q=document.getElementById('q');
  var cards=document.querySelectorAll('[data-search]');
  var empty=document.getElementById('empty');
  if(q){
    q.addEventListener('input',function(){
      var term=q.value.trim().toLowerCase();
      var shown=0;
      for(var i=0;i<cards.length;i++){
        var hit=!term||(cards[i].getAttribute('data-search')||'').indexOf(term)!==-1;
        cards[i].classList.toggle('hidden',!hit);
        if(hit)shown++;
      }
      if(empty)empty.style.display=shown?'none':'block';
    });
  }

  var pill=document.getElementById('status');
  if(pill&&window.fetch){
    fetch('/health').then(function(r){return r.ok?r.json():Promise.reject()})
      .then(function(){pill.innerHTML='<i aria-hidden="true"></i><span>运行正常</span>';})
      .catch(function(){pill.innerHTML='<i aria-hidden="true"></i><span>状态未知</span>';});
  }
})();
</script>
</body>
</html>`;
}
