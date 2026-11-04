/**
 * Room — realtime broadcast over WebSockets, backed by a Durable Object.
 *
 *   GET /room/          UI
 *   GET /room/<name>    WebSocket upgrade (join), or a JSON summary if plain
 *
 * The Worker holds no socket state: it resolves the Room object for a name and
 * hands the upgrade over. Sockets survive eviction because the object uses the
 * hibernation API, so an idle room costs nothing while clients stay connected.
 */
import { json, html, health, fail } from "../../../packages/core/index.js";
import { page, card, btn, field, badge, chat, emptyState, notice } from "../../../packages/ui/components.js";

const NO_STORE = { "Cache-Control": "no-store" };
const NAME_PATTERN = /^[a-zA-Z0-9_-]{1,48}$/;

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const namespace = env?.ROOM;

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-room");

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return namespace
        ? html(renderPage({ basePath }), 200, NO_STORE)
        : html(renderMissingBinding({ basePath }), 503, NO_STORE);
    }
    return json(
      {
        tool: "room",
        backend: "durable-object",
        available: Boolean(namespace),
        usage: {
          ui: `GET ${basePath}/`,
          join: `WebSocket ${basePath}/<name>`,
          info: `GET ${basePath}/<name>  (no upgrade header)`,
        },
      },
      200,
      NO_STORE,
    );
  }

  if (!namespace) {
    return fail('ROOM binding is not configured ([[durable_objects.bindings]] name = "ROOM")', 503);
  }

  const name = path.slice(1);
  if (!NAME_PATTERN.test(name)) return fail("room name must match [a-zA-Z0-9_-]{1,48}", 400);

  const stub = namespace.get(namespace.idFromName(name));

  // The upgrade request is passed through unchanged: the object owns the
  // WebSocketPair and the 101 response.
  if (request.headers.get("Upgrade") === "websocket") {
    return stub.fetch(request);
  }

  return stub.fetch(request);
}

/* ---------------------------------------------------------------------- UI */

const ROOM_SCRIPT = String.raw`
(function(){
  var base = window.__BASE || '';
  var roomEl = document.getElementById('room');
  var log = document.getElementById('log');
  var msg = document.getElementById('msg');
  var sendBtn = document.getElementById('send');
  var joinBtn = document.getElementById('join');
  var statusEl = document.getElementById('status');
  var statusText = document.getElementById('status-text');
  var errEl = document.getElementById('error');
  var socket = null;

  function line(text, cls){
    var div = document.createElement('div');
    div.className = 'x-chat__msg' + (cls ? ' ' + cls : '');
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function setStatus(on, text){
    statusEl.className = 'x-badge x-badge--' + (on ? 'ok' : 'off');
    var dot = statusEl.querySelector('.x-dot');
    if (dot) dot.className = 'x-dot x-dot--' + (on ? 'ok' : 'off');
    statusText.textContent = text;
  }

  function join(){
    var name = roomEl.value.trim();
    if (!name) { errEl.textContent = '请输入房间名'; return; }
    if (socket) { try { socket.close(); } catch (e) {} }
    errEl.textContent = '';
    log.textContent = '';

    var scheme = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var url = scheme + location.host + base + '/' + encodeURIComponent(name);

    try { socket = new WebSocket(url); }
    catch (e) { errEl.textContent = '无法建立连接：' + e.message; return; }

    socket.addEventListener('open', function(){
      setStatus(true, '已连接 ' + name);
      msg.disabled = false;
      sendBtn.disabled = false;
      line('已加入 ' + name, 'x-chat__msg--sys');
      msg.focus();
    });

    socket.addEventListener('message', function(event){
      var data = null;
      try { data = JSON.parse(event.data); } catch (e) { data = { body: event.data }; }
      if (data.type === 'error') { line(data.message, 'x-chat__msg--sys'); return; }
      line(data.body, '');
    });

    socket.addEventListener('close', function(){
      setStatus(false, '已断开');
      msg.disabled = true;
      sendBtn.disabled = true;
    });

    socket.addEventListener('error', function(){
      setStatus(false, '连接出错');
      errEl.textContent = '连接失败：可能是 ROOM 绑定未配置或服务不可用。';
    });
  }

  function send(){
    if (!socket || socket.readyState !== 1) return;
    var text = msg.value;
    if (!text) return;
    socket.send(text);
    msg.value = '';
    msg.focus();
  }

  joinBtn.addEventListener('click', join);
  sendBtn.addEventListener('click', send);
  msg.addEventListener('keydown', function(e){ if (e.key === 'Enter') send(); });
})();
`;

function renderPage({ basePath }) {
  const statusBadge = `<span class="x-badge x-badge--off" id="status"><span class="x-dot x-dot--off"></span><span id="status-text">未连接</span></span>`;

  const body = `
${card({
  tint: true,
  title: "加入房间",
  sub: "开两个标签页进同一个房间即可验证广播。空闲时对象自动休眠，连接保持不断。",
  body: `
    <div class="x-row" style="margin-bottom:16px">
      <div style="flex:1;min-width:180px;max-width:260px">${field({ label: "房间名", name: "room", id: "room", value: "lobby", placeholder: "字母、数字、下划线" })}</div>
      ${btn({ label: "进入房间", variant: "primary", attrs: { id: "join" } })}
      <span class="x-sep"></span>
      ${statusBadge}
    </div>
    ${chat({})}
    <p class="error" id="error" style="margin-top:12px"></p>
  `,
})}
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "消息不落库。",
  body: "广播只在当前连接的对象实例内转发；最后一个人离开后房间即清空，没有历史记录可查。",
})}
</div>`;

  return page({
    title: "实时房间",
    lead: "基于 Durable Object 的广播房间，WebSocket 走 hibernation API。",
    body,
    actions: badge({ text: "WebSocket", tone: "accent" }),
    script: ROOM_SCRIPT,
  });
}

function renderMissingBinding({ basePath }) {
  const body = `
${emptyState({
  icon: "bolt",
  title: "Durable Objects 未绑定",
  desc: "实时房间需要 [[durable_objects.bindings]] 与 [[migrations]]，并在入口导出 Room 类。",
  action: btn({ label: "返回", href: `${basePath}/`, variant: "ghost" }),
})}
<div style="margin-top:16px">
${notice({
  tone: "warn",
  title: "这是部署配置问题，不是代码问题。",
  body: "补上绑定并重新部署后，本页会自动可用。",
})}
</div>`;
  return page({ title: "实时房间", lead: "该能力当前未启用。", body });
}

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    return handle(request, env, {
      path: url.pathname,
      basePath: "",
      host: url.hostname,
      waitUntil: typeof ctx?.waitUntil === "function" ? (p) => ctx.waitUntil(p) : undefined,
    });
  },
};
