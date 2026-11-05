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
  { id: "case", name: "命名转换", desc: "camelCase、snake_case、kebab-case 等九种写法一次全出。", category: "text" },
  { id: "counter", name: "文本统计", desc: "字符、词数、行数、字节与阅读时长，输入即算。", category: "text" },
  { id: "lines", name: "行处理", desc: "去重、排序、去空行、加行号、打乱，可叠加执行。", category: "text" },
  { id: "hex", name: "Hex 编解码", desc: "文本与十六进制互转，分隔符可选，适合协议调试。", category: "encode" },
  { id: "unicode", name: "Unicode 转换", desc: "字符与码点互查，附官方字符名称。", category: "encode" },
  { id: "htmlent", name: "HTML 实体", desc: "尖括号、引号与 & 的实体编解码，防注入常用。", category: "encode" },
  { id: "morse", name: "摩斯电码", desc: "字母数字与点划互转，空格分词、斜杠分句。", category: "encode" },
  { id: "caesar", name: "ROT13 与凯撒", desc: "字母位移加密，位移 13 就是 ROT13。", category: "encode" },
  { id: "escape", name: "字符串转义", desc: "JS、Python、Java、C 四种语言的转义与反转义。", category: "dev" },
  { id: "curl", name: "cURL 转换", desc: "粘贴 curl 命令，转成 fetch、axios、Python、Go、PHP。", category: "dev" },
  { id: "roman", name: "罗马数字", desc: "1 到 3999 与罗马数字互转，自动判断方向。", category: "dev" },
  { id: "base", name: "进制转换", desc: "2 到 36 进制整数互转，常用进制一屏对照。", category: "dev" },
  { id: "urlparse", name: "URL 解析", desc: "拆出协议、主机、端口、路径、查询参数与锚点。", category: "net" },
  { id: "httpcode", name: "HTTP 状态码", desc: "按码或关键字查含义与常见原因。", category: "net" },
  { id: "mime", name: "MIME 类型", desc: "按扩展名或类型名查 Content-Type。", category: "net" },
];
