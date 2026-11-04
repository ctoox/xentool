/**
 * SQL console — read-only D1 inspection.
 *
 *   GET  /sql/            console (admin)
 *   GET  /sql/api/schema  tables, views and row counts
 *   POST /sql/api         {"sql":"select …","params":[]}
 *
 * Read-only is structural, not advisory: D1 cannot open a read-only
 * connection, so every statement is checked lexically before it runs. The
 * console is for looking, and a console that can DELETE is a console that
 * eventually does.
 */
import {
  json,
  html,
  health,
  fail,
  notFound,
  createAuth,
  createDb,
  isReadOnly,
} from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_ROWS = 500;

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const db = createDb(env);
  const method = request.method;

  if (method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-sql");

  const auth = createAuth(request, env, { cookieName: "xt_sql" });
  const authorized = await auth.authorized();

  if (path === "/login" && method === "POST") return login(request, auth, basePath);
  if (path === "/logout" && method === "POST") {
    return new Response(null, {
      status: 303,
      headers: { Location: `${basePath}/`, "Set-Cookie": auth.clearedCookie(), ...NO_STORE },
    });
  }

  if (path === "/" && method === "GET") {
    if (wantsHtml) {
      if (!db.available) return html(renderState({ basePath, reason: "missing" }), 503, NO_STORE);
      if (!authorized) {
        return html(renderState({ basePath, reason: "locked", configured: auth.configured }), 401, NO_STORE);
      }
      return html(renderConsole({ basePath }), 200, NO_STORE);
    }
    return json(
      {
        tool: "sql",
        backend: "d1",
        available: db.available,
        readOnly: true,
        limits: { maxRows: MAX_ROWS },
        usage: {
          schema: `GET ${basePath}/api/schema`,
          query: `POST ${basePath}/api  {"sql":"select 1","params":[]}`,
        },
      },
      200,
      NO_STORE,
    );
  }

  if (!db.available) {
    return fail('D1 binding is not configured (add [[d1_databases]] with binding = "DB")', 503);
  }

  if (!authorized) {
    return json({ error: "unauthorized", hint: "Authorization: Bearer <ADMIN>" }, 401, NO_STORE);
  }

  if (path === "/api/schema" && method === "GET") {
    const tables = await db.all(
      "select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name",
    );

    const detailed = [];
    for (const table of tables.rows.slice(0, 40)) {
      const safe = String(table.name).replace(/"/g, '""');
      let count = null;
      let columns = [];
      try {
        const probe = await db.all(`select count(*) as n from "${safe}"`);
        count = probe.rows?.[0]?.n ?? null;
        const info = await db.all(`pragma table_info("${safe}")`);
        columns = info.rows.map((row) => ({ name: row.name, type: row.type, pk: Boolean(row.pk) }));
      } catch {
        // a view over a missing dependency must not break the whole listing
      }
      detailed.push({ name: table.name, type: table.type, rows: count, columns });
    }

    return json({ count: detailed.length, tables: detailed }, 200, NO_STORE);
  }

  if (path === "/api" && method === "POST") {
    const payload = await request.json().catch(() => null);
    if (!payload) return fail("invalid JSON body", 400);

    const sql = typeof payload.sql === "string" ? payload.sql.trim() : "";
    if (!sql) return fail("sql is required", 400);
    if (sql.length > 4000) return fail("sql is too long", 413);
    if (!isReadOnly(sql)) {
      return fail("only read-only statements are allowed (select / with / explain / pragma)", 403);
    }

    const params = Array.isArray(payload.params) ? payload.params.slice(0, 40) : [];
    const started = Date.now();

    try {
      const result = await db.all(sql, params);
      const rows = result.rows.slice(0, MAX_ROWS);
      return json(
        {
          sql,
          rowCount: result.rows.length,
          truncated: result.rows.length > MAX_ROWS,
          durationMs: Date.now() - started,
          rows,
        },
        200,
        NO_STORE,
      );
    } catch (error) {
      return fail(`查询失败：${error.message}`, 400);
    }
  }

  return wantsHtml ? html(renderConsole({ basePath }), 404, NO_STORE) : notFound();
}

/* ------------------------------------------------------------------- auth */

async function login(request, auth, basePath) {
  const type = request.headers.get("content-type") || "";
  const asJson = type.includes("application/json");
  const password = asJson
    ? await request.json().then((body) => body?.password ?? null).catch(() => null)
    : new URLSearchParams(await request.text()).get("password");

  if (!auth.configured) {
    return asJson ? json({ error: "ADMIN is not configured" }, 503, NO_STORE) : new Response(null, {
      status: 303,
      headers: { Location: `${basePath}/?e=unset`, ...NO_STORE },
    });
  }
  if (!auth.checkPassword(password)) {
    return asJson
      ? json({ error: "invalid password" }, 401, NO_STORE)
      : new Response(null, { status: 303, headers: { Location: `${basePath}/?e=1`, ...NO_STORE } });
  }

  const cookie = await auth.sessionCookie();
  if (asJson) return json({ ok: true }, 200, { ...NO_STORE, "Set-Cookie": cookie });
  return new Response(null, {
    status: 303,
    headers: { Location: `${basePath}/`, "Set-Cookie": cookie, ...NO_STORE },
  });
}

/* ---------------------------------------------------------------------- UI */

const SQL_CSS = String.raw`
.editor textarea{min-height:150px}
.out{min-height:120px;max-height:420px}
.schema{font-size:12.5px}
.schema .t{border-bottom:1px solid rgba(255,255,255,.05);padding:10px 0}
.schema .t b{font-family:ui-monospace,monospace;color:var(--cyan);font-weight:500}
.schema .cols{color:var(--dim);font-family:ui-monospace,monospace;font-size:11.5px;margin-top:4px;word-break:break-word}
`;

function renderConsole({ basePath }) {
  const body = `
<h1>SQL 控制台</h1>
<p class="lead">只读查询 D1。仅允许 <code>select</code> / <code>with</code> / <code>explain</code> / <code>pragma</code>，写入语句在到达数据库之前就被拒绝。</p>
<div class="editor"><textarea id="sql" spellcheck="false" placeholder="select name, type from sqlite_master limit 20">select name, type from sqlite_master where type not like 'sqlite_%' order by name;</textarea></div>
<div class="bar" style="display:flex;gap:10px;padding:12px 0;align-items:center">
  <button class="btn primary" id="run" type="button">执行</button>
  <button class="btn" id="schema" type="button">看表结构</button>
  <span class="spacer" style="flex:1"></span>
  <form method="post" action="${escapeHtml(basePath)}/logout"><button class="btn" type="submit">退出</button></form>
</div>
<pre class="out" id="out"></pre>
<p class="error" id="error"></p>
<div class="schema" id="schema-out"></div>`;

  const script = String.raw`
(function(){
  var base = window.__BASE || '';
  var sql = document.getElementById('sql');
  var out = document.getElementById('out');
  var errEl = document.getElementById('error');
  var schemaOut = document.getElementById('schema-out');

  sql.addEventListener('keydown', function(e){
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });

  function run(){
    errEl.textContent = '';
    out.textContent = '';
    fetch(base + '/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: sql.value })
    }).then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      if (!res.ok) { errEl.textContent = res.data.error || '执行失败'; return; }
      var head = res.data.rowCount + ' 行 · ' + res.data.durationMs + 'ms' + (res.data.truncated ? ' · 已截断' : '');
      out.textContent = head + '\n\n' + JSON.stringify(res.data.rows, null, 2);
    }).catch(function(e){
      errEl.textContent = '网络错误：' + e.message;
    });
  }

  document.getElementById('run').addEventListener('click', run);

  document.getElementById('schema').addEventListener('click', function(){
    errEl.textContent = '';
    schemaOut.textContent = '';
    fetch(base + '/api/schema').then(function(r){
      return r.json().then(function(d){ return { ok: r.ok, data: d }; });
    }).then(function(res){
      if (!res.ok) { errEl.textContent = res.data.error || '读取失败'; return; }
      if (!res.data.tables.length) { schemaOut.textContent = '数据库是空的。'; return; }
      res.data.tables.forEach(function(t){
        var wrap = document.createElement('div');
        wrap.className = 't';
        var title = document.createElement('b');
        title.textContent = t.name + '  ';
        wrap.appendChild(title);
        var meta = document.createElement('span');
        meta.className = 'muted';
        meta.textContent = t.type + ' · ' + (t.rows == null ? '?' : t.rows) + ' 行';
        wrap.appendChild(meta);
        var cols = document.createElement('div');
        cols.className = 'cols';
        cols.textContent = t.columns.map(function(c){ return c.name + ':' + c.type; }).join('  ');
        wrap.appendChild(cols);
        schemaOut.appendChild(wrap);
      });
    });
  });
})();
`;

  return shell({ title: "SQL 控制台", body, basePath, script, style: SQL_CSS });
}

function renderState({ basePath, reason, configured }) {
  const body =
    reason === "missing"
      ? `<div class="empty"><h2>D1 未绑定</h2><p>需要先创建数据库，再把 <code>database_id</code> 写进 wrangler.toml 的 <code>[[d1_databases]]</code>。占位 ID 会让部署直接失败。</p></div>`
      : configured
        ? `<div class="login" style="max-width:380px;margin:0 auto">
  <h1>SQL 控制台</h1>
  <p class="lead">需要管理员口令。</p>
  <form method="post" action="${escapeHtml(basePath)}/login"><input type="password" name="password" placeholder="ADMIN 口令" style="width:100%;border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.04);color:var(--ink);padding:12px 14px"><button class="btn primary" type="submit" style="width:100%;justify-content:center;margin-top:12px;padding:11px">进入</button></form>
  <p class="error" id="login-error"></p>
</div>
<script>
if (new URLSearchParams(location.search).get('e')) {
  document.getElementById('login-error').textContent = '口令不正确，请重试。';
}
</script>`
        : `<div class="empty"><h2>还没有配置 ADMIN</h2><p>SQL 控制台需要管理员口令：<code>npx wrangler secret put ADMIN</code></p></div>`;
  return shell({ title: "SQL 控制台", body, basePath, script: "" });
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
