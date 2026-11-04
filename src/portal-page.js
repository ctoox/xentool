import { PROTOCOL_VERSION } from "../packages/core/index.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders the portal as a complete, self-contained HTML document.
 * No external CSS, fonts, or scripts: the page works even if every other
 * endpoint is down. The small inline script only upgrades the status pill.
 */
export function renderPortal({ tools = [], host = "tool.xen.autos", protocol = PROTOCOL_VERSION } = {}) {
  const cards = tools
    .map((tool) => {
      const name = escapeHtml(tool.name || tool.id);
      const desc = escapeHtml(tool.description || "");
      const href = escapeHtml(tool.href || tool.path || "/");
      const initial = escapeHtml(String(tool.id || "?").slice(0, 2).toUpperCase());
      const available = tool.status === "available";
      const badge = available
        ? '<span class="badge">已上线</span>'
        : '<span class="badge planned">筹划中</span>';
      const open = available ? '<div class="go">打开工具 <span aria-hidden="true">→</span></div>' : "";
      const tag = available ? "a" : "div";
      const attrs = available ? ` href="${href}"` : "";

      return `<${tag} class="card"${attrs}>
        <div class="card-top"><div class="tool-icon">${initial}</div>${badge}</div>
        <h2>${name}</h2>
        <p class="desc">${desc}</p>
        <code class="path">${href}</code>
        ${open}
      </${tag}>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>xentool · 边缘工具集</title>
<style>
:root{--bg:#f7f7f5;--surface:#fff;--border:#e6e5df;--text:#1c1c1a;--muted:#6b6b65;--accent:#0f6e56;--accent-soft:#e1f5ee;--radius:12px}
@media (prefers-color-scheme:dark){:root{--bg:#151816;--surface:#1e211f;--border:#333834;--text:#f2f3f0;--muted:#9a9e98;--accent:#5dcaa5;--accent-soft:#1c332c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}
.wrap{max-width:960px;margin:0 auto;padding:56px 24px 64px}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:14px}
.mark{width:44px;height:44px;border-radius:12px;background:var(--accent);color:#fff;display:grid;place-items:center;font:600 19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:-1px}
h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em}
.tagline{margin:5px 0 0;color:var(--muted);font-size:14px}
.status{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-size:12px;color:var(--muted);white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;background:#b9bdba}
.dot.ok{background:#1d9e75;box-shadow:0 0 0 3px rgba(29,158,117,.15)}
.hr{height:1px;background:var(--border);margin:32px 0}
.section-label{margin:0 0 16px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.card{display:flex;flex-direction:column;gap:14px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);text-decoration:none;color:inherit;transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}
a.card:hover{transform:translateY(-2px);border-color:var(--accent);box-shadow:0 8px 24px rgba(0,0,0,.05)}
a.card:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.card-top{display:flex;align-items:center;justify-content:space-between}
.tool-icon{width:36px;height:36px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font:600 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.badge{font-size:11px;padding:4px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
.badge.planned{background:transparent;border:1px solid var(--border);color:var(--muted)}
.card h2{margin:0;font-size:16px;font-weight:600}
.desc{margin:0;font-size:13px;line-height:1.6;color:var(--muted);min-height:42px}
.path{font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:6px 9px;align-self:flex-start}
.go{margin-top:2px;font-size:13px;color:var(--accent);display:flex;align-items:center;gap:6px}
.card.more{border-style:dashed;background:transparent;align-items:center;justify-content:center;text-align:center;min-height:184px;color:var(--muted);font-size:13px}
footer{margin-top:40px;display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted)}
.meta{display:flex;gap:16px;flex-wrap:wrap}
footer a{color:var(--muted);text-decoration:none;border-bottom:1px solid var(--border);padding-bottom:1px}
footer a:hover{color:var(--accent);border-color:var(--accent)}
@media (max-width:560px){.wrap{padding:32px 16px 48px}h1{font-size:20px}.status{font-size:11px}}
</style>
</head>
<body>
<main class="wrap">
  <header>
    <div class="brand">
      <div class="mark" aria-hidden="true">X</div>
      <div><h1>xentool</h1><p class="tagline">边缘工具集 · 一个入口，多个独立工具</p></div>
    </div>
    <div class="status" id="status"><span class="dot"></span><span>检查服务状态…</span></div>
  </header>
  <div class="hr"></div>
  <p class="section-label">工具 / ${tools.length}</p>
  <div class="grid">
    ${cards}
    <div class="card more"><div>更多工具持续添加中</div></div>
  </div>
  <footer>
    <div class="meta"><span>协议 v${escapeHtml(protocol)}</span><span>${escapeHtml(host)}</span></div>
    <div class="meta"><a href="/api/tools">/api/tools</a><a href="/health">/health</a><a href="https://github.com/ctoox/xentool">GitHub</a></div>
  </footer>
</main>
<script>
(function(){
  var el=document.getElementById('status');
  if(!el||!window.fetch)return;
  fetch('/health').then(function(r){return r.ok?r.json():Promise.reject()})
    .then(function(){el.innerHTML='<span class="dot ok"></span><span>服务运行正常</span>'})
    .catch(function(){el.innerHTML='<span class="dot"></span><span>状态未知</span>'});
})();
</script>
</body>
</html>`;
}
