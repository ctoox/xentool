/**
 * Browser check for the toolkit ports.
 *
 * `npm test` can prove the HTML contains a VIEWS entry and that /core parses
 * as a module — it cannot prove the import resolves, the view renders, or the
 * two happen fast enough to feel like a tool. This walks every ported tool in
 * a real browser and reports what the panel actually shows.
 *
 * Run against a dev server:
 *   npx wrangler dev --port 8799 --local
 *   npm run tools:check
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, mkdirSync } from "node:fs";
import { TOOLKIT } from "../src/toolkit.js";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8799";
const CDP_PORT = 9337;
const PROFILE = ".shots/tools-profile";

const BROWSERS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

// Tools with a known-good output: the hash, and a string only a correct
// render can contain. Everything else in TOOLKIT still gets the generic
// "renders, has controls, no console errors" pass below.
const EXPECT = new Map([
  ["case", "helloWorld"],
  ["counter", "字符数"],
  ["lines", "去重"],
  ["hex", "编码"],
  ["unicode", "U+0078"],
  ["htmlent", "编码"],
  ["morse", "... --- ..."],
  ["caesar", "Uryyb"],
  ["escape", "转义"],
  ["curl", "fetch("],
  ["roman", "MCMXCIV"],
  ["base", "FF"],
  ["urlparse", "/a/b"],
  ["httpcode", "404"],
  ["mime", "application/json"],
  ["yaml", "\"name\": \"xentool\""],
  ["toml", "127.0.0.1"],
  ["csv", "Ada, L"],
  ["jsonpath", "$.store.book[0].author"],
  ["j2ts", "export interface Address"],
  ["jsonschema", "json-schema.org/draft/2020-12"],
  ["xml", "<server"],
  ["sql", "LEFT JOIN"],
]);

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error("找不到浏览器，跳过。");
  process.exit(0);
}
if (!existsSync(PROFILE)) mkdirSync(PROFILE, { recursive: true });

const child = spawn(
  browser,
  ["--headless=new", "--disable-gpu", "--remote-debugging-port=" + CDP_PORT, "--user-data-dir=" + PROFILE, "about:blank"],
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
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  // Collect everything that would show up in the console — a failed module
  // import rejects a promise, which is not an uncaught exception.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__errors = [];
      window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
      window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason && e.reason.message || e.reason)));
    `,
  });

  await send("Page.navigate", { url: BASE + "/tools#case" });
  await sleep(1800);

  const problems = [];
  for (const { id } of TOOLKIT) {
    const expect = EXPECT.get(id) || "";
    await send("Runtime.evaluate", { expression: `location.hash = ${JSON.stringify(id)}` });
    await sleep(450);
    const res = await send("Runtime.evaluate", {
      expression: `(() => {
        const panel = document.getElementById('panel');
        const text = panel ? panel.innerText : '';
        const title = document.getElementById('title');
        return {
          hash: location.hash,
          title: title ? title.textContent : '',
          len: text.length,
          text: text.slice(0, 400),
          errors: (window.__errors || []).slice(-3),
          controls: panel ? panel.querySelectorAll('input,textarea,button,select').length : 0,
        };
      })()`,
      returnByValue: true,
    });
    const data = res.result.value;
    const tag = `#${id}`;

    if (data.title.trim() === '' || data.title === '工具台') problems.push(`${tag} 没有切换标题（${data.title}）`);
    if (data.len < 8) problems.push(`${tag} 面板是空的（${data.len} 字符）`);
    if (data.controls < 1) problems.push(`${tag} 没有任何可操作控件`);
    if (!data.text.includes(expect)) problems.push(`${tag} 输出里没有 "${expect}"`);
    if (data.errors.length) problems.push(`${tag} 控制台报错：${data.errors.join(' | ')}`);

    console.log(`${data.text.includes(expect) && !data.errors.length ? '✅' : '❌'} ${tag} ${data.title} (${data.len} 字符, ${data.controls} 控件)`);
    if (data.errors.length) console.log("   错误:", data.errors.join(" | "));
  }

  // Switching fast between two async views must not leave the first tool's
  // DOM in the panel after the second one finishes loading.
  await send("Runtime.evaluate", { expression: `location.hash = 'counter'` });
  await send("Runtime.evaluate", { expression: `location.hash = 'mime'` });
  await sleep(600);
  const race = await send("Runtime.evaluate", {
    expression: `(() => {
      const t = document.getElementById('title').textContent;
      const text = document.getElementById('panel').innerText;
      return { title: t, hasStats: text.includes('字符数'), hasMime: text.includes('Content-Type') };
    })()`,
    returnByValue: true,
  });
  const raceData = race.result.value;
  if (raceData.title !== "MIME 类型" || raceData.hasStats || !raceData.hasMime) {
    problems.push(`快速切换后画面错乱：${JSON.stringify(raceData)}`);
  }
  console.log(`快速切换: ${JSON.stringify(raceData)}`);

  console.log("\n" + (problems.length ? `发现 ${problems.length} 个问题：\n- ` + problems.join("\n- ") : "全部通过"));
  process.exitCode = problems.length ? 1 : 0;
} finally {
  try {
    client?.close();
  } catch {}
  child.kill();
}
