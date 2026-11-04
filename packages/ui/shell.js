/**
 * Shared page shell for tool UIs (paste, short, …).
 *
 * Deliberately dependency-free and inline: no external CSS/fonts/scripts, so
 * tool pages render even if everything else is unavailable. Kept in packages/
 * because several tools share it — treat it like core and keep changes small.
 *
 * Component styles live in theme.js and are appended here once per page, so a
 * tool only pays for the design system, not for its own copy of it.
 */

import { BASE_CSS } from "./theme.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_CSS = String.raw`
:root{--bg:#06070a;--ink:#e8eaf0;--dim:#8b90a0;--line:rgba(255,255,255,.09);--cyan:#22d3ee;--violet:#a78bfa}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.4}
.aura .a1{width:440px;height:440px;left:-150px;top:-170px;background:rgba(34,211,238,.30)}
.aura .a2{width:400px;height:400px;right:-130px;top:-90px;background:rgba(167,139,250,.24)}
.top{position:sticky;top:0;z-index:5;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(6,7,10,.6);border-bottom:1px solid var(--line)}
.top-in{max-width:820px;margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.logo{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:var(--ink);text-decoration:none}
.logo .badge{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),var(--violet));display:grid;place-items:center;color:#06070a;font:700 12px ui-monospace,monospace}
.back{font-size:13px;color:var(--dim);text-decoration:none}
.back:hover{color:var(--cyan)}
main{position:relative;z-index:1;max-width:820px;margin:0 auto;padding:36px 24px 72px}
h1{margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em}
.lead{margin:8px 0 22px;color:var(--dim);font-size:13.5px}
.editor{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03);overflow:hidden}
textarea{width:100%;min-height:260px;border:0;background:transparent;color:var(--ink);font:13.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:16px;resize:vertical;outline:none}
input.field{width:100%;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.04);color:var(--ink);padding:13px 14px;font-size:14px;outline:none;transition:border-color .18s,box-shadow .18s}
input.field:focus{border-color:rgba(34,211,238,.5);box-shadow:0 0 0 4px rgba(34,211,238,.09)}
.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-top:1px solid var(--line);background:rgba(0,0,0,.18)}
select,.btn{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.05);color:var(--ink);padding:8px 13px;border-radius:9px;font-size:13px;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
select:hover,.btn:hover{background:rgba(255,255,255,.1)}
.btn.primary{background:linear-gradient(135deg,rgba(34,211,238,.92),rgba(167,139,250,.92));border-color:transparent;color:#06070a;font-weight:600}
.btn.primary:hover{filter:brightness(1.06)}
.btn:disabled{opacity:.55;cursor:default}
.check{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--dim);cursor:pointer;user-select:none}
.check input{accent-color:#22d3ee}
.spacer{flex:1}
.result{margin-top:18px;padding:16px;border:1px solid rgba(34,211,238,.3);border-radius:12px;background:rgba(34,211,238,.06)}
.result .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--cyan);margin-bottom:9px}
.linkrow{display:flex;gap:8px;flex-wrap:wrap}
.linkrow input{flex:1;min-width:200px;border:1px solid var(--line);border-radius:9px;background:rgba(0,0,0,.3);color:var(--ink);padding:9px 12px;font:12.5px ui-monospace,monospace;outline:none}
.error{margin:14px 0 0;color:#f09595;font-size:13px;min-height:20px}
.hint{margin:22px 0 0;color:var(--dim);font-size:12px;font-family:ui-monospace,monospace}
.meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:var(--dim);font-size:12.5px;margin:0 0 14px}
.meta code{font-family:ui-monospace,monospace;color:var(--ink);background:rgba(255,255,255,.05);padding:2px 7px;border-radius:6px}
.dot{width:6px;height:6px;border-radius:50%;background:#1d9e75;box-shadow:0 0 8px rgba(29,158,117,.9)}
pre.content{margin:0;padding:18px;border:1px solid var(--line);border-radius:12px;background:rgba(0,0,0,.35);font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:64vh;overflow:auto}
.actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:0 0 20px}
.stat{padding:16px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.03)}
.stat b{display:block;font-size:22px;font-weight:600;letter-spacing:-.02em}
.stat span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.empty{margin:48px 0;text-align:center;color:var(--dim)}
.empty h2{margin:0 0 8px;font-size:18px;color:var(--ink);font-weight:600}
@media (max-width:640px){main{padding:24px 16px 56px}h1{font-size:21px}textarea{min-height:200px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

export function shell({ title, body, basePath = "", script = "", style = "", wide = false }) {
  const base = JSON.stringify(basePath).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>${escapeHtml(title)} · xentool</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>${PAGE_CSS}${BASE_CSS}${style}</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span></div>
<div class="top"><div class="top-in">
  <a class="logo" href="/"><span class="badge" aria-hidden="true">X</span>xentool</a>
  <a class="back" href="/">← 返回工具库</a>
</div></div>
<main${wide ? ' class="wide"' : ""}>${body}</main>
<script>window.__BASE=${base};</script>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}
