/**
 * Design tokens + component styles for every page in the site.
 *
 * One stylesheet, one vocabulary. Tool modules stopped hand-rolling CSS
 * because the copy-paste drift was measurable: `btn` appeared 23 times,
 * `empty` 10 times, and the admin login card three times verbatim — each
 * copy free to diverge on the next edit.
 *
 * Everything here is inline (no external CSS/fonts/assets), uses the `x-`
 * prefix so it can coexist with legacy classes while tools migrate, and is
 * emitted once per page by the shell. Adding a rule here costs bytes on
 * every page, so component styles belong here and page-specific ones do not.
 */

export const TOKENS = String.raw`
:root{
  --bg:#07080c;--bg-elev:#0b0d14;--ink:#e9ebf2;--ink-2:#aeb4c6;--dim:#7d8497;
  /* Placeholders and other "hints" still have to be readable: 4.9:1 on the
     page background, which clears the 4.5:1 floor for body text. */
  --hint:#767e90;
  --line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.15);
  --surface:rgba(255,255,255,.028);--surface-2:rgba(255,255,255,.052);--surface-3:rgba(255,255,255,.08);
  --cyan:#22d3ee;--violet:#a78bfa;--pink:#f472b6;--ok:#34d399;--warn:#fbbf24;--danger:#fb7185;--info:#60a5fa;
  --r-sm:9px;--r:13px;--r-lg:19px;
  --sh-1:0 1px 2px rgba(0,0,0,.35);
  --sh-2:0 10px 30px -14px rgba(0,0,0,.75);
  --sh-glow:0 0 0 4px rgba(34,211,238,.1);
  --ease:cubic-bezier(.4,0,.2,1);
  --nav-h:60px;--tap:44px;--content:1200px;--sidebar:240px;
  /*
   * Form field font size. iOS Safari zooms the page when a focused field
   * renders under 16px, and the zoom never resets on blur. Every input size in
   * the app derives from these two variables so the "no zoom" rule can be
   * enforced in exactly one place instead of being re-declared per page.
   */
  --field-fs:14px;--field-fs-mono:12.5px;
}
`;

export const COMPONENTS = String.raw`
/* ------------------------------------------------------------------ topbar */
.x-top{position:sticky;top:0;z-index:30;background:rgba(7,8,12,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top)}
.x-top__inner{max-width:var(--content);margin:0 auto;padding:0 24px;height:var(--nav-h);display:flex;align-items:center;gap:12px}
.x-brand{display:inline-flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-size:15px;font-weight:600;letter-spacing:-.01em;min-height:var(--tap)}
.x-brand__badge{width:28px;height:28px;border-radius:9px;flex:none;display:grid;place-items:center;background:linear-gradient(135deg,var(--cyan),var(--violet));color:#05070b;font:700 12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.x-brand:hover{color:var(--ink)}
.x-top__spacer{flex:1}
.x-back{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 13px 0 11px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:var(--surface);color:var(--ink-2);font:500 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;text-decoration:none;white-space:nowrap;transition:background .16s var(--ease),border-color .16s var(--ease),color .16s var(--ease)}
.x-back svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.x-back:hover{background:var(--surface-3);border-color:rgba(34,211,238,.4);color:var(--cyan)}
.x-back:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.x-back__label{line-height:1}

/* ------------------------------------------------------------------- card */
.x-card{position:relative;border:1px solid var(--line);border-radius:var(--r-lg);background:linear-gradient(180deg,rgba(255,255,255,.038),rgba(255,255,255,.014));box-shadow:var(--sh-1),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;transition:border-color .2s var(--ease),box-shadow .2s var(--ease),transform .2s var(--ease)}
.x-card--hover:hover{border-color:var(--line-2);box-shadow:var(--sh-2),inset 0 1px 0 rgba(255,255,255,.07);transform:translateY(-2px)}
.x-card--tint::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 0% 0%,rgba(34,211,238,.09),transparent 55%)}
.x-card__head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 0}
.x-card__title{margin:0;font-size:14.5px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
.x-card__sub{margin:5px 0 0;font-size:12.5px;color:var(--dim);line-height:1.6}
.x-card__body{padding:16px 20px 20px}
.x-card__head+.x-card__body{padding-top:14px}
.x-card__foot{padding:13px 20px;border-top:1px solid var(--line);background:rgba(0,0,0,.18);font-size:12.5px;color:var(--dim)}
.x-card__grow{flex:1}

/* --------------------------------------------------------------- button */
.x-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--ink);font:500 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;padding:0 15px;height:36px;border-radius:var(--r-sm);cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .16s var(--ease),border-color .16s var(--ease),transform .1s var(--ease),box-shadow .16s var(--ease)}
.x-btn:hover{background:var(--surface-3);border-color:rgba(255,255,255,.22)}
.x-btn:active{transform:translateY(1px)}
.x-btn:focus-visible{outline:none;box-shadow:var(--sh-glow);border-color:rgba(34,211,238,.5)}
.x-btn[disabled],.x-btn--disabled{opacity:.5;pointer-events:none}
.x-btn--primary{border-color:transparent;background:linear-gradient(135deg,#22d3ee,#a78bfa);color:#05070b;font-weight:650;box-shadow:0 6px 18px -10px rgba(34,211,238,.85)}
.x-btn--primary:hover{filter:brightness(1.07);background:linear-gradient(135deg,#22d3ee,#a78bfa)}
.x-btn--ghost{background:transparent;border-color:var(--line)}
.x-btn--danger{color:#fecdd3;border-color:rgba(251,113,133,.35);background:rgba(251,113,133,.1)}
.x-btn--danger:hover{background:rgba(251,113,133,.18);border-color:rgba(251,113,133,.5)}
.x-btn--sm{height:29px;padding:0 11px;font-size:12px;border-radius:8px}
.x-btn--block{width:100%}
.x-btn__icon{display:inline-flex;flex:none}
.x-btn__icon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}

/* ---------------------------------------------------------------- field */
.x-field{display:block;margin:0 0 14px}
.x-field__label{display:block;margin:0 0 7px;font-size:11.5px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.x-input,.x-select,.x-textarea{width:100%;border:1px solid var(--line-2);border-radius:var(--r-sm);background:rgba(0,0,0,.32);color:var(--ink);font:var(--field-fs)/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;padding:0 13px;height:40px;outline:none;transition:border-color .16s var(--ease),box-shadow .16s var(--ease),background .16s var(--ease)}
.x-textarea{height:auto;min-height:140px;padding:13px;font:var(--field-fs-mono)/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical}
.x-input::placeholder,.x-textarea::placeholder{color:var(--hint)}
.x-input:focus,.x-select:focus,.x-textarea:focus{border-color:rgba(34,211,238,.55);box-shadow:var(--sh-glow);background:rgba(0,0,0,.42)}
.x-field__hint{margin:7px 0 0;font-size:12px;color:var(--dim);line-height:1.55}
.x-field__hint code{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--ink-2);background:var(--surface-2);padding:1px 5px;border-radius:5px}
.x-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);cursor:pointer;user-select:none;white-space:nowrap}
.x-check input{width:15px;height:15px;accent-color:#22d3ee;cursor:pointer;margin:0}

/* --------------------------------------------------------------- picker */
/*
 * The native <select> popup is drawn by the OS: on Windows it is a white list
 * with its own font and padding, sitting on a near-black page. The closed
 * control can be styled, the open one cannot — so the control is redrawn and
 * the real select stays in the DOM (hidden, still holding the value) for form
 * submission and for anyone with JS disabled.
 */
.x-select-wrap{position:relative;display:inline-block;max-width:100%}
.x-select-native{width:100%;border:1px solid var(--line-2);border-radius:var(--r-sm);background:rgba(0,0,0,.32);color:var(--ink);font:var(--field-fs)/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;padding:0 13px;height:40px}
.x-select-wrap.is-enhanced .x-select-native{position:absolute;inset:0;opacity:0;pointer-events:none}
.x-select-wrap.is-enhanced .x-picker{display:inline-flex}
.x-picker{display:none;align-items:center;justify-content:space-between;gap:12px;min-width:150px;height:40px;padding:0 11px 0 13px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:rgba(0,0,0,.32);color:var(--ink);font:var(--field-fs)/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;cursor:pointer;text-align:left;transition:border-color .16s var(--ease),background .16s var(--ease),box-shadow .16s var(--ease)}
.x-picker:hover{border-color:rgba(255,255,255,.22);background:rgba(255,255,255,.05)}
.x-picker[aria-expanded="true"],.x-picker:focus-visible{outline:none;border-color:rgba(34,211,238,.55);box-shadow:var(--sh-glow);background:rgba(0,0,0,.45)}
.x-picker__value{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.x-picker__caret{width:14px;height:14px;flex:none;fill:none;stroke:var(--dim);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .18s var(--ease),stroke .18s var(--ease)}
.x-picker[aria-expanded="true"] .x-picker__caret{transform:rotate(180deg);stroke:#22d3ee}
.x-picker__menu{position:fixed;z-index:80;top:0;left:0;min-width:150px;max-height:280px;overflow:auto;padding:6px;border:1px solid var(--line-2);border-radius:12px;background:#0d1119;box-shadow:0 24px 48px -24px rgba(0,0,0,.95),0 2px 10px rgba(0,0,0,.45);animation:x-pop .14s var(--ease)}
.x-picker__menu[hidden]{display:none}
@keyframes x-pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.x-picker__option{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;border-radius:8px;font-size:13px;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.x-picker__option:hover,.x-picker__option.is-active{background:rgba(255,255,255,.07);color:var(--ink)}
.x-picker__option[aria-selected="true"]{color:var(--ink);background:rgba(34,211,238,.13)}
.x-picker__option[aria-selected="true"]::after{content:"";width:6px;height:6px;border-radius:50%;background:#22d3ee;flex:none}
@media (max-width:640px){.x-picker__menu{min-width:190px}}
@media (prefers-reduced-motion:reduce){.x-picker__menu{animation:none}.x-picker__caret{transition:none}}

/* ---------------------------------------------------------------- badge */
.x-badge{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font:500 11.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.01em;border:1px solid transparent;white-space:nowrap}
.x-badge--ok{color:#6ee7b7;background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.28)}
.x-badge--off{color:#9aa1b3;background:rgba(255,255,255,.055);border-color:var(--line)}
.x-badge--warn{color:#fcd34d;background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.28)}
.x-badge--danger{color:#fda4af;background:rgba(251,113,133,.12);border-color:rgba(251,113,133,.28)}
.x-badge--info{color:#93c5fd;background:rgba(96,165,250,.12);border-color:rgba(96,165,250,.28)}
.x-badge--accent{color:#a5f3fc;background:rgba(34,211,238,.12);border-color:rgba(34,211,238,.3)}
.x-dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:none}
.x-dot--ok{background:var(--ok);box-shadow:0 0 0 3px rgba(52,211,153,.15)}
.x-dot--off{background:#4b5162}
.x-dot--warn{background:var(--warn);box-shadow:0 0 0 3px rgba(251,191,36,.15)}
.x-dot--danger{background:var(--danger);box-shadow:0 0 0 3px rgba(251,113,133,.15)}

/* --------------------------------------------------------------- notice */
.x-notice{display:flex;gap:11px;padding:13px 15px;border:1px solid var(--line);border-left:3px solid var(--dim);border-radius:var(--r);background:var(--surface);font-size:13px;line-height:1.6;color:var(--ink-2)}
.x-notice b{color:var(--ink);font-weight:600}
.x-notice code{font-family:ui-monospace,monospace;font-size:12px;color:var(--ink);background:rgba(0,0,0,.35);padding:1px 5px;border-radius:5px}
.x-notice--info{border-left-color:var(--info);background:rgba(96,165,250,.07)}
.x-notice--ok{border-left-color:var(--ok);background:rgba(52,211,153,.07)}
.x-notice--warn{border-left-color:var(--warn);background:rgba(251,191,36,.07)}
.x-notice--danger{border-left-color:var(--danger);background:rgba(251,113,133,.08)}
.x-notice__icon{flex:none;width:17px;height:17px;margin-top:1px;opacity:.85}
.x-notice__icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.x-notice--info .x-notice__icon{color:var(--info)}
.x-notice--ok .x-notice__icon{color:var(--ok)}
.x-notice--warn .x-notice__icon{color:var(--warn)}
.x-notice--danger .x-notice__icon{color:var(--danger)}

/* ---------------------------------------------------------------- empty */
.x-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:46px 24px;border:1px dashed var(--line-2);border-radius:var(--r-lg);background:rgba(255,255,255,.012)}
.x-empty__icon{width:42px;height:42px;margin:0 0 14px;opacity:.55}
.x-empty__icon svg{width:100%;height:100%;fill:none;stroke:var(--ink-2);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.x-empty__title{margin:0 0 7px;font-size:15px;font-weight:600;color:var(--ink)}
.x-empty__desc{margin:0;max-width:46ch;font-size:13px;color:var(--dim);line-height:1.65}
.x-empty__action{margin-top:18px}

/* ---------------------------------------------------------------- stats */
.x-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px}
.x-stat{position:relative;padding:15px 16px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface);overflow:hidden}
.x-stat::after{content:"";position:absolute;right:-30px;top:-30px;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle,rgba(34,211,238,.16),transparent 70%)}
.x-stat__value{display:block;font-size:24px;font-weight:650;letter-spacing:-.03em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums}
.x-stat__label{display:block;margin-top:5px;font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)}
.x-stat__hint{display:block;margin-top:8px;font-size:12px;color:var(--ink-2)}

/* ---------------------------------------------------------------- table */
/*
 * The wrapper scrolls on both axes. An overflow-x of auto alone would compute
 * the vertical axis to auto as well (CSS turns a visible axis into auto when
 * the other one is scrollable), which made the wrapper a scroll container
 * with no vertical overflow — so the sticky header never had anything to
 * stick against and drifted away with the page.
 */
.x-table-wrap{overflow:auto;max-height:min(70vh,620px);border:1px solid var(--line);border-radius:var(--r-lg);background:rgba(0,0,0,.16)}
.x-table{width:100%;border-collapse:collapse;font-size:13.5px}
.x-table th{position:sticky;top:0;z-index:2;text-align:left;font-weight:500;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);padding:12px 14px;background:#0d0f16;border-bottom:1px solid var(--line);white-space:nowrap}
.x-table td{padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.045);vertical-align:middle;color:var(--ink-2)}
.x-table tbody tr:last-child td{border-bottom:0}
.x-table tbody tr{transition:background .14s var(--ease)}
.x-table tbody tr:hover{background:rgba(255,255,255,.028)}
.x-table b{color:var(--ink);font-weight:600}
.x-table code{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--dim);background:var(--surface-2);padding:2px 6px;border-radius:5px}
.x-table a{color:var(--cyan);text-decoration:none}
.x-table a:hover{text-decoration:underline}
.x-trunc{display:block;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dim);font-size:12.5px}
.x-num{font-variant-numeric:tabular-nums;color:var(--ink)}
@media (max-width:640px){.x-trunc{max-width:140px}}
.x-table__muted{color:var(--dim);font-size:12px;margin-top:2px}

/* ----------------------------------------------------------------- code */
.x-code{margin:0;border:1px solid var(--line);border-radius:var(--r);background:rgba(0,0,0,.42);overflow:auto;max-height:60vh}
.x-code__head{display:flex;align-items:center;gap:8px;padding:9px 14px;border-bottom:1px solid var(--line);font:11px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);background:rgba(255,255,255,.022)}
.x-code pre{margin:0;padding:15px;font:12.5px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd6e6;white-space:pre-wrap;word-break:break-word}
.x-code--tight pre{padding:11px 13px;font-size:12px}
.paste-body{margin:0;padding:16px;border:1px solid var(--line);border-radius:var(--r);background:rgba(0,0,0,.35);font:13px/1.7 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd6e6;white-space:pre-wrap;word-break:break-word;max-height:64vh;overflow:auto}

/* --------------------------------------------------------------- layout */
main.wide{max-width:1120px}
.x-split{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:760px){.x-split{grid-template-columns:1fr}}
.x-stack{display:flex;flex-direction:column;gap:16px}
.x-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.x-row--between{justify-content:space-between}
.x-row .x-field{margin:0}
.x-row .x-field .x-input,.x-row .x-field .x-select{width:auto;min-width:120px}
.x-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(252px,1fr))}
.x-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 14px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.x-toolbar__spacer{flex:1}
.x-section{margin:0 0 26px}
.x-section__head{display:flex;align-items:baseline;gap:10px;margin:0 0 12px;flex-wrap:wrap}
.x-section__title{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em;color:var(--ink)}
.x-section__desc{margin:0;font-size:12.5px;color:var(--dim)}
.x-divider{height:1px;background:var(--line);border:0;margin:22px 0}
.x-kbd{font:11px/1 ui-monospace,monospace;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line-2);border-bottom-width:2px;border-radius:6px;padding:3px 6px}
.x-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.x-muted{color:var(--dim)}
.x-sep{width:1px;height:16px;background:var(--line);flex:none}

/* --------------------------------------------------------------- login */
.x-login{max-width:392px;margin:7vh auto 0}
.x-login .x-card__body{padding-top:20px}
.x-login__mark{width:46px;height:46px;margin:0 0 16px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(34,211,238,.9),rgba(167,139,250,.9));color:#05070b;box-shadow:0 10px 26px -12px rgba(34,211,238,.8)}
.x-login__mark svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.x-login__title{margin:0 0 6px;font-size:19px;font-weight:650;letter-spacing:-.02em}
.x-login__desc{margin:0 0 20px;font-size:13px;color:var(--dim);line-height:1.6}

/* ----------------------------------------------------------------- meter */
.x-meter{height:6px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden;min-width:70px}
.x-meter>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--cyan),var(--violet));transition:width .4s var(--ease)}
.x-meter--warn>span{background:linear-gradient(90deg,#fbbf24,#fb923c)}
.x-meter--danger>span{background:linear-gradient(90deg,#fb7185,#ef4444)}
.x-meter--off>span{background:rgba(255,255,255,.18)}
.x-meter-row{display:flex;align-items:center;gap:10px}
.x-meter-row .x-meter{flex:1}
.x-meter-row span.pct{font-size:11.5px;color:var(--dim);font-variant-numeric:tabular-nums;min-width:38px;text-align:right}

/* ------------------------------------------------------------------ tabs */
.x-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 18px}
.x-tab{appearance:none;border:1px solid var(--line);background:var(--surface);color:var(--dim);padding:8px 14px;border-radius:var(--r-sm);font:500 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;cursor:pointer;transition:color .16s var(--ease),border-color .16s var(--ease),background .16s var(--ease)}
.x-tab:hover{color:var(--ink-2);border-color:var(--line-2)}
.x-tab--on{color:var(--ink);border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.1);box-shadow:0 0 0 3px rgba(34,211,238,.06)}

/* --------------------------------------------------------------- console */
.x-console{margin:0;min-height:130px;max-height:420px;overflow:auto;padding:15px;border:1px solid var(--line);border-radius:var(--r);background:rgba(0,0,0,.42);font:12.5px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd6e6;white-space:pre-wrap;word-break:break-word}
.x-console:empty::before{content:"输出会显示在这里";color:var(--hint)}
.x-schema{display:flex;flex-direction:column;gap:2px}
.x-schema__row{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.x-schema__row:last-child{border-bottom:0}
.x-schema__row b{font-family:ui-monospace,monospace;color:var(--cyan);font-weight:500;font-size:12.5px}
.x-schema__cols{margin-top:5px;color:var(--dim);font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-word;line-height:1.7}

/* -------------------------------------------------------------- dropzone */
.x-drop{border:1.5px dashed rgba(255,255,255,.2);border-radius:var(--r-lg);padding:40px 20px;text-align:center;cursor:pointer;background:rgba(255,255,255,.012);transition:border-color .18s var(--ease),background .18s var(--ease)}
.x-drop:hover{border-color:rgba(34,211,238,.4);background:rgba(34,211,238,.035)}
.x-drop--hot{border-color:rgba(34,211,238,.65);background:rgba(34,211,238,.07)}
.x-drop__title{margin:0 0 7px;font-size:14px;color:var(--ink);font-weight:600}
.x-drop__hint{margin:0;font-size:12.5px;color:var(--dim)}

/* -------------------------------------------------------------- linkbox */
.x-result{margin-top:16px;padding:15px 16px;border:1px solid rgba(34,211,238,.28);border-radius:var(--r);background:rgba(34,211,238,.055);animation:x-fade .28s var(--ease) both}
.x-result[hidden]{display:none}
.x-result__label{margin:0 0 10px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);font-weight:600}
.x-linkbox{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.x-linkbox .x-input{flex:1;min-width:200px;height:36px;font:var(--field-fs-mono)/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:rgba(0,0,0,.42)}

/* ----------------------------------------------------------------- chat */
.x-chat{border:1px solid var(--line);border-radius:var(--r-lg);background:rgba(0,0,0,.2);overflow:hidden;box-shadow:var(--sh-1),inset 0 1px 0 rgba(255,255,255,.04)}
.x-chat__log{height:min(46vh,340px);overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}
.x-chat__msg{font-size:13.5px;line-height:1.6;word-break:break-word;color:var(--ink)}
.x-chat__msg--sys{color:var(--dim);font-size:12.5px;font-family:ui-monospace,monospace}
.x-chat__msg .who{color:var(--cyan);font-family:ui-monospace,monospace;font-size:11.5px;margin-right:8px}
.x-chat__form{display:flex;gap:10px;padding:12px;border-top:1px solid var(--line);background:rgba(0,0,0,.26)}
.x-chat__form .x-input{flex:1;height:38px}
.x-chat__form .x-btn{height:38px}
/* Textarea variant: grows with the message instead of scrolling a 38px slot. */
.x-chat__form .x-chat__textarea{height:auto;min-height:38px;max-height:132px;padding:9px 12px;line-height:1.55;resize:none;font-family:inherit}
.x-chat__form .x-chat__textarea:disabled{height:38px}
/* On a touch screen the chat row is the primary control and 38px is under the
   40px floor the layout probe enforces; grow it to the shared --tap size. */
@media (pointer:coarse){
  .x-chat__form .x-input,.x-chat__form .x-btn{height:auto;min-height:var(--tap)}
  .x-chat__form .x-chat__textarea{min-height:var(--tap);max-height:160px}
}

/* --------------------------------------------------------------- display */
.x-display{margin:0}
.x-display__value{display:block;font-size:clamp(46px,11vw,82px);font-weight:650;letter-spacing:-.045em;line-height:1.02;background:linear-gradient(96deg,var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.x-display__label{display:block;margin-top:11px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.x-display--sm .x-display__value{font-size:clamp(28px,6vw,40px)}

/* -------------------------------------------------------------- tool card */
/* One markup, two densities. The data-view attribute on the container
   re-maps the named areas: card = icon/state on top, title, desc, tags;
   list = a single row. */
.x-tool-card{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"icon . state" "main main main" "foot foot foot";gap:10px 8px;height:100%;padding:15px 16px 14px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(180deg,rgba(255,255,255,.038),rgba(255,255,255,.014));color:inherit;text-decoration:none;position:relative;overflow:hidden;box-shadow:var(--sh-1),inset 0 1px 0 rgba(255,255,255,.05);transition:border-color .18s var(--ease),box-shadow .2s var(--ease),transform .18s var(--ease),background .18s var(--ease)}
.x-tool-card__icon{grid-area:icon;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--cyan);background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.18)}
.x-tool-card__icon svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.x-tool-card__state{grid-area:state;align-self:center;justify-self:end}
.x-tool-card__main{grid-area:main;min-width:0}
.x-tool-card__title{margin:0;font-size:14.5px;font-weight:600;letter-spacing:-.005em;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.x-tool-card__desc{margin:4px 0 0;font-size:12.5px;line-height:1.55;color:var(--dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.x-tool-card__foot{grid-area:foot;display:flex;align-items:center;gap:8px;min-width:0;margin-top:2px}
.x-tool-card__arrow{margin-left:auto;color:var(--dim);font-size:13px;flex:none;transition:transform .18s var(--ease),color .18s var(--ease)}
.x-tool-card:hover{border-color:rgba(34,211,238,.38);box-shadow:var(--sh-2),inset 0 1px 0 rgba(255,255,255,.07);transform:translateY(-2px)}
.x-tool-card:hover .x-tool-card__arrow{transform:translateX(3px);color:var(--cyan)}
.x-tool-card:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.x-tool-card--soon{opacity:.68}
.x-tool-card--soon:hover{opacity:.86;transform:none;border-color:var(--line-2);box-shadow:var(--sh-1)}
.x-tool-card--soon .x-tool-card__arrow{display:none}
.x-tool-card.hidden{display:none}

/* list density — the same nodes, reflowed. Turning cards into rows on mobile
   roughly doubles how many tools fit above the fold, which is the whole point
   of the view toggle when the catalog passes 100. */
[data-view="list"] .x-tool-card{grid-template-columns:auto 1fr auto auto;grid-template-areas:"icon main foot state";align-items:center;gap:11px;height:auto;padding:9px 12px;border-radius:11px;background:var(--surface)}
[data-view="list"] .x-tool-card__icon{width:26px;height:26px;border-radius:7px}
[data-view="list"] .x-tool-card__icon svg{width:14px;height:14px}
[data-view="list"] .x-tool-card__title{font-size:13.5px;font-weight:550}
[data-view="list"] .x-tool-card__desc{margin:0;font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-view="list"] .x-tool-card__foot{margin:0;order:0}
[data-view="list"] .x-tool-card__foot .x-tag-list{display:none}
[data-view="list"] .x-tool-card__arrow{display:none}
[data-view="list"] .x-tool-card__state{align-self:center}
[data-view="list"] .x-tool-card:hover{transform:none}
[data-view="list"]{gap:7px!important}

/* -------------------------------------------------------------------- tag */
.x-tag{display:inline-flex;align-items:center;height:21px;padding:0 7px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--dim);font:500 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;max-width:96px;overflow:hidden;text-overflow:ellipsis}
.x-tag--more{color:var(--ink-2);background:var(--surface-2)}
.x-tag-list{display:flex;gap:6px;flex-wrap:nowrap;overflow:hidden;min-width:0}

/* ----------------------------------------------------------------- chips */
.x-chips{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:1px 0}
.x-chips::-webkit-scrollbar{display:none}
.x-chip{appearance:none;flex:none;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:var(--surface);color:var(--ink-2);font:500 12.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;cursor:pointer;white-space:nowrap;transition:color .16s var(--ease),border-color .16s var(--ease),background .16s var(--ease)}
.x-chip:hover{color:var(--ink);border-color:var(--line-2);background:var(--surface-2)}
.x-chip:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
.x-chip--on{color:#a5f3fc;border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.12)}
.x-chip__count{margin-left:2px;font:500 11px/1 ui-monospace,monospace;color:var(--dim);font-variant-numeric:tabular-nums}
.x-chip--on .x-chip__count{color:rgba(165,243,252,.75)}
/* A category the current search emptied: still clickable, but clearly empty. */
.x-chip--empty{opacity:.45}
.x-chip--empty .x-chip__count{color:#f09595}

/* --------------------------------------------------------- catalog layout */
.x-catalog-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px}
.x-catalog-bar .x-search{flex:1;min-width:200px;position:relative}
.x-catalog-bar .x-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:15px;height:15px;fill:none;stroke:var(--dim);stroke-width:1.9;stroke-linecap:round;pointer-events:none}
.x-catalog-bar .x-search input{width:100%;height:38px;padding:0 13px 0 36px;border:1px solid var(--line-2);border-radius:var(--r-sm);background:rgba(0,0,0,.3);color:var(--ink);font-size:var(--field-fs);outline:none;transition:border-color .16s var(--ease),box-shadow .16s var(--ease)}
.x-catalog-bar .x-search input:focus{border-color:rgba(34,211,238,.55);box-shadow:var(--sh-glow)}
.x-catalog-bar .x-search input::placeholder{color:var(--hint)}
.x-view-toggle{display:inline-flex;gap:2px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--surface);flex:none}
.x-view-toggle button{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:var(--dim);font:500 12px/1 inherit;cursor:pointer;transition:background .14s var(--ease),color .14s var(--ease)}
.x-view-toggle button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.x-view-toggle button:hover{color:var(--ink-2)}
.x-view-toggle button[aria-pressed="true"]{background:var(--surface-3);color:var(--ink)}
.x-view-toggle button:focus-visible{outline:2px solid var(--cyan);outline-offset:1px}
.x-result-count{font:500 12px/1 ui-monospace,monospace;color:var(--dim);font-variant-numeric:tabular-nums;white-space:nowrap}

/* ---------------------------------------------------------------- helpers */
.x-fade{animation:x-fade .32s var(--ease) both}
@keyframes x-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:640px){
  .x-stats{grid-template-columns:repeat(auto-fit,minmax(126px,1fr))}
  .x-card__head{padding:15px 15px 0}.x-card__body{padding:14px 15px 16px}
  .x-section{margin-bottom:22px}
  .x-top__inner{padding:0 16px}
  .x-tool-card{padding:14px}
  .x-tool-row__desc{display:none}
  .x-tool-row__name{max-width:58%}
  .x-catalog-bar .x-search input{height:var(--tap)}
  .x-chip{height:var(--tap);padding:0 14px}
  .x-table-wrap{border-radius:var(--r)}
  .x-table th,.x-table td{padding:10px 11px;font-size:12.5px}
  .x-code pre,.x-console{font-size:12px}
  .x-drop{padding:28px 16px}
  .x-login{margin-top:4vh}
}
@media (pointer:coarse){
  .x-btn,.x-btn--sm{height:var(--tap);padding:0 16px}
  .x-tab,.x-chip,.x-view-toggle button{height:var(--tap)}
  .x-back{height:var(--tap)}
  .x-input,.x-select{height:var(--tap)}
  .x-check{min-height:var(--tap)}
  .x-check input{width:20px;height:20px}
  .x-top__inner{height:64px}
}
/*
 * iOS zooms the whole page when a focused field renders under 16px, and the
 * zoom never resets on blur — the user is left staring at a magnified page.
 * The coarse-pointer rule alone does not cover it: an iPad with a trackpad
 * reports a fine pointer, and its 768px portrait width sits above the 640px
 * phone breakpoint. Width is therefore a second, independent trigger.
 */
@media (max-width:1024px),(pointer:coarse){
  :root{--field-fs:16px;--field-fs-mono:16px}
}
/*
 * Rendered markdown. One stylesheet for every surface that shows a document:
 * the /md share page, the room chat, and the live preview on the editor. They
 * must look identical or the "same module, three callers" claim is a lie.
 *
 * Chat bubbles override the scale at the bottom — a 26px heading inside a
 * 340px-tall scrollback is unusable, so the hierarchy collapses there.
 */
.md{font-size:15px;line-height:1.72;color:var(--ink);overflow-wrap:break-word}
.md>*:first-child{margin-top:0}
.md>*:last-child{margin-bottom:0}
.md h1,.md h2,.md h3,.md h4,.md h5,.md h6{margin:28px 0 12px;font-weight:600;line-height:1.3;letter-spacing:-.01em}
.md h1{font-size:26px}
.md h2{font-size:21px;padding-bottom:7px;border-bottom:1px solid var(--line)}
.md h3{font-size:17.5px}
.md h4{font-size:15.5px}
.md h5,.md h6{font-size:14px;color:var(--ink-2)}
.md p{margin:0 0 15px}
.md a{color:var(--cyan);text-decoration:none;border-bottom:1px solid rgba(34,211,238,.35);transition:border-color .15s var(--ease)}
.md a:hover{border-bottom-color:var(--cyan)}
.md strong{font-weight:600;color:#fff}
.md em{font-style:italic}
.md del{color:var(--dim)}
/* .md-inert marks a link whose scheme was refused: visible, unclickable. */
.md-inert{color:var(--dim);word-break:break-all}
.md code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em;background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:.1em .36em;color:var(--ink)}
.md pre.md-code{position:relative;margin:0 0 16px;padding:15px 16px;background:rgba(0,0,0,.42);border:1px solid var(--line);border-radius:var(--r);overflow-x:auto;line-height:1.62}
.md pre.md-code code{background:none;border:none;padding:0;font-size:12.8px;color:#dfe3ee}
.md pre.md-code[data-lang]::before{content:attr(data-lang);position:absolute;top:9px;right:12px;font-family:ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
.md blockquote{margin:0 0 16px;padding:2px 0 2px 16px;border-left:2px solid var(--line-2);color:var(--ink-2)}
.md blockquote>*:last-child{margin-bottom:0}
.md ul,.md ol{margin:0 0 15px;padding-left:1.4em}
.md li{margin:4px 0}
.md li>ul,.md li>ol{margin:4px 0}
.md li input[type=checkbox]{margin-right:6px;vertical-align:middle;accent-color:var(--cyan)}
.md hr{height:1px;border:0;background:var(--line-2);margin:24px 0}
/* Tables scroll on their own: a wide table must not widen the page. */
.md-table{margin:0 0 16px;overflow-x:auto;border:1px solid var(--line);border-radius:var(--r)}
.md table{border-collapse:collapse;width:100%;font-size:13.5px}
.md th,.md td{padding:9px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.md th{background:var(--surface-2);font-weight:600;font-size:12.5px;color:var(--ink-2);white-space:nowrap}
.md tr:last-child td{border-bottom:0}
.x-chat__msg .md{font-size:13.5px;line-height:1.62}
.x-chat__msg .md h1,.x-chat__msg .md h2,.x-chat__msg .md h3,.x-chat__msg .md h4{font-size:14.5px;margin:12px 0 6px;padding-bottom:0;border-bottom:0}
.x-chat__msg .md p{margin:0 0 8px}
.x-chat__msg .md ul,.x-chat__msg .md ol{margin:0 0 8px}
.x-chat__msg .md pre.md-code{margin:0 0 8px;padding:9px 11px}
.x-chat__msg .md pre.md-code code{font-size:12px}
.x-chat__msg .md blockquote{margin:0 0 8px}

@media (prefers-reduced-motion:reduce){
  .x-fade{animation:none}
  .x-card,.x-btn,.x-tool-card,.x-tool-row,.x-back{transition:none}
  .x-card--hover:hover,.x-tool-card:hover{transform:none}
  .x-tool-card:hover .x-tool-card__arrow{transform:none}
}
`;

/** Everything the shell injects, in cascade order. */
export const BASE_CSS = TOKENS + COMPONENTS;
