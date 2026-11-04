/**
 * Tool catalog — DATA, not logic.
 *
 * Adding a tool means adding one entry here. The portal Worker's code does not
 * change. Optionally the catalog can be overridden at runtime from
 * env.CATALOG_KV (key "tools", JSON array) so a new tool can be listed without
 * redeploying the portal at all; the static list is always the safe fallback.
 *
 * host must be an exact hostname: Cloudflare Custom Domains do not support
 * wildcards and require an exact match.
 * status "available" = has a handler in src/index.js HANDLERS and is clickable.
 * status "planned"   = listed only; the portal renders it as a non-link card.
 */

export const SITE = {
  name: "itools",
  tagline: "AI 工具库",
  description: "一个入口，聚合边缘侧的 AI 工具。无需安装，打开即用。",
};

export const CATALOG = [
  {
    id: "paste",
    name: "Paste",
    description: "纯文本暂存，可自定义过期时间，链接即分享。",
    path: "/paste",
    host: "paste.xen.autos",
    status: "available",
    tags: ["KV", "Text"],
  },
  {
    id: "chat",
    name: "Chat",
    description: "多模型对话，流式输出，会话可留存。",
    path: "/chat",
    host: "chat.xen.autos",
    status: "planned",
    tags: ["LLM", "Stream"],
  },
  {
    id: "image",
    name: "Image",
    description: "文生图与局部重绘，结果直出 CDN。",
    path: "/image",
    host: "image.xen.autos",
    status: "planned",
    tags: ["Vision", "R2"],
  },
  {
    id: "ocr",
    name: "OCR",
    description: "图片转文字，尽量保留原始版式。",
    path: "/ocr",
    host: "ocr.xen.autos",
    status: "planned",
    tags: ["Vision"],
  },
  {
    id: "summarize",
    name: "Summarize",
    description: "长文与网页摘要，支持分块流式总结。",
    path: "/summarize",
    host: "summarize.xen.autos",
    status: "planned",
    tags: ["LLM", "Edge"],
  },
  {
    id: "translate",
    name: "Translate",
    description: "即时翻译，保留原文语气与格式。",
    path: "/translate",
    host: "translate.xen.autos",
    status: "planned",
    tags: ["LLM"],
  },
];

/** Shape consumed by both the JSON API and the portal page. */
export function portalTools() {
  return CATALOG.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    href: `${tool.path}/`,
    host: tool.host,
    status: tool.status,
    tags: tool.tags || [],
  }));
}
