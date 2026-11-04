/**
 * Reusable HTML fragments.
 *
 * Every tool used to hand-write its own markup. The bill: one login form
 * copied three times, six near-identical "missing binding" blocks, ten
 * different empty states, and CSS that drifted because nobody could tell
 * which copy was canonical. These functions are that canonical form.
 *
 * Rules they keep:
 *  - every interpolated value goes through escapeHtml();
 *  - no external assets (icons are inline SVG paths);
 *  - no build step, so this stays plain template strings.
 */

import { escapeHtml, shell } from "./shell.js";

/* ------------------------------------------------------------------ icons */

const PATHS = {
  lock: '<rect x="4" y="10" width="15" height="10" rx="2.5"/><path d="M7.5 10V7.5a4 4 0 0 1 8 0V10"/>',
  spark: '<path d="M12 3v4M12 17v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M3 12h4M17 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/>',
  inbox: '<path d="M3 13h4l1.5 3h7L17 13h4"/><path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  warn: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
};

const NOTICE_ICON = { info: "info", ok: "check", warn: "warn", danger: "x" };

/** Inline SVG icon. `name` must exist in PATHS; unknown names render nothing. */
export function icon(name) {
  const d = PATHS[name];
  if (!d) return "";
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
}

/* ----------------------------------------------------------------- helpers */

/** Build safe attributes from an object; null/undefined/false are dropped. */
function attrs(map = {}) {
  return Object.entries(map)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeHtml(v)}"`))
    .join("");
}

function cls(...parts) {
  return parts.filter(Boolean).join(" ");
}

/* -------------------------------------------------------------------- card */

export function card({ title = "", sub = "", body = "", foot = "", hover = false, tint = false, id = "" } = {}) {
  const head = title || sub
    ? `<div class="x-card__head"><div class="x-card__grow">
         ${title ? `<h2 class="x-card__title">${escapeHtml(title)}</h2>` : ""}
         ${sub ? `<p class="x-card__sub">${escapeHtml(sub)}</p>` : ""}
       </div></div>`
    : "";
  return `<section class="${cls("x-card", hover && "x-card--hover", tint && "x-card--tint")}"${attrs({ id })}>
  ${head}
  ${body ? `<div class="x-card__body">${body}</div>` : ""}
  ${foot ? `<div class="x-card__foot">${foot}</div>` : ""}
</section>`;
}

/* ------------------------------------------------------------------ button */

export function btn({
  label = "",
  href = "",
  variant = "",
  size = "",
  block = false,
  icon: iconName = "",
  type = "button",
  attrs: extra = {},
} = {}) {
  const classes = cls("x-btn", variant && `x-btn--${variant}`, size && `x-btn--${size}`, block && "x-btn--block");
  const inner = `${iconName ? `<span class="x-btn__icon">${icon(iconName)}</span>` : ""}<span>${escapeHtml(label)}</span>`;
  if (href) return `<a class="${classes}" href="${escapeHtml(href)}"${attrs(extra)}>${inner}</a>`;
  return `<button class="${classes}" type="${escapeHtml(type)}"${attrs(extra)}>${inner}</button>`;
}

/* ------------------------------------------------------------------- field */

export function field({
  label = "",
  name = "",
  type = "text",
  placeholder = "",
  value = "",
  hint = "",
  rows = 0,
  attrs: extra = {},
  id = "",
} = {}) {
  const inputId = id || name;
  const control =
    rows > 0
      ? `<textarea class="x-textarea"${attrs({ id: inputId, name, rows, placeholder, ...extra })}>${escapeHtml(value)}</textarea>`
      : `<input class="x-input"${attrs({ id: inputId, name, type, placeholder, value, ...extra })}>`;
  return `<label class="x-field"${inputId ? attrs({ for: inputId }) : ""}>
  ${label ? `<span class="x-field__label">${escapeHtml(label)}</span>` : ""}
  ${control}
  ${hint ? `<span class="x-field__hint">${hint}</span>` : ""}
</label>`;
}

/** Native select with the shared field styling. */
export function select({ label = "", name = "", id = "", options = [], value = "", attrs: extra = {} } = {}) {  const inputId = id || name;
  const opts = options
    .map((opt) => {
      const v = typeof opt === "object" ? opt.value : opt;
      const text = typeof opt === "object" ? opt.label : opt;
      return `<option value="${escapeHtml(v)}"${String(v) === String(value) ? " selected" : ""}>${escapeHtml(text)}</option>`;
    })
    .join("");
  const control = `<select class="x-select"${attrs({ id: inputId, name, ...extra })}>${opts}</select>`;
  if (!label) return control;
  return `<label class="x-field"${inputId ? attrs({ for: inputId }) : ""}>
  <span class="x-field__label">${escapeHtml(label)}</span>
  ${control}
</label>`;
}

/** Checkbox with label, used by burn-after-read and similar toggles. */
export function checkbox({ label = "", id = "", name = "", checked = false, attrs: extra = {} } = {}) {
  return `<label class="x-check"><input type="checkbox"${attrs({ id: id || name, name, checked, ...extra })}><span>${escapeHtml(label)}</span></label>`;
}

/* ------------------------------------------------------------------- badge */
export function badge({ text = "", tone = "off", dot = false } = {}) {
  return `<span class="x-badge x-badge--${escapeHtml(tone)}">${dot ? '<span class="x-dot x-dot--' + escapeHtml(tone === "off" ? "off" : tone) + '"></span>' : ""}${escapeHtml(text)}</span>`;
}

/* ------------------------------------------------------------------ notice */

export function notice({ tone = "info", title = "", body = "" } = {}) {
  return `<div class="x-notice x-notice--${escapeHtml(tone)}">
  <span class="x-notice__icon">${icon(NOTICE_ICON[tone] || "info")}</span>
  <div>${title ? `<b>${escapeHtml(title)}</b>` : ""}${title && body ? " " : ""}${body}</div>
</div>`;
}

/* ------------------------------------------------------------------- empty */

export function emptyState({ title = "暂无内容", desc = "", action = "", icon: iconName = "inbox" } = {}) {
  return `<div class="x-empty">
  <div class="x-empty__icon">${icon(iconName)}</div>
  <h3 class="x-empty__title">${escapeHtml(title)}</h3>
  ${desc ? `<p class="x-empty__desc">${escapeHtml(desc)}</p>` : ""}
  ${action ? `<div class="x-empty__action">${action}</div>` : ""}
</div>`;
}

/* ------------------------------------------------------------------- stats */

export function stat({ value = "", label = "", hint = "" } = {}) {
  return `<div class="x-stat">
  <span class="x-stat__value">${escapeHtml(value)}</span>
  <span class="x-stat__label">${escapeHtml(label)}</span>
  ${hint ? `<span class="x-stat__hint">${escapeHtml(hint)}</span>` : ""}
</div>`;
}

export function stats(items = []) {
  return `<div class="x-stats">${items.map(stat).join("")}</div>`;
}

/* ----------------------------------------------------------------- display */

/** Oversized single value, for counter pages and single-result tools. */
export function display({ value = "—", label = "", id = "", small = false } = {}) {
  return `<div class="x-display${small ? " x-display--sm" : ""}">
  <span class="x-display__value"${attrs({ id })}>${escapeHtml(value)}</span>
  ${label ? `<span class="x-display__label">${escapeHtml(label)}</span>` : ""}
</div>`;
}

/* ------------------------------------------------------------------- table */

/**
 * columns: [{ label, align }]. rows: array of arrays of pre-escaped HTML.
 * Rendering cells as HTML is deliberate — callers embed badges and links —
 * so every value inside a cell must be escaped by the caller.
 */
export function table({ columns = [], rows = [], empty = null } = {}) {
  if (!rows.length) return empty ?? "";
  const head = columns
    .map((c) => `<th${c.align ? ` style="text-align:${escapeHtml(c.align)}"` : ""}>${escapeHtml(c.label)}</th>`)
    .join("");
  const body = rows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  return `<div class="x-table-wrap"><table class="x-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* -------------------------------------------------------------------- code */

export function codeBlock({ content = "", label = "", tight = false } = {}) {
  return `<div class="x-code${tight ? " x-code--tight" : ""}">
  ${label ? `<div class="x-code__head">${escapeHtml(label)}</div>` : ""}
  <pre>${escapeHtml(content)}</pre>
</div>`;
}

/* ----------------------------------------------------------------- layout */

export function toolbar({ left = "", right = "" } = {}) {
  return `<div class="x-toolbar">${left}<span class="x-toolbar__spacer"></span>${right}</div>`;
}

export function section({ title = "", desc = "", body = "" } = {}) {
  return `<section class="x-section">
  <div class="x-section__head">
    ${title ? `<h2 class="x-section__title">${escapeHtml(title)}</h2>` : ""}
    ${desc ? `<p class="x-section__desc">${escapeHtml(desc)}</p>` : ""}
  </div>
  ${body}
</section>`;
}

/* ------------------------------------------------------------------- tabs */

/**
 * Segmented switch. Markup only — a page script toggles `x-tab--on` and the
 * `hidden` attribute on its panels. `data-tab` stays the hook so existing
 * handlers keep working.
 */
export function tabs({ id = "tabs", items = [] } = {}) {
  const buttons = items
    .map(
      (item) =>
        `<button class="x-tab${item.active ? " x-tab--on" : ""}" type="button"${attrs({ "data-tab": item.key })}>${escapeHtml(item.label)}</button>`,
    )
    .join("");
  return `<div class="x-tabs"${attrs({ id })}>${buttons}</div>`;
}

/* ------------------------------------------------------------------- chat */

/** Scrolling message log + composer. Ids are exposed so a page script can own it. */
export function chat({ logId = "log", inputId = "msg", sendId = "send", placeholder = "说点什么…", disabled = true } = {}) {
  return `<div class="x-chat">
  <div class="x-chat__log"${attrs({ id: logId })}></div>
  <div class="x-chat__form">
    <input class="x-input"${attrs({ id: inputId, placeholder, autocomplete: "off", disabled })}>
    ${btn({ label: "发送", attrs: { id: sendId, disabled } })}
  </div>
</div>`;
}

/* --------------------------------------------------------------- dropzone */

/** Click-or-drag file target. The hidden input keeps native pickers working. */
export function dropzone({ id = "drop", pickerId = "picker", title = "点击选择文件，或拖到这里", hint = "" } = {}) {
  return `<div class="x-drop"${attrs({ id })} role="button" tabindex="0">
  <p class="x-drop__title" data-drop-title>${escapeHtml(title)}</p>
  ${hint ? `<p class="x-drop__hint" data-drop-hint>${escapeHtml(hint)}</p>` : ""}
  <input type="file"${attrs({ id: pickerId })} hidden>
</div>`;
}

/* ---------------------------------------------------------------- linkbox */

/**
 * "Here is your link" panel. Shared by file sharing, paste and short links —
 * the three places that used to each invent their own copy of this block,
 * including the clipboard button and its two-second label swap.
 */
export function copyLink({ inputId = "url", copyId = "copy", openId = "open", label = "链接已生成", hidden = true } = {}) {
  return `<div class="x-result" id="result"${hidden ? " hidden" : ""}>
  <p class="x-result__label">${escapeHtml(label)}</p>
  <div class="x-linkbox">
    <input class="x-input"${attrs({ id: inputId, readonly: true })}>
    ${btn({ label: "复制", attrs: { id: copyId } })}
    ${btn({ label: "打开", href: "#", attrs: { id: openId, target: "_blank", rel: "noopener" } })}
  </div>
</div>`;
}

/** Behaviour for copyLink(). Kept as a string so pages can inline it. */
export function copyLinkScript({ inputId = "url", copyId = "copy" } = {}) {
  return `
(function(){
  var input = document.getElementById('${inputId}');
  var copy = document.getElementById('${copyId}');
  if (!copy || !input) return;
  copy.addEventListener('click', function(){
    if (!input.value) return;
    var label = copy.querySelector('span:last-child') || copy;
    navigator.clipboard.writeText(input.value).then(function(){
      label.textContent = '已复制';
      setTimeout(function(){ label.textContent = '复制'; }, 1200);
    });
  });
})();
`;
}

/** Behaviour for copyLink(). Kept as a string so pages can inline it. */
export const COPY_LINK_SCRIPT = copyLinkScript();

/* ------------------------------------------------------------------ meter */

/** Thin usage bar. `ratio` is 0..1; tone follows the quota state by default. */
export function meter({ ratio = 0, tone = "" } = {}) {
  const pct = Math.max(0, Math.min(1, Number(ratio) || 0));
  const cls = tone || (pct >= 0.6 ? "danger" : pct >= 0.45 ? "warn" : "");
  return `<div class="x-meter${cls ? " x-meter--" + cls : ""}"><span style="width:${(pct * 100).toFixed(1)}%"></span></div>`;
}

/** Meter plus the numeric percentage, on one line. */
export function meterRow({ ratio = 0, tone = "" } = {}) {
  const pct = Math.round((Number(ratio) || 0) * 100);
  return `<div class="x-meter-row">${meter({ ratio, tone })}<span class="pct">${pct}%</span></div>`;
}

/* ------------------------------------------------------------------ login */

/**
 * The admin gate, shared by every tool that has one.
 *
 * `error` is rendered server-side on purpose: the previous copy of this form
 * lived in three files and relied on a client script to read ?e=1, so a
 * user with JS disabled saw a blank failure.
 */
export function loginCard({
  action = "",
  title = "需要管理员口令",
  desc = "这个页面的数据只在你的浏览器与边缘节点之间流动。",
  hint = "",
  error = "",
  fieldName = "password",
  submit = "进入",
} = {}) {
  return `<div class="x-login x-fade">
  <div class="x-card">
    <div class="x-card__body">
      <div class="x-login__mark">${icon("lock")}</div>
      <h1 class="x-login__title">${escapeHtml(title)}</h1>
      <p class="x-login__desc">${escapeHtml(desc)}</p>
      <form method="post"${attrs({ action })}>
        <label class="x-field">
          <span class="x-field__label">口令</span>
          <input class="x-input" type="password" name="${escapeHtml(fieldName)}" placeholder="ADMIN 口令" autocomplete="current-password" autofocus required>
        </label>
        ${btn({ label: submit, variant: "primary", block: true, type: "submit" })}
      </form>
      <p class="x-field__hint" id="login-error"${error ? ` style="color:#fda4af"` : ""}>${error ? escapeHtml(error) : ""}</p>
      ${hint ? `<p class="x-field__hint" style="margin-top:10px">${escapeHtml(hint)}</p>` : ""}
    </div>
  </div>
</div>`;
}

/* ------------------------------------------------------------------- page */

/**
 * Wraps content in the shared shell. `wide` widens the measure for tables.
 * `lead` is the one-line summary under the H1 — every tool has one, so it is
 * part of the contract rather than something each page invents.
 */
export function page({ title = "", lead = "", body = "", actions = "", style = "", script = "", wide = false } = {}) {
  const head = `<div class="x-fade">
  <div class="x-row x-row--between" style="margin-bottom:6px">
    <h1>${escapeHtml(title)}</h1>
    ${actions ? `<div class="x-row">${actions}</div>` : ""}
  </div>
  ${lead ? `<p class="lead">${escapeHtml(lead)}</p>` : ""}
  ${body}
</div>`;
  return shell({ title, body: head, style, script, wide });
}
