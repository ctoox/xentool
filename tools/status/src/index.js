/**
 * Status tool — one page that answers "which Cloudflare capabilities does this
 * deployment actually have right now, and how much of the free tier is spent?".
 *
 * This exists because the bindings a Worker can use are decided by
 * `wrangler.toml` plus resources that must exist in the account, and a missing
 * one fails at call time, not at deploy time. Without this page the first
 * symptom is a 500 from some unrelated tool.
 *
 * Read-only and public: it exposes capability names and quota percentages,
 * never secrets, keys, or stored values.
 */
import {
  json,
  html,
  health,
  capabilities,
  createQuota,
  fmtBytes,
  SAFETY_RATIO,
  PROTOCOL_VERSION,
} from "../../../packages/core/index.js";
import { escapeHtml } from "../../../packages/ui/shell.js";
import { page, card, stats, table, badge, notice, meterRow } from "../../../packages/ui/components.js";

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

/** Quota dimensions worth showing, in the order an operator asks about them. */
const QUOTA_ROWS = [
  { kind: "r2", field: "storageBytes", label: "R2 存储", format: fmtBytes },
  { kind: "r2", field: "classA", label: "R2 Class A", format: fmtCount },
  { kind: "r2", field: "classB", label: "R2 Class B", format: fmtCount },
  { kind: "d1", field: "rowsRead", label: "D1 读取 · 行/天", format: fmtCount },
  { kind: "d1", field: "rowsWritten", label: "D1 写入 · 行/天", format: fmtCount },
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
    const quota = createQuota(env);
    const usage = await quota.report();

    if (wantsHtml) {
      return html(renderPage({ rows, ready, basePath, usage }), 200, NO_STORE);
    }
    return json(
      {
        tool: "status",
        protocol: PROTOCOL_VERSION,
        bindings: rows.map(({ key, label, available }) => ({ key, label, available })),
        ready,
        total: rows.length,
        quota: {
          safetyRatio: SAFETY_RATIO,
          d1: quotaShape(usage.d1),
          r2: quotaShape(usage.r2),
        },
      },
      200,
      NO_STORE,
    );
  }

  return wantsHtml ? html(renderPage({ rows, ready, basePath, usage: null }), 404, NO_STORE) : json({ error: "not found" }, 404, NO_STORE);
}

function quotaShape(snapshot) {
  const fields = {};
  for (const [field, level] of Object.entries(snapshot.fields || {})) {
    fields[field] = { used: level.used, limit: level.limit, ratio: Number(level.ratio.toFixed(4)), state: level.state };
  }
  return { period: snapshot.period, periodKey: snapshot.periodKey, state: snapshot.state, fields };
}

function renderPage({ rows, ready, basePath, usage }) {
  const missing = rows.length - ready;

  const quotaBody = usage
    ? table({
        columns: [{ label: "维度" }, { label: "已用" }, { label: "免费上限" }, { label: "占比", align: "right" }],
        rows: QUOTA_ROWS.map((spec) => {
          const snap = usage[spec.kind];
          const level = snap.fields[spec.field] || { used: 0, limit: 0, ratio: 0, state: "ok" };
          const tone = level.state === "blocked" ? "danger" : level.state === "warn" ? "warn" : "";
          return [
            `<b>${escapeHtml(spec.label)}</b><div class="x-table__muted">${escapeHtml(snap.period === "month" ? "每月" : "每日")} · ${escapeHtml(snap.periodKey)}</div>`,
            spec.format(level.used),
            spec.format(level.limit),
            meterRow({ ratio: level.ratio, tone }),
          ];
        }),
      })
    : "";

  const body = `
${stats([
  { value: `${ready}/${rows.length}`, label: "能力就绪", hint: missing ? `${missing} 项未启用` : "全部可用" },
  { value: String(ready), label: "已启用", hint: "绑定已生效" },
  { value: String(missing), label: "未配置", hint: "对应工具返回 503" },
])}
${table({
  columns: [{ label: "" }, { label: "能力" }, { label: "状态" }, { label: "声明位置" }],
  rows: rows.map((row) => [
    `<span class="x-dot x-dot--${row.available ? "ok" : "off"}"></span>`,
    `<b>${escapeHtml(row.label)}</b><div class="x-table__muted">${escapeHtml(row.use)}</div>`,
    row.available ? badge({ text: "可用", tone: "ok", dot: true }) : badge({ text: "未配置", tone: "off", dot: true }),
    `<code>${escapeHtml(row.need)}</code>`,
  ]),
})}
<div style="margin-top:22px">
${card({
  title: "免费额度守卫",
  sub: `用量达到免费额度的 ${Math.round(SAFETY_RATIO * 100)}% 时自动停止写入，避免 D1 停服与 R2 计费。`,
  body: quotaBody,
  foot: "计数器按分钟合并写入 KV，数值是近似值；60% 阈值留出的 40% 就是为这种近似准备的。",
})}
</div>
<div style="margin-top:16px">
${notice({
  tone: "info",
  title: "以 wrangler.toml 为准。",
  body: "控制台里手工添加的绑定会在下一次部署时被删除 —— 部署按配置文件重建资源。",
})}
</div>`;

  return page({
    title: "平台能力",
    lead: `${ready} / ${rows.length} 个 Cloudflare 能力已就绪。缺失的能力不会让站点崩溃，对应的工具会返回明确的 503 并说明缺哪一行配置。`,
    body,
    wide: true,
  });
}

function fmtCount(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
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
