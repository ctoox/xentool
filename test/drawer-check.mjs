/**
 * Verify the mobile drawer actually shows its navigation.
 *
 * The drawer holds a clone of the sidebar, and the sidebar is hidden below
 * 900px with `nav{display:none}`. The clone is also a `nav` element, so it
 * inherited that rule and the drawer opened to an empty panel. Screenshots
 * could show this, but a measurement states it: count the visible links.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8799";
const CDP_PORT = 9333;
const PROFILE = ".shots/drawer-profile";

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

const CHECK = `(() => {
  const drawer = document.getElementById('drawer');
  const body = document.getElementById('drawer-body');
  if (!drawer || !body) return { error: 'no drawer' };
  const nav = body.querySelector('nav');
  const links = Array.from(body.querySelectorAll('a'));
  const visible = links.filter((a) => {
    const r = a.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  const navStyle = nav ? getComputedStyle(nav) : null;
  return {
    drawerOpen: drawer.classList.contains('open'),
    hasNav: !!nav,
    navDisplay: navStyle ? navStyle.display : null,
    totalLinks: links.length,
    visibleLinks: visible.length,
    firstVisible: visible.length ? visible[0].textContent.trim().slice(0, 20) : null,
    role: drawer.getAttribute('role'),
    modal: drawer.getAttribute('aria-modal'),
  };
})()`;

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error("找不到浏览器，跳过。");
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
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
      const target = list.find((t) => t.type === "page");
      if (!target) throw new Error("no page");
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
      client = {
        send: (method, params = {}) =>
          new Promise((resolve, reject) => {
            const mid = ++id;
            pending.set(mid, { resolve, reject });
            ws.send(JSON.stringify({ id: mid, method, params }));
          }),
        close: () => ws.close(),
      };
      break;
    } catch {
      await sleep(400);
    }
  }
  if (!client) throw new Error("无法连接浏览器");

  const { send } = client;
  await send("Page.enable");
  await send("Runtime.enable");
  // The browser caches the page between runs, so a fix on the server can look
  // unapplied. Bypass the cache to make the check describe the current code.
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 780, deviceScaleFactor: 1, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  await send("Page.navigate", { url: BASE + "/tools" });
  await sleep(1600);

  const before = await send("Runtime.evaluate", {
    expression: `(() => { const d = document.getElementById('drawer'); return d ? d.outerHTML.slice(0,120) : 'NO DRAWER'; })()`,
    returnByValue: true,
  });
  console.log("点击前:", before.result.value);

  // Open the drawer the way a user would.
  await send("Runtime.evaluate", {
    expression: `document.getElementById('drawer-open').click()`,
  });
  await sleep(500);

  const after = await send("Runtime.evaluate", {
    expression: `(() => { const d = document.getElementById('drawer'); return d ? d.outerHTML.slice(0,120) : 'NO DRAWER'; })()`,
    returnByValue: true,
  });
  console.log("点击后:", after.result.value);

  const res = await send("Runtime.evaluate", { expression: CHECK, returnByValue: true });
  const data = res.result.value;
  console.log("抽屉状态:", JSON.stringify(data, null, 2));

  const problems = [];
  if (!data.hasNav) problems.push("抽屉内没有 nav 克隆体");
  if (data.navDisplay === "none") problems.push("抽屉内的 nav 仍是 display:none");
  if (data.visibleLinks === 0) problems.push("抽屉内没有可见链接 —— 抽屉是空的");
  if (data.totalLinks > 0 && data.visibleLinks < data.totalLinks) {
    problems.push(`只有 ${data.visibleLinks}/${data.totalLinks} 个链接可见`);
  }
  if (data.role !== "dialog") problems.push("抽屉缺少 role=dialog");
  if (data.modal !== "true") problems.push("抽屉缺少 aria-modal=true");

  // Focus trap: tabbing from the last control must wrap back into the drawer
  // instead of escaping into the page hidden behind the backdrop.
  const trap = await send("Runtime.evaluate", {
    expression: `(() => {
      const drawer = document.getElementById('drawer');
      const focusables = Array.from(drawer.querySelectorAll('a[href], button:not([disabled])'))
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const last = focusables[focusables.length - 1];
      last.focus();
      const before = document.activeElement === last;
      const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      last.dispatchEvent(evt);
      const wrapped = document.activeElement !== last;
      return { before, wrapped, activeTag: document.activeElement.tagName, count: focusables.length };
    })()`,
    returnByValue: true,
  });
  console.log("焦点陷阱:", JSON.stringify(trap.result.value));
  if (!trap.result.value.wrapped) {
    problems.push("焦点可以从抽屉最后一个控件逃逸到背后的页面");
  }

  console.log("\n================ 检查结果 ================");
  if (problems.length) problems.forEach((p) => console.log("✗ " + p));
  else console.log("✓ 抽屉导航正常显示，焦点被正确限制在抽屉内");

  client.close();
  process.exitCode = problems.length ? 1 : 0;
} catch (error) {
  console.error("验证失败:", error.message);
  process.exitCode = 1;
} finally {
  try {
    child.kill();
  } catch {}
}
