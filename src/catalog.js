/**
 * Tool catalog — DATA, not logic.
 *
 * The browser-side tools come from src/toolkit.js (single source of truth),
 * so adding a tool there automatically lists it on the portal. Server-side
 * tools are declared explicitly below.
 *
 * status "available" = clickable; "planned" = listed only, rendered as a
 * non-link card and its path returns 404.
 * host must be an exact hostname: Cloudflare Custom Domains do not support
 * wildcards and require an exact match. Leave it empty unless the route is
 * actually declared in wrangler.toml — a host here without a route is a lie.
 */
import { TOOLKIT, CATEGORIES } from "./toolkit.js";

export const SITE = {
  name: "xentool",
  tagline: "边缘工具库",
  description: "一个入口，聚合 Cloudflare 边缘侧的全部能力：浏览器本地计算、KV 存储、R2 文件、D1 查询、Durable Objects 与 Workers AI。",
};

const categoryName = (id) => {
  const found = CATEGORIES.find((cat) => cat.id === id);
  return found ? found.name : id;
};

export const CATALOG = [
  ...TOOLKIT.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.desc,
    path: "/tools",
    href: `/tools#${tool.id}`,
    host: "",
    status: "available",
    // `category` is the display group; the portal filters on it. Deriving it
    // from toolkit.js keeps the catalog and the category chips in sync — a
    // hardcoded id→group table in the portal would silently dump every new
    // tool into "其他".
    category: categoryName(tool.category),
    tags: [categoryName(tool.category)],
  })),
  {
    id: "ai",
    name: "Workers AI",
    description: "摘要、翻译、向量与相似度，在边缘推理，不需要自建模型服务。",
    path: "/ai",
    href: "/ai/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["Workers AI", "推理"],
  },
  {
    id: "paste",
    name: "Paste",
    description: "纯文本暂存，可自定义过期时间，链接即分享。",
    path: "/paste",
    href: "/paste/",
    host: "paste.xen.autos",
    status: "available",
    category: "存储",
    tags: ["KV", "存储"],
  },
  {
    id: "md",
    name: "Markdown",
    description: "写 markdown，得到一个直接显示排版效果的链接，源码随时可取。",
    path: "/md",
    href: "/md/",
    host: "",
    status: "available",
    category: "存储",
    tags: ["KV", "存储", "Markdown"],
  },
  {
    id: "short",
    name: "短链",
    description: "长链接变短，带点击统计。控制台需管理员口令。",
    path: "/s",
    href: "/s/",
    host: "",
    status: "available",
    category: "存储",
    tags: ["KV", "存储"],
  },
  {
    id: "file",
    name: "文件分享",
    description: "上传即得链接，存 R2，到期自动清理，单文件 25 MB。",
    path: "/file",
    href: "/file/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["R2", "对象存储"],
  },
  {
    id: "hit",
    name: "强一致计数",
    description: "每个名字一个 Durable Object，并发下不丢计数。",
    path: "/hit",
    href: "/hit/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["Durable Objects", "计数"],
  },
  {
    id: "room",
    name: "实时房间",
    description: "WebSocket 广播房间，空闲自动休眠，连接不断。",
    path: "/room",
    href: "/room/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["Durable Objects", "WebSocket"],
  },
  {
    id: "sql",
    name: "SQL 控制台",
    description: "只读查询 D1，表结构与行数一览。需要管理员口令。",
    path: "/sql",
    href: "/sql/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["D1", "数据库"],
  },
  {
    id: "kv",
    name: "KV 控制台",
    description: "浏览共享 namespace 的全部键，写入限定在 kv: 前缀。",
    path: "/kv",
    href: "/kv/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["KV", "运维"],
  },
  {
    id: "status",
    name: "平台能力",
    description: "一页看清哪些 Cloudflare 绑定已就绪、哪些还没配置。",
    path: "/status",
    href: "/status/",
    host: "",
    status: "available",
    category: "边缘能力",
    tags: ["运维", "自检"],
  },
  {
    id: "vector",
    name: "语义检索",
    description: "Vectorize 索引上的相似度搜索，配合向量化工具使用。",
    path: "/vector",
    href: "/vector/",
    host: "",
    status: "planned",
    category: "边缘能力",
    tags: ["Vectorize"],
  },
];

/** Shape consumed by both the JSON API and the portal page. */
export function portalTools() {
  return CATALOG.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    href: tool.href || `${tool.path}/`,
    host: tool.host,
    status: tool.status,
    category: tool.category || "其他",
    tags: tool.tags || [],
  }));
}
