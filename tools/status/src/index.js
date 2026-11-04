/**
 * Status tool — one page that answers "which Cloudflare capabilities does this
 * deployment actually have right now?".
 *
 * This exists because the bindings a Worker can use are decided by
 * `wrangler.toml` plus resources that must exist in the account, and a missing
 * one fails at call time, not at deploy time. Without this page the first
 * symptom is a 500 from some unrelated tool.
 *
 * Read-only and public: it exposes capability names, never secrets or values.
 */
import { json, html, health, capabilities, PROTOCOL_VERSION } from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const NO_STORE = { "Cache-Control": "no-store" };

/** Ordered so the page reads like the platform, not like the alphabet. */
const ROWS = [
  { key: "kv", label: "KV", use: "Paste、短链、KV 控制台", need: "[[kv_namespaces]]" },
  { key: "ai", label: "Workers AI", use: "摘要、翻译、向量", need: "[ai]" },
  { key: "r2", label: "R2", use: "文件分享", need: "[[r2_buckets]]" },
  { key: "d1", label: "D1", use: "SQL 控制台", need: "[[d1_databases]]" },
  { key: "counter", label: "Durable Objects · Counter", use: "强一致计数", need: "[[durable_objects.bindings]]" },
  { key: "room", label: "Durable Objects · Room", use: "实时房间", need: "[[durable_objects.bindings]]" },
  { key: "queue", label: "Queues", use: "异步任务", need: "[[queues.producers]]" },
  { key: "vectorize", label: "Vectorize", use: "语义检索", need: "[[vectorize]]" },
  { key: "cache", label: "Cache API", use: "边缘缓存", need: "无需绑定" },
];

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-status");

  const caps = capabilities(env);
  const rows = ROWS.map((row) => ({ ...row, available: Boolean(caps[row.key]) }));
  const ready = rows.filter((row) => row.available).length;

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return html(renderPage({ rows, ready, basePath }), 200, NO_STORE);
    }
    return json(
      {
        tool: "status",
        protocol: PROTOCOL_VERSION,
        bindings: rows.map(({ key, label, available }) => ({ key, label, available })),
        ready,
        total: rows.length,
      },
      200,
      NO_STORE,
    );
  }

  return wantsHtml ? html(renderPage({ rows, ready, basePath }), 404, NO_STORE) : json({ error: "not found" }, 404, NO_STORE);
}

function renderPage({ rows, ready, basePath }) {
  const cells = rows
    .map((row) => {
      const state = row.available ? "on" : "off";
      const label = row.available ? "可用" : "未配置";
      return `<tr>
  <td><span class="dot ${state}" aria-hidden="true"></span></td>
  <td><b>${escapeHtml(row.label)}</b><div class="muted">${escapeHtml(row.use)}</div></td>
  <td class="state ${state}">${label}</td>
  <td><code>${escapeHtml(row.need)}</code></td>
</tr>`;
    })
    .join("");

  const body = `
<h1>平台能力</h1>
<p class="lead">${ready} / ${rows.length} 个 Cloudflare 能力已就绪。缺失的能力不会让站点崩溃，对应的工具会返回明确的 503。</p>
<div class="wrap">
<table class="grid-table">
  <thead><tr><th></th><th>能力</th><th>状态</th><th>声明位置</th></tr></thead>
  <tbody>${cells}</tbody>
</table>
</div>
<p class="hint">绑定以 wrangler.toml 为准；控制台里手工添加的绑定会在下一次部署时被删除。</p>`;

  const style = String.raw`
.wrap{overflow-x:auto}
table.grid-table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px}
table.grid-table th{text-align:left;font-weight:500;color:var(--dim);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:0 12px 10px;border-bottom:1px solid var(--line)}
table.grid-table td{padding:13px 12px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
table.grid-table b{font-weight:600}
table.grid-table code{font-family:ui-monospace,monospace;font-size:11.5px;color:var(--dim)}
.muted{color:var(--dim);font-size:12px;margin-top:2px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%}
.dot.on{background:#22d3ee;box-shadow:0 0 8px rgba(34,211,238,.9)}
.dot.off{background:#5b6070}
.state{font-size:12px}
.state.on{color:rgba(34,211,238,.92)}
.state.off{color:var(--dim)}
`;

  return shell({ title: "平台能力", body, basePath, style });
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
