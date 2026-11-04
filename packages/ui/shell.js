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

const ICON_BACK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;

/**
 * The site top bar, shared by every page.
 *
 * The back affordance used to be a bare text link — no border, no icon, about
 * 20px tall. It read as decoration rather than navigation, and on touch it was
 * far under the 44px minimum. This renders a real control: bordered, icon plus
 * label, 40px on pointer devices and 44px on coarse pointers via CSS.
 */
export function topbar({ brand = "xentool", back = "/", backLabel = "返回工具库", right = "" } = {}) {
  const logo = `<a class="x-brand" href="/"><span class="x-brand__badge" aria-hidden="true">X</span><span>${escapeHtml(brand)}</span></a>`;
  const backLink = back
    ? `<a class="x-back" href="${escapeHtml(back)}" aria-label="${escapeHtml(backLabel)}">${ICON_BACK}<span class="x-back__label">${escapeHtml(backLabel)}</span></a>`
    : "";
  return `<header class="x-top"><div class="x-top__inner">
  ${logo}
  <div class="x-top__spacer"></div>
  ${right}
  ${backLink}
</div></header>`;
}

const PAGE_CSS = String.raw`
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;line-height:1.55;overflow-x:hidden}
.aura{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.aura span{position:absolute;border-radius:50%;filter:blur(90px);opacity:.4}
.aura .a1{width:440px;height:440px;left:-150px;top:-170px;background:rgba(34,211,238,.30)}
.aura .a2{width:400px;height:400px;right:-130px;top:-90px;background:rgba(167,139,250,.24)}
main{position:relative;z-index:1;max-width:820px;margin:0 auto;padding:36px 24px 72px}
main.wide{max-width:var(--content)}
h1{margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em}
.lead{margin:8px 0 22px;color:var(--dim);font-size:13.5px}
.error{margin:14px 0 0;color:#f09595;font-size:13px;min-height:20px}
@media (max-width:640px){
  main{padding:24px 16px 56px}
  h1{font-size:21px}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

export function shell({ title, body, basePath = "", script = "", style = "", wide = false, backLabel = "返回工具库" }) {
  const base = JSON.stringify(basePath).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>${escapeHtml(title)} · xentool</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="/favicon.ico">
<style>${PAGE_CSS}${BASE_CSS}${style}</style>
</head>
<body>
<div class="aura" aria-hidden="true"><span class="a1"></span><span class="a2"></span></div>
${topbar({ brand: "xentool", back: "/", backLabel })}
<main${wide ? ' class="wide"' : ""}>${body}</main>
<script>window.__BASE=${base};</script>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}
