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
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

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

const ROOM_CSS = String.raw`
.chat{border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03);overflow:hidden;margin-top:18px}
.log{height:320px;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}
.msg{font-size:13.5px;line-height:1.55;word-break:break-word}
.msg .who{color:var(--cyan);font-family:ui-monospace,monospace;font-size:11.5px;margin-right:8px}
.msg.sys{color:var(--dim);font-size:12.5px}
.echo{display:flex;gap:10px;padding:12px;border-top:1px solid var(--line);background:rgba(0,0,0,.18)}
.echo input{flex:1;border:1px solid var(--line);border-radius:9px;background:rgba(0,0,0,.3);color:var(--ink);padding:10px 12px;font-size:13.5px;outline:none}
.status{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}
.status i{width:6px;height:6px;border-radius:50%;background:#5b6070}
.status.on i{background:#22d3ee;box-shadow:0 0 8px rgba(34,211,238,.9)}
`;

function renderPage({ basePath }) {
  const body = `
<h1>实时房间</h1>
<p class="lead">基于 Durable Object 的广播房间。开两个标签页进同一个房间即可验证；空闲时会自动休眠，连接保持不断。</p>
<div class="row" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
  <input class="field" id="room" value="lobby" placeholder="房间名" style="max-width:220px">
  <button class="btn primary" id="join" type="button">进入房间</button>
  <span class="status" id="status"><i aria-hidden="true"></i><span>未连接</span></span>
</div>
<div class="chat">
  <div class="log" id="log"></div>
  <div class="echo">
    <input id="msg" placeholder="说点什么…" autocomplete="off" disabled>
    <button class="btn" id="send" type="button" disabled>发送</button>
  </div>
</div>
<p class="error" id="error"></p>`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var roomEl = document.getElementById('room');
  var log = document.getElementById('log');
  var msg = document.getElementById('msg');
  var sendBtn = document.getElementById('send');
  var joinBtn = document.getElementById('join');
  var statusEl = document.getElementById('status');
  var errEl = document.getElementById('error');
  var socket = null;

  function line(text, cls){
    var div = document.createElement('div');
    div.className = 'msg' + (cls ? ' ' + cls : '');
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function setStatus(on, text){
    statusEl.classList.toggle('on', Boolean(on));
    statusEl.querySelector('span').textContent = text;
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
      line('已加入 ' + name, 'sys');
      msg.focus();
    });

    socket.addEventListener('message', function(event){
      var data = null;
      try { data = JSON.parse(event.data); } catch (e) { data = { body: event.data }; }
      if (data.type === 'error') { line(data.message, 'sys'); return; }
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

  return shell({ title: "实时房间", body, basePath, script, style: ROOM_CSS });
}

function renderMissingBinding({ basePath }) {
  const body = `
<div class="empty">
  <h2>Durable Objects 未绑定</h2>
  <p>实时房间需要 <code>[[durable_objects.bindings]]</code> 与 <code>[[migrations]]</code>，并导出 Room 类。</p>
  <p><a class="btn" href="${escapeHtml(basePath)}/">返回</a></p>
</div>`;
  return shell({ title: "实时房间", body, basePath, script: "" });
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
