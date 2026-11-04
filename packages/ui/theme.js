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
  --line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.15);
  --surface:rgba(255,255,255,.028);--surface-2:rgba(255,255,255,.052);--surface-3:rgba(255,255,255,.08);
  --cyan:#22d3ee;--violet:#a78bfa;--pink:#f472b6;--ok:#34d399;--warn:#fbbf24;--danger:#fb7185;--info:#60a5fa;
  --r-sm:9px;--r:13px;--r-lg:19px;
  --sh-1:0 1px 2px rgba(0,0,0,.35);
  --sh-2:0 10px 30px -14px rgba(0,0,0,.75);
  --sh-glow:0 0 0 4px rgba(34,211,238,.1);
  --ease:cubic-bezier(.4,0,.2,1);
}
`;

export const COMPONENTS = String.raw`
/* ---------------------------------------------------------------- card */
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
.x-input,.x-select,.x-textarea{width:100%;border:1px solid var(--line-2);border-radius:var(--r-sm);background:rgba(0,0,0,.32);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;padding:0 13px;height:40px;outline:none;transition:border-color .16s var(--ease),box-shadow .16s var(--ease),background .16s var(--ease)}
.x-textarea{height:auto;min-height:140px;padding:13px;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;resize:vertical}
.x-input::placeholder,.x-textarea::placeholder{color:#5f6678}
.x-input:focus,.x-select:focus,.x-textarea:focus{border-color:rgba(34,211,238,.55);box-shadow:var(--sh-glow);background:rgba(0,0,0,.42)}
.x-field__hint{margin:7px 0 0;font-size:12px;color:var(--dim);line-height:1.55}
.x-field__hint code{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--ink-2);background:var(--surface-2);padding:1px 5px;border-radius:5px}
.x-check{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);cursor:pointer;user-select:none;white-space:nowrap}
.x-check input{width:15px;height:15px;accent-color:#22d3ee;cursor:pointer;margin:0}

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
.x-table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--r-lg);background:rgba(0,0,0,.16)}
.x-table{width:100%;border-collapse:collapse;font-size:13.5px}
.x-table th{position:sticky;top:0;text-align:left;font-weight:500;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);padding:12px 14px;background:rgba(255,255,255,.028);border-bottom:1px solid var(--line);white-space:nowrap}
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
.x-tab--on,.x-tab.on{color:var(--ink);border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.1);box-shadow:0 0 0 3px rgba(34,211,238,.06)}

/* --------------------------------------------------------------- console */
.x-console{margin:0;min-height:130px;max-height:420px;overflow:auto;padding:15px;border:1px solid var(--line);border-radius:var(--r);background:rgba(0,0,0,.42);font:12.5px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cfd6e6;white-space:pre-wrap;word-break:break-word}
.x-console:empty::before{content:"输出会显示在这里";color:#4b5162}
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
.x-linkbox .x-input{flex:1;min-width:200px;height:36px;font:12.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:rgba(0,0,0,.42)}

/* ----------------------------------------------------------------- chat */
.x-chat{border:1px solid var(--line);border-radius:var(--r-lg);background:rgba(0,0,0,.2);overflow:hidden;box-shadow:var(--sh-1),inset 0 1px 0 rgba(255,255,255,.04)}
.x-chat__log{height:min(46vh,340px);overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}
.x-chat__msg{font-size:13.5px;line-height:1.6;word-break:break-word;color:var(--ink)}
.x-chat__msg--sys{color:var(--dim);font-size:12.5px;font-family:ui-monospace,monospace}
.x-chat__msg .who{color:var(--cyan);font-family:ui-monospace,monospace;font-size:11.5px;margin-right:8px}
.x-chat__form{display:flex;gap:10px;padding:12px;border-top:1px solid var(--line);background:rgba(0,0,0,.26)}
.x-chat__form .x-input{flex:1;height:38px}
.x-chat__form .x-btn{height:38px}

/* --------------------------------------------------------------- display */
.x-display{margin:0}
.x-display__value{display:block;font-size:clamp(46px,11vw,82px);font-weight:650;letter-spacing:-.045em;line-height:1.02;background:linear-gradient(96deg,var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.x-display__label{display:block;margin-top:11px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.x-display--sm .x-display__value{font-size:clamp(28px,6vw,40px)}

/* --------------------------------------------------------------- helpers */
.x-fade{animation:x-fade .32s var(--ease) both}
@keyframes x-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (max-width:640px){
  .x-stats{grid-template-columns:repeat(auto-fit,minmax(126px,1fr))}
  .x-card__head{padding:15px 15px 0}.x-card__body{padding:14px 15px 16px}
  .x-section{margin-bottom:22px}
}
@media (prefers-reduced-motion:reduce){
  .x-fade{animation:none}
  .x-card,.x-btn{transition:none}
  .x-card--hover:hover{transform:none}
}
`;

/** Everything the shell injects, in cascade order. */
export const BASE_CSS = TOKENS + COMPONENTS;
