/**
 * Toolkit metadata — DATA, single source of truth.
 *
 * Consumed by both the portal cards (src/catalog.js) and the workbench page
 * (src/tools-page.js). Adding a browser-side tool means adding one entry here
 * plus one view in the workbench client script.
 *
 * All tools below run entirely in the browser: zero requests, zero Worker CPU,
 * no data leaves the device. That is deliberate — encoding/hashing should not
 * round-trip to the edge.
 */
export const CATEGORIES = [
  { id: "encode", name: "编码转换" },
  { id: "dev", name: "开发辅助" },
  { id: "net", name: "网络" },
  { id: "text", name: "文本处理" },
];

export const TOOLKIT = [
  { id: "url", name: "URL 编码", desc: "URL 组件编解码，正确处理中文与保留字符。", category: "encode" },
  { id: "base64", name: "Base64", desc: "文本与 Base64 互转，UTF-8 安全。", category: "encode" },
  { id: "json", name: "JSON", desc: "格式化、压缩与语法校验，报错带位置。", category: "encode" },
  { id: "jwt", name: "JWT 解析", desc: "解码 header 与 payload，检查是否过期。", category: "encode" },
  { id: "hash", name: "哈希", desc: "SHA-1 / 256 / 384 / 512 摘要，Web Crypto 计算。", category: "dev" },
  { id: "uuid", name: "UUID", desc: "批量生成 v4 UUID，一次最多 100 个。", category: "dev" },
  { id: "time", name: "时间戳", desc: "时间戳与日期互转，含实时当前值。", category: "dev" },
  { id: "regex", name: "正则测试", desc: "实时匹配，列出命中位置与捕获组。", category: "dev" },
  { id: "color", name: "颜色转换", desc: "HEX / RGB / HSL 互转，带色块预览。", category: "dev" },
  { id: "cidr", name: "CIDR 计算", desc: "子网掩码、网络地址、广播地址与可用主机范围。", category: "net" },
  { id: "cron", name: "Cron 解释", desc: "解析五段表达式，说明含义并列出接下来几次触发。", category: "net" },
  { id: "diff", name: "文本对比", desc: "逐行比对两段文本，标出新增、删除与相同行。", category: "text" },
  { id: "markdown", name: "Markdown 预览", desc: "安全渲染常用语法，标题、列表、代码与强调。", category: "text" },
];
