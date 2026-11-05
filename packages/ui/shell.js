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

/*
 * Upgrades every .x-select-wrap from components.js into a real dropdown.
 *
 * The value still lives in the native <select>, so page scripts that read
 * document.getElementById('ttl').value keep working, and the change event
 * fires on the native element — no page has to know this exists.
 * Keyboard: ↑/↓ move, Enter/Space pick, Esc backs out, Home/End jump.
 */
const SELECT_SCRIPT = String.raw`
(function () {
  var wraps = Array.prototype.slice.call(document.querySelectorAll('.x-select-wrap'));

  function closeOpen(event) {
    var target = event && event.target;
    // Scrolling inside the menu itself must not dismiss it.
    if (target && target.nodeType === 1 && target.closest && target.closest('.x-picker__menu')) return;
    wraps.forEach(function (wrap) {
      if (wrap.classList.contains('is-open')) wrap.dispatchEvent(new Event('x-picker-close'));
    });
  }

  window.addEventListener('scroll', closeOpen, true);
  window.addEventListener('resize', closeOpen);

  function closeOthers(current) {
    wraps.forEach(function (wrap) {
      if (wrap !== current && wrap.classList.contains('is-open')) wrap.dispatchEvent(new Event('x-picker-close'));
    });
  }

  wraps.forEach(function (wrap, wrapIndex) {
    var native = wrap.querySelector('select');
    var button = wrap.querySelector('.x-picker');
    var menu = wrap.querySelector('.x-picker__menu');
    var valueEl = wrap.querySelector('.x-picker__value');
    if (!native || !button || !menu) return;

    var options = Array.prototype.slice.call(menu.querySelectorAll('[role="option"]'));
    var active = -1;
    wrap.classList.add('is-enhanced');

    /*
     * Only now is the button real: a browser without JS gets the native select
     * as its control, focusable and announced, exactly as the markup says. The
     * inert pair belongs to the enhanced state, not to the HTML.
     */
    native.tabIndex = -1;
    native.setAttribute('aria-hidden', 'true');

    /*
     * components.js ids the menu and its options from the field id. A caller
     * that omitted the id still needs targets for aria-controls and
     * aria-activedescendant, so fill in a document-unique namespace here
     * rather than emitting ids like "-opt-0" that would collide.
     */
    if (!menu.id) {
      var ns = button.id ? button.id.replace(/-btn$/, '') : 'x-picker-' + (wrapIndex + 1);
      menu.id = ns + '-menu';
      options.forEach(function (option, i) { if (!option.id) option.id = ns + '-opt-' + i; });
    }
    if (!button.hasAttribute('aria-controls')) button.setAttribute('aria-controls', menu.id);

    function selectedIndex() {
      for (var i = 0; i < options.length; i++) {
        if (options[i].getAttribute('data-value') === native.value) return i;
      }
      return 0;
    }

    function sync() {
      var index = selectedIndex();
      options.forEach(function (option, i) {
        option.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
      if (options[index]) valueEl.textContent = options[index].textContent;
    }

    function setActive(index) {
      if (!options.length) return;
      active = Math.max(0, Math.min(options.length - 1, index));
      options.forEach(function (option, i) {
        option.classList.toggle('is-active', i === active);
      });
      // The highlight is a class, and a class does not exist for a screen
      // reader: activedescendant is what turns "arrow keys moved somewhere"
      // into "3 of 5, 30 天".
      button.setAttribute('aria-activedescendant', options[active].id);
      if (options[active].offsetTop + options[active].offsetHeight > menu.scrollTop + menu.clientHeight) {
        options[active].scrollIntoView({ block: 'nearest' });
      }
    }

    function place() {
      var rect = button.getBoundingClientRect();
      /*
       * The menu is at least as wide as the trigger it hangs off, and grows
       * past it when an option label is longer. A fixed 150px floor made a
       * 90px trigger open a 150px panel, which reads as two unrelated
       * widgets; measuring after the min-width lands keeps the clamp below
       * honest about the width the user actually sees.
       */
      menu.style.minWidth = rect.width + "px";
      var width = menu.offsetWidth;
      menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";

      var below = window.innerHeight - rect.bottom - 8;
      var height = menu.offsetHeight;
      if (height > below && rect.top - 8 > below) {
        menu.style.top = Math.max(8, rect.top - 6 - height) + 'px';
      } else {
        menu.style.top = rect.bottom + 6 + 'px';
      }
    }

    function open() {
      closeOthers(wrap);
      // Portal to <body>: a card with overflow:hidden would otherwise clip the
      // menu in half, and which card has a select changes per page.
      if (menu.parentNode !== document.body) document.body.appendChild(menu);
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
      setActive(selectedIndex());
      place();
    }

    function close(returnFocus) {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      // A closed list has no highlight, so it must not keep pointing at one.
      button.removeAttribute('aria-activedescendant');
      wrap.classList.remove('is-open');
      active = -1;
      if (menu.parentNode !== wrap) wrap.appendChild(menu);
      if (returnFocus) button.focus();
    }

    function choose(index) {
      var option = options[index];
      if (!option) return;
      var next = option.getAttribute('data-value');
      if (native.value !== next) {
        native.value = next;
        native.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync();
      close(true);
    }

    button.addEventListener('click', function (event) {
      event.preventDefault();
      if (menu.hidden) open();
      else close(true);
    });

    options.forEach(function (option, index) {
      option.addEventListener('click', function () { choose(index); });
      option.addEventListener('mouseenter', function () { setActive(index); });
    });

    button.addEventListener('keydown', function (event) {
      var key = event.key;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        /*
         * Opening and moving are two different intentions. open() already
         * parks the highlight on the current value, so an arrow that both
         * opened the menu and advanced would land on the neighbour — the user
         * presses Enter to confirm 7 天 and submits 1 天. First arrow opens and
         * stays put (the select-only convention); the next one moves.
         */
        if (menu.hidden) { open(); return; }
        setActive(active < 0 ? selectedIndex() : active + (key === 'ArrowDown' ? 1 : -1));
        return;
      }
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        event.preventDefault();
        if (menu.hidden) open();
        else choose(active < 0 ? selectedIndex() : active);
        return;
      }
      if (key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        close(true);
        return;
      }
      if (key === 'Tab' && !menu.hidden) {
        close(false);
        return;
      }
      if (key === 'Home') {
        event.preventDefault();
        open();
        setActive(0);
        return;
      }
      if (key === 'End') {
        event.preventDefault();
        open();
        setActive(options.length - 1);
      }
    });

    wrap.addEventListener('x-picker-close', function () { close(false); });
    native.addEventListener('change', sync);

    document.addEventListener('click', function (event) {
      if (!wrap.contains(event.target)) close(false);
    });

    sync();
  });
})();
`;

export function shell({ title, body, basePath = "", script = "", style = "", wide = false, backLabel = "返回工具库" }) {
  const base = JSON.stringify(basePath).replace(/</g, "\\u003c");
  // Only pages that actually render a picker pay for the script.
  const pickerScript = body.indexOf("x-select-wrap") !== -1 ? SELECT_SCRIPT : "";
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
${script || pickerScript ? `<script>${script}${pickerScript}</script>` : ""}
</body>
</html>`;
}
