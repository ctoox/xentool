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
 * wildcards and require an exact match.
 */
import { TOOLKIT, CATEGORIES } from "./toolkit.js";

export const SITE = {
  name: "xentool",
  tagline: "AI 工具库",
  description: "一个入口，聚合边缘侧的工具。编码、哈希、格式化在浏览器本地完成；存储与 AI 走 Cloudflare 边缘。",
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
    tags: [categoryName(tool.category)],
  })),
  {
    id: "paste",
    name: "Paste",
    description: "纯文本暂存，可自定义过期时间，链接即分享。",
    path: "/paste",
    href: "/paste/",
    host: "paste.xen.autos",
    status: "available",
    tags: ["KV", "存储"],
  },
  {
    id: "short",
    name: "短链",
    description: "长链接变短，带点击统计。根域名直达：xen.autos/abc123。",
    path: "/s",
    href: "/s/",
    host: "",
    status: "available",
    tags: ["KV", "存储"],
  },
  {
    id: "ai-summary",
    name: "AI 摘要",
    description: "长文与网页摘要，基于 Workers AI 在边缘推理。",
    path: "/ai/summary",
    href: "/ai/summary",
    host: "",
    status: "planned",
    tags: ["Workers AI"],
  },
  {
    id: "ai-translate",
    name: "AI 翻译",
    description: "保留语气与格式的多语翻译。",
    path: "/ai/translate",
    href: "/ai/translate",
    host: "",
    status: "planned",
    tags: ["Workers AI"],
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
    tags: tool.tags || [],
  }));
}
