/**
 * Verify the portal's client-side behaviour.
 *
 * The catalog page is one DOM rendered two ways plus a live filter. Those
 * interactions are awkward to unit test but easy to drive in a browser, and
 * they are where the catalog breaks first once the tool list grows.
 *
 * Usage:
 *   npx wrangler dev --port 8799
 *   npm run portal
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8799";
const CDP_PORT = 9335;
const PROFILE = ".shots/portal-profile";

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error("找不到 Edge 或 Chrome，跳过门户检查。");
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
  if (!client) throw new Error("无法连接浏览器调试端口");

  const { send } = client;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await send("Page.navigate", { url: BASE + "/" });
  await sleep(1800);

  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return res.result.value;
  };

  const problems = [];
  const check = (ok, message) => {
    console.log((ok ? "✓ " : "✗ ") + message);
    if (!ok) problems.push(message);
  };

  // --- the catalog renders -------------------------------------------------
  const base = await evaluate(`(() => ({
    cards: document.querySelectorAll('.x-tool-card').length,
    chips: document.querySelectorAll('.x-chips [data-cat]').length,
    toggles: document.querySelectorAll('.x-view-toggle button[data-view]').length,
    count: document.getElementById('count') ? document.getElementById('count').textContent : null,
  }))()`);
  console.log("初始状态:", JSON.stringify(base));
  check(base.cards > 0, `目录渲染了 ${base.cards} 个工具卡片`);
  check(base.chips > 1, `渲染了 ${base.chips} 个分类 chip`);
  check(base.toggles === 2, `视图切换有 ${base.toggles} 个按钮`);

  // --- searching narrows the list and the count ----------------------------
  const searched = await evaluate(`(() => {
    const q = document.getElementById('q');
    q.value = '哈希';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = Array.from(document.querySelectorAll('.x-tool-card')).filter(c => !c.parentNode.classList.contains('hidden'));
    return {
      shown: shown.length,
      count: document.getElementById('count').textContent,
      names: shown.map(c => (c.querySelector('.x-tool-card__title')||{}).textContent),
    };
  })()`);
  console.log("搜索「哈希」:", JSON.stringify(searched));
  check(searched.shown > 0 && searched.shown < base.cards, `搜索把 ${base.cards} 个工具收窄到 ${searched.shown} 个`);
  check(String(searched.count) === String(searched.shown), `结果计数与实际显示一致（${searched.count}）`);

  // --- category counts follow the search -----------------------------------
  const chipCounts = await evaluate(`(() => {
    return Array.from(document.querySelectorAll('.x-chips [data-cat]')).map(c => ({
      cat: c.getAttribute('data-cat'),
      count: c.querySelector('.x-chip__count') ? c.querySelector('.x-chip__count').textContent : null,
    }));
  })()`);
  console.log("搜索后的 chip 计数:", JSON.stringify(chipCounts));
  const total = chipCounts.filter((c) => c.cat === 'all').map((c) => Number(c.count))[0];
  check(total === searched.shown, `「全部」chip 的计数跟随搜索（${total}）`);
  const perCatSum = chipCounts.filter((c) => c.cat !== 'all').reduce((sum, c) => sum + Number(c.count), 0);
  check(perCatSum === searched.shown, `各分类计数之和等于可见数（${perCatSum}）`);

  // --- a category with no match is marked empty ----------------------------
  const emptyChip = await evaluate(`(() => {
    const chips = Array.from(document.querySelectorAll('.x-chips [data-cat]'));
    const empty = chips.find(c => c.classList.contains('x-chip--empty'));
    return empty ? { cat: empty.getAttribute('data-cat'), count: empty.querySelector('.x-chip__count').textContent } : null;
  })()`);
  console.log("空分类:", JSON.stringify(emptyChip));
  check(emptyChip !== null && emptyChip.count === '0', "没有匹配项的分类被标记为空");

  // --- clearing the search restores everything -----------------------------
  const cleared = await evaluate(`(() => {
    const q = document.getElementById('q');
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      count: document.getElementById('count').textContent,
      hidden: Array.from(document.querySelectorAll('.x-tool-card')).filter(c => c.parentNode.classList.contains('hidden')).length,
    };
  })()`);
  console.log("清空搜索后:", JSON.stringify(cleared));
  check(Number(cleared.count) === base.cards, `清空搜索后计数回到 ${base.cards}`);
  check(cleared.hidden === 0, "清空搜索后没有残留的隐藏项");

  // --- the toggle switches the layout --------------------------------------
  const toggled = await evaluate(`(() => {
    const list = document.querySelector('.x-view-toggle button[data-view="list"]');
    list.click();
    const cards = document.getElementById('cards');
    const a = cards.querySelector('.x-tool-card').getBoundingClientRect();
    const listPressed = list.getAttribute('aria-pressed');
    const containerPressed = cards.getAttribute('aria-pressed');
    return { view: cards.getAttribute('data-view'), height: Math.round(a.height), listPressed, containerPressed, saved: localStorage.getItem('xentool:view') };
  })()`);
  console.log("切到紧凑视图:", JSON.stringify(toggled));
  check(toggled.view === 'list', "切换后容器为紧凑视图");
  check(toggled.listPressed === 'true', "被选中的按钮 aria-pressed=true");
  check(toggled.containerPressed === null, "容器不会拿到 aria-pressed");
  check(toggled.saved === 'list', "视图偏好被记住");

  const backToCard = await evaluate(`(() => {
    document.querySelector('.x-view-toggle button[data-view="card"]').click();
    const cards = document.getElementById('cards');
    return { view: cards.getAttribute('data-view'), height: Math.round(cards.querySelector('.x-tool-card').getBoundingClientRect().height) };
  })()`);
  console.log("切回卡片视图:", JSON.stringify(backToCard));
  check(backToCard.view === 'card', "可以切回卡片视图");
  check(backToCard.height > toggled.height, `卡片视图更高（${backToCard.height} > ${toggled.height}）`);

  // Last, because it navigates: does a click on a tool card touch the saved
  // view preference? It used to, because the container that holds the cards
  // also carried a data-view attribute and got wired up as a toggle button.
  const viewState = await evaluate(`(() => {
    const before = localStorage.getItem('xentool:view');
    const card = document.querySelector('.x-tool-card');
    card.addEventListener('click', (e) => e.preventDefault(), { capture: true });
    card.click();
    return { before, after: localStorage.getItem('xentool:view') };
  })()`);
  console.log("点击工具卡片后:", JSON.stringify(viewState));
  check(viewState.after === viewState.before, "点击工具卡片不会改写视图偏好");

  console.log("\n================ 检查结果 ================");
  if (problems.length) problems.forEach((p) => console.log("✗ " + p));
  else console.log("✓ 门户交互全部正常");

  client.close();
  process.exitCode = problems.length ? 1 : 0;
} catch (error) {
  console.error("检查失败:", error.message);
  process.exitCode = 1;
} finally {
  try {
    child.kill();
  } catch {}
}
