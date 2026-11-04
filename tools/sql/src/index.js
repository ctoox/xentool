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
 *
 * Every statement also spends D1 free-tier rows. A full scan on an unindexed
 * column counts one row per row *scanned*, not per row returned, so the 5M/day
 * ceiling can disappear in twenty queries. Usage is recorded from `meta` after
 * each statement and the console refuses to run at all once the 60% cut-off is
 * crossed — a console is exactly the place where a careless query is cheap to
 * type and expensive to pay for.
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
  createQuota,
  quotaError,
} from "../../../packages/core/index.js";
import {
  page,
  card,
  btn,
  loginCard,
  emptyState,
  notice,
  badge,
} from "../../../packages/ui/components.js";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_ROWS = 500;

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const db = createDb(env);
  const quota = createQuota(env);
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
        return html(
          renderState({ basePath, reason: "locked", configured: auth.configured, error: loginError(url) }),
          401,
          NO_STORE,
        );
      }
      const usage = await quota.snapshot("d1");
      return html(renderConsole({ basePath, usage }), 200, NO_STORE);
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
    let rowsRead = resultRowsRead(tables);
    for (const table of tables.rows.slice(0, 40)) {
      const safe = String(table.name).replace(/"/g, '""');
      let count = null;
      let columns = [];
      try {
        const probe = await db.all(`select count(*) as n from "${safe}"`);
        count = probe.rows?.[0]?.n ?? null;
        rowsRead += resultRowsRead(probe);
        const info = await db.all(`pragma table_info("${safe}")`);
        rowsRead += resultRowsRead(info);
        columns = info.rows.map((row) => ({ name: row.name, type: row.type, pk: Boolean(row.pk) }));
      } catch {
        // a view over a missing dependency must not break the whole listing
      }
      detailed.push({ name: table.name, type: table.type, rows: count, columns });
    }

    quota.bump("d1", { rowsRead });
    const drain = quota.flush();
    if (typeof ctx?.waitUntil === "function") ctx.waitUntil(drain);

    return json({ count: detailed.length, tables: detailed, rowsRead }, 200, NO_STORE);
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

    const gate = await quota.guard("d1");
    if (!gate.ok) return json({ ...quotaError(gate), tool: "sql" }, 507, NO_STORE);

    const params = Array.isArray(payload.params) ? payload.params.slice(0, 40) : [];
    const started = Date.now();

    try {
      const result = await db.all(sql, params);
      const rows = result.rows.slice(0, MAX_ROWS);

      const rowsRead = resultRowsRead(result);
      const rowsWritten = Number(result.meta?.rows_written ?? result.meta?.rowsWritten ?? 0) || 0;
      quota.bump("d1", { rowsRead, rowsWritten });
      const drain = quota.flush();
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(drain);

      return json(
        {
          sql,
          rowCount: result.rows.length,
          truncated: result.rows.length > MAX_ROWS,
          durationMs: Date.now() - started,
          rowsRead,
          rows,
        },
        200,
        NO_STORE,
      );
    } catch (error) {
      return fail(`查询失败：${error.message}`, 400);
    }
  }

  return wantsHtml ? html(renderConsole({ basePath, usage: null }), 404, NO_STORE) : notFound();
}

/** D1 reports rows scanned, which is the number that gets billed. */
function resultRowsRead(result) {
  return Number(result?.meta?.rows_read ?? result?.meta?.rowsRead ?? 0) || 0;
}

function loginError(url) {
  const flag = url.searchParams.get("e");
  if (!flag) return "";
  return flag === "unset" ? "ADMIN 尚未配置，口令登录不可用。" : "口令不正确，请重试。";
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

const SQL_SCRIPT = String.raw`
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
      if (!res.ok) { errEl.textContent = res.data.message || res.data.error || '执行失败'; return; }
      var head = res.data.rowCount + ' 行 · ' + res.data.durationMs + 'ms'
        + (res.data.rowsRead ? ' · 扫描 ' + res.data.rowsRead + ' 行' : '')
        + (res.data.truncated ? ' · 已截断' : '');
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
      if (!res.ok) { errEl.textContent = res.data.message || res.data.error || '读取失败'; return; }
      if (!res.data.tables.length) { schemaOut.textContent = '数据库是空的。'; return; }
      res.data.tables.forEach(function(t){
        var row = document.createElement('div');
        row.className = 'x-schema__row';
        var title = document.createElement('b');
        title.textContent = t.name;
        row.appendChild(title);
        var meta = document.createElement('span');
        meta.className = 'x-muted';
        meta.style.marginLeft = '10px';
        meta.style.fontSize = '11.5px';
        meta.textContent = t.type + ' · ' + (t.rows == null ? '?' : t.rows) + ' 行';
        row.appendChild(meta);
        var cols = document.createElement('div');
        cols.className = 'x-schema__cols';
        cols.textContent = t.columns.map(function(c){ return c.name + ':' + c.type; }).join('  ');
        row.appendChild(cols);
        schemaOut.appendChild(row);
      });
    });
  });
})();
`;

function renderConsole({ basePath, usage }) {
  const usageBadge =
    usage && usage.state !== "ok"
      ? badge({
          text: usage.state === "blocked" ? "配额已熔断" : `用量 ${Math.round(usage.ratio * 100)}%`,
          tone: usage.state === "blocked" ? "danger" : "warn",
          dot: true,
        })
      : badge({ text: "只读", tone: "accent" });

  const body = `
${card({
  title: "查询",
  sub: "仅允许 select / with / explain / pragma。写入语句在到达数据库之前就被拒绝。",
  body: `
    <textarea class="x-textarea" id="sql" spellcheck="false" placeholder="select name, type from sqlite_master limit 20">select name, type from sqlite_master where type not like 'sqlite_%' order by name;</textarea>
    <div class="x-row" style="margin-top:12px">
      ${btn({ label: "执行", variant: "primary", attrs: { id: "run" } })}
      ${btn({ label: "看表结构", attrs: { id: "schema" } })}
      <span class="x-toolbar__spacer"></span>
      <form method="post" action="${basePath}/logout">${btn({ label: "退出", variant: "ghost", type: "submit" })}</form>
    </div>
    <p class="x-field__hint">⌘ / Ctrl + Enter 直接执行。</p>
    <pre class="x-console" id="out" style="margin-top:14px"></pre>
    <p class="error" id="error"></p>
    <div class="x-schema" id="schema-out" style="margin-top:14px"></div>
  `,
})}
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "行数按扫描计，不按返回计。",
  body: "对未建索引的列做过滤时，D1 会把整张表算进 quota —— 免费额度是 500 万行/天，用到 60% 本控制台会自动停止查询。",
})}
</div>`;

  return page({
    title: "SQL 控制台",
    lead: "只读查询 D1，用量达到免费额度 60% 时自动熔断。",
    body,
    actions: usageBadge,
    script: SQL_SCRIPT,
    wide: true,
    basePath,
  });
}

function renderState({ basePath, reason, configured, error = "" }) {
  let body;
  if (reason === "missing") {
    body = `${emptyState({
      icon: "db",
      title: "D1 未绑定",
      desc: "需要先创建数据库，再把 database_id 写进 wrangler.toml 的 [[d1_databases]]。占位 ID 会让部署直接失败。",
      action: btn({ label: "查看平台能力", href: "/status/", variant: "ghost" }),
    })}
<div style="margin-top:16px">
${notice({ tone: "warn", title: "这是部署配置问题。", body: "补上绑定并重新部署后，本页自动可用，不需要改代码。" })}
</div>`;
  } else if (configured) {
    body = loginCard({
      action: `${basePath}/login`,
      title: "SQL 控制台",
      desc: "只读查询 D1。需要管理员口令。",
      error,
      hint: "口令与短链控制台共用同一个 ADMIN 密钥。",
    });
  } else {
    body = `${emptyState({
      icon: "lock",
      title: "还没有配置 ADMIN",
      desc: "SQL 控制台需要管理员口令：npx wrangler secret put ADMIN。",
    })}
<div style="margin-top:16px">
${notice({ tone: "warn", title: "管理面 fail-closed。", body: "没有密钥时不会放行任何请求，这是刻意的行为。" })}
</div>`;
  }
  return page({ title: "SQL 控制台", lead: "", body, basePath });
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
