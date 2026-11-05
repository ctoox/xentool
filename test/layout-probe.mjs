/**
 * Layout and interaction probe — the automated half of "does it work on a
 * phone".
 *
 * A screenshot shows what a page looks like but cannot tell you that the page
 * scrolls sideways at 320px, that a tap target is 18px tall, or that a control
 * has no accessible name. Those failures survive visual review and reach a
 * real user, so they get measured instead.
 *
 * Usage:
 *   npx wrangler dev --port 8799          # in one shell
 *   node test/layout-probe.mjs             # in another
 *
 * Exits non-zero when a hard failure is found, so it can gate a deploy.
 * Requires Edge/Chrome on PATH with --remote-debugging-port support; it
 * starts its own browser instance on port 9222.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8799";
const CDP_PORT = 9222;
const PROFILE = ".shots/cdp-profile";

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, touch: false, ios: false },
  // 768px is the iPad portrait width. Touch emulation stays off on purpose: an
  // iPad with a trackpad reports pointer:fine, so the coarse-pointer rules
  // must not be what saves it — the width rules have to. `ios` marks that this
  // viewport is still an iOS device, where a sub-16px field zooms the page.
  { name: "tablet", width: 768, height: 900, touch: false, ios: true },
  { name: "phone", width: 375, height: 780, touch: true, ios: true },
  { name: "small", width: 320, height: 700, touch: true, ios: true },
];

const PAGES = [
  { name: "portal", path: "/" },
  { name: "workbench", path: "/tools" },
  { name: "paste", path: "/paste/" },
  { name: "md", path: "/md/" },
  { name: "room", path: "/room/" },
  { name: "short", path: "/s/" },
  { name: "status", path: "/status/" },
  { name: "ai", path: "/ai/" },
  { name: "file", path: "/file/" },
];

/**
 * Measure one page.
 *
 * The size floor is 40px rather than 44: it is a deliberate compromise. The
 * WCAG 2.2 "Target Size (Minimum)" success criterion asks for 24×24, and
 * 44px is the Material/Apple comfort figure. Flagging everything under 44
 * on desktop would report every 36px button as a defect, so the probe reports
 * what it finds and the reader decides: on touch viewports it is a real
 * problem, on pointer devices 36px is normal.
 */
const PROBE = `(() => {
  const out = { overflowX: 0, offenders: [], smallTargets: [], nameless: [], smallInputs: [] };
  out.overflowX = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

  const scrollers = Array.from(document.querySelectorAll('*')).filter((el) => {
    const s = getComputedStyle(el);
    return (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
  });
  // Decorative background blobs live in a fixed, overflow-hidden container.
  const decorative = Array.from(document.querySelectorAll('.aura, .aura *'));
  const ignorable = (el) =>
    decorative.includes(el) || decorative.some((d) => d !== el && d.contains(el));

  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > window.innerWidth + 1 && !ignorable(el) && !scrollers.some((s) => s !== el && s.contains(el))) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      const sel = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
      if (out.offenders.length < 6 && !out.offenders.some((o) => o.sel === sel)) {
        out.offenders.push({ sel, right: Math.round(r.right) });
      }
    }
  });

  document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="option"]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return;

    // A checkbox is 20px but its label is the real target — measure the label
    // when the input sits inside one, otherwise the checkbox itself.
    const isBox = el.tagName === 'INPUT' && el.type === 'checkbox';
    const target = isBox && el.closest('label') ? el.closest('label') : el;
    const tr = target.getBoundingClientRect();
    if (tr.height < 40) {
      const cls = typeof target.className === 'string' ? target.className.trim().split(/\\s+/)[0] : '';
      const key = target.tagName.toLowerCase() + (cls ? '.' + cls : '') + ':' + Math.round(tr.height);
      if (!out.smallTargets.some((t) => t.key === key)) {
        out.smallTargets.push({ key, h: Math.round(tr.height), w: Math.round(tr.width), text: (target.textContent || '').trim().slice(0, 16) });
      }
    }

    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && !(el.textContent || '').trim()) {
      if (!el.getAttribute('aria-label') && !el.getAttribute('title')) {
        const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '';
        const sel = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
        if (!out.nameless.some((b) => b.sel === sel)) out.nameless.push({ sel });
      }
    }
  });

  // iOS Safari zooms the page when a focused field is under 16px.
  document.querySelectorAll('input:not([type=checkbox]), textarea, select').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size && size < 16) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '';
      const sel = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
      if (!out.smallInputs.some((t) => t.sel === sel)) out.smallInputs.push({ sel, size });
    }
  });

  /*
   * The picker's rows only exist after the menu is opened (shell.js portals it
   * to <body>), so the runner clicks the trigger first. They are recorded
   * separately from smallTargets on purpose: a passing 44px row appears in no
   * offender list, and "the probe measured the rows at all" is exactly the
   * thing that used to be unverified.
   *
   * Zero heights are dropped rather than reported: a page with several pickers
   * only has one menu open, so the closed ones would print as 「44/0px」 and
   * read like a collapsed row. 「count」 stays the total found, which is what
   * tells "nothing to measure" apart from "laid out at zero height" — an empty
   * heights array next to a positive count is the blindness signal the runner
   * keys off, and it is why the count itself can never be the test.
   */
  const rows = Array.from(document.querySelectorAll('.x-picker__option'));
  out.pickerRows = {
    count: rows.length,
    heights: Array.from(new Set(rows.map((el) => Math.round(el.getBoundingClientRect().height)).filter((h) => h > 0))),
    font: rows.length ? parseFloat(getComputedStyle(rows[0]).fontSize) : 0,
  };

  out.cards = document.querySelectorAll('.x-tool-card').length;
  return out;
})()`;

function findBrowser() {
  return BROWSERS.find((p) => existsSync(p));
}

/**
 * Open the first picker whose trigger is actually rendered.
 *
 * shell.js only draws the button once it has enhanced the native select, so a
 * page without JS (or one whose script failed) has no visible trigger and
 * nothing to open. Clicking a hidden button would measure nothing while
 * looking like it measured something.
 */
const OPEN_PICKER = `(() => {
  const triggers = Array.from(document.querySelectorAll('.x-picker'));
  const trigger = triggers.find((el) => el.offsetParent !== null);
  if (!trigger) return false;
  trigger.click();
  return true;
})()`;

/**
 * Wait until the browser is actually showing the page we asked for.
 *
 * A fixed sleep was enough on a warm profile and quietly wrong on a cold one:
 * `Page.navigate` returns before the new document commits, so 1300ms could
 * elapse on the *previous* page. The measurements then describe controls that
 * do not exist on the page under test — which reads as a false failure for a
 * third-party widget, and can hide a real one just as easily. Checking the
 * pathname as well as readyState is what makes "loaded" mean "this document".
 */
async function waitForPage(send, pathname, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let seen = "";
  while (Date.now() < deadline) {
    const r = await send("Runtime.evaluate", {
      expression: "location.pathname + '|' + document.readyState",
      returnByValue: true,
    });
    seen = r && r.result ? String(r.result.value) : "";
    if (seen.startsWith(pathname + "|") && seen.endsWith("|complete")) {
      // One more tick for the inline picker script and its first layout pass.
      await sleep(120);
      return { ok: true, seen };
    }
    await sleep(100);
  }
  return { ok: false, seen };
}

async function connect() {
  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
  const target = list.find((t) => t.type === "page");
  if (!target) throw new Error("no page target");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      /*
       * Every call carries a deadline. A navigation tears down the execution
       * context, so an evaluate that was in flight at that moment never gets
       * an answer; without this the run hangs on an unsettled promise and Node
       * exits with a code that looks like a failure but prints no assertion.
       */
      const timer = setTimeout(() => {
        if (pending.has(mid)) {
          pending.delete(mid);
          reject(new Error(`CDP ${method} timed out`));
        }
      }, 30000);
      pending.set(mid, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { send, close: () => ws.close() };
}

const browser = findBrowser();
if (!browser) {
  console.error("找不到 Edge 或 Chrome，跳过布局探测。");
  process.exit(0);
}
if (!existsSync(PROFILE)) mkdirSync(PROFILE, { recursive: true });

const child = spawn(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--remote-debugging-port=" + CDP_PORT,
    "--user-data-dir=" + PROFILE,
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
);

let client;
try {
  for (let i = 0; i < 25; i++) {
    try {
      client = await connect();
      break;
    } catch {
      await sleep(400);
    }
  }
  if (!client) throw new Error("无法连接浏览器调试端口");

  const hard = [];
  const soft = [];
  const { send } = client;

  await send("Page.enable");
  await send("Runtime.enable");
  // The browser caches pages between runs, so a fix on the server can look
  // unapplied. Bypass the cache to make the measurement describe the code
  // that is actually running now.
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });

  for (const vp of VIEWPORTS) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.touch,
    });
    if (vp.touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

    for (const page of PAGES) {
      await send("Page.navigate", { url: BASE + page.path });
      /*
       * Poll for the document we asked for instead of sleeping a fixed 1300ms.
       *
       * readyState alone is not enough: immediately after navigate the
       * *previous* document is still `complete` with a body, so a
       * readyState-only wait measures the page we just left. That showed up as
       * failures naming controls from another page ("URL 编码" on /file/,
       * "菜单打不开" on a page with no picker) — the same flaw can hide a real
       * defect. Comparing pathname is what makes "loaded" mean "this
       * document".
       */
      const loaded = await waitForPage(send, page.path);
      if (!loaded.ok) {
        hard.push(`${vp.name}/${page.name}: 页面未在 10s 内加载完成（最后状态 ${loaded.seen || "空"}）`);
        continue;
      }
      // Options only exist once a menu is open; this is what makes the 44px
      // row floor measurable instead of manually reviewed.
      const opened = await send("Runtime.evaluate", { expression: OPEN_PICKER, returnByValue: true }).catch(() => null);
      if (opened && opened.result && opened.result.value) await sleep(220);
      const res = await send("Runtime.evaluate", { expression: PROBE, returnByValue: true }).catch(() => null);
      const data = res && res.result ? res.result.value : null;
      if (!data) {
        hard.push(`${vp.name}/${page.name}: 探测失败`);
        continue;
      }
      const rows = data.pickerRows || { count: 0, heights: [], font: 0 };

      /*
       * Prove the probe saw the rows, not merely that they passed.
       *
       * Options are written into the DOM at init, so a closed menu still
       * reports a full count with every height at 0 — testing the count would
       * never fail. Only a positive height means a row was laid out and
       * measured, and zero heights are filtered out in PROBE, so the signal
       * here is an empty heights array beside a positive count. The two
       * blindness modes are distinct and both must be loud: the trigger could
       * not be opened at all (enhancement broke, class renamed, every trigger
       * hidden), or it opened but no row had a height. A page with no picker
       * must stay quiet, which is why the check keys off hasPicker rather than
       * off the row count.
       */
      const hasPicker = (
        await send("Runtime.evaluate", {
          expression: "document.querySelectorAll('.x-picker').length",
          returnByValue: true,
        })
      ).result.value;
      const openedOk = !!(opened && opened.result && opened.result.value === true);
      const rowsVisible = (rows.heights || []).some((h) => h > 0);
      if (hasPicker > 0 && !openedOk) {
        hard.push(`${vp.name}/${page.name}: 有 picker 但探针打不开菜单`);
      } else if (hasPicker > 0 && rows.count > 0 && !rowsVisible) {
        // rows.count > 0 keeps a legitimate empty option list
        // (select({ options: [] })) from failing: it has nothing to measure,
        // and "nothing to measure" is not the same as "measured nothing".
        // The blindness this guard exists for still fires: rows that exist but
        // all report height 0 mean the CSS or the class name moved.
        hard.push(`${vp.name}/${page.name}: 菜单打开后测不到任何选项（选项存在但高度全为 0）`);
      }

      console.log(
        `${vp.name.padEnd(8)} ${page.name.padEnd(10)} overflow=${String(data.overflowX).padStart(3)}px  溢出元素=${data.offenders.length}  小目标=${data.smallTargets.length}  无名控件=${data.nameless.length}  小字号输入=${data.smallInputs.length}  选项=${rows.count}个·${rows.heights.join('/') || '-'}px·${rows.font || '-'}px字`,
      );

      if (data.overflowX > 1) {
        hard.push(`${vp.name}/${page.name}: 页面横向溢出 ${data.overflowX}px → ${JSON.stringify(data.offenders.slice(0, 3))}`);
      }
      for (const b of data.nameless) {
        hard.push(`${vp.name}/${page.name}: 可点击元素缺少可访问名 ${b.sel}`);
      }
      for (const s of data.smallInputs) {
        // iOS zooms on focus and never zooms back out. On any iOS viewport this
        // is a hard failure; on a mouse it is merely small type.
        (vp.ios ? hard : soft).push(`${vp.name}/${page.name}: 输入框字号 ${s.size}px ${s.sel}`);
      }
      for (const t of data.smallTargets) {
        // `key` is tag.class:height — it names the selector that failed, so a
        // red run says which control is short instead of only how short it is.
        (vp.touch ? hard : soft).push(`${vp.name}/${page.name}: 触控目标 ${t.w}x${t.h}px (${t.key}) "${t.text}"`);
      }
    }
  }

  console.log("\n================ 必须修复 ================");
  hard.forEach((p) => console.log("✗ " + p));
  if (!hard.length) console.log("无");
  console.log("\n================ 桌面端可接受 ================");
  soft.forEach((p) => console.log("· " + p));
  if (!soft.length) console.log("无");

  client.close();
  console.log(`\n硬性失败 ${hard.length} 项`);
  process.exitCode = hard.length ? 1 : 0;
} catch (error) {
  console.error("探测失败:", error.message);
  process.exitCode = 1;
} finally {
  try {
    child.kill();
  } catch {}
}
