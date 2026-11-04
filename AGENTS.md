# AGENTS.md

给接手这个仓库的人（和 agent）的操作手册。目标不是解释一切，而是让你**不用读完全部源码就能安全地加一个工具**。

读完这份文档你应该能回答三个问题：改动放哪里、哪些规矩不能破、提交前要跑什么。

---

## 1. 这是什么

`xentool` 是一个跑在 Cloudflare Workers 边缘的工具库。一个 Worker、两个域名、零外部依赖。

| 域名 | 作用 |
| --- | --- |
| `tool.xen.autos` | 主入口：门户 + 所有工具 |
| `xen.autos` | 同一份代码，根路径**故意留空**给未来的首页 |

技术约束：**没有构建步骤**（无 webpack/vite/tsc），源码就是部署产物。Wrangler 直接打包 `src/index.js` 及其 import。

运行时边界：Workers runtime，**不是 Node**。没有 `fs`、没有 `process`、没有 `Buffer`。有 `crypto.subtle`、`TextEncoder`、`fetch`、KV。

---

## 2. 快速开始

```bash
npm install
npm test              # 纯 Node 跑，不需要任何凭据，几秒结束
npm run dev           # wrangler dev，本地 http://localhost:8787
npm run deploy:dry    # 只构建不发布，看包体积和绑定
npx wrangler deploy   # 手动发布（一般不需要，push 会自动部署）
```

本地开发需要 `.dev.vars`（已 gitignore），内容至少一行：

```
ADMIN=dev-only-password
```

生产密钥用 `npx wrangler secret put ADMIN`，**永远不要写进 `wrangler.toml` 或代码**。

> **部署是自动的**：`git push` 到 `main` 会触发 Cloudflare Workers Builds（GitHub App `cloudflare-workers-and-pages`），它自己跑 `npx wrangler deploy` 并发布，通常 30 秒内生效。构建结果会以 check run `Workers Builds: xentool` 出现在提交上：
>
> ```bash
> gh api "repos/ctoox/xentool/commits/$(git rev-parse HEAD)/check-runs" \
>   --jq '.check_runs[] | "\(.name) → \(.conclusion)"'
> ```
>
> 所以**正常情况下你不需要手动部署**。只有两种例外：本地调试要看真实效果、或构建挂了要紧急回滚。手动 `wrangler deploy` 和 Git 构建会**互相覆盖**（谁后完成算谁的），别连着做。

---

## 2.5 Git 拓扑（团队协作从这里开始）

主库在内网 Forgejo `git.xen`，GitHub 只是**部署管道**。

| remote | 地址 | 用途 |
| --- | --- | --- |
| `origin` | `http://git.xen/xen/xentool.git` | **主库**，日常 push 到这里 |
| `github` | `https://github.com/ctoox/xentool.git` | 只读镜像，**不要直接 push** |
| 副本 | `http://10.144.144.12:3000/xen/xentool.git` | mesh 上的 pull 镜像，10 分钟同步一次 |

完整链路：

```
git push
  → git.xen  (Forgejo, 192.168.31.203)
  → push mirror  (sync_on_commit，实测 ~12s)
  → GitHub ctoox/xentool
  → Workers Builds  →  npx wrangler deploy  →  线上
```

**所以团队只需要一个 Forgejo 账号**：不用 GitHub 账号，不用 `gh auth login`，不用 `wrangler login`。

```bash
git clone http://git.xen/xen/xentool.git   # public，匿名可读
cd xentool
npm install && npm test
# 改代码
git push          # 走 origin，自动镜像到 GitHub 并部署
```

三条纪律：

1. **不要直接 push 到 GitHub。** 镜像是单向推送，你在 GitHub 上的提交会在下一次同步时被覆盖。
2. **不要在两台 git.xen 上各推一版。** `10.144.144.12` 是 GitHub 的 pull 镜像（只读），往它推会被下次同步冲掉。
3. **本机 git 的 socks5 代理会把 `git.xen` 也代理掉**，导致凭据助手报 `ServicePointManager 不支持具有 socks5 方案的代理`。一次性修掉：

   ```bash
   git config --global "http.http://git.xen.proxy" ""
   git config --global "credential.http://git.xen.provider" generic
   ```

**账号与权限**：`git.xen` 已开放自助注册（无邮箱验证、无验证码），直接访问 http://git.xen/user/sign_up 建号即可。

- **读**：仓库是 public，匿名就能 `git clone`，不需要账号。
- **写**：需要管理员把你的账号加成该仓库的 Collaborator（Write 权限）。注册完把用户名发给管理员。
- **凭据**：用 Forgejo 的**访问令牌**（Settings → Applications → Generate New Token，勾 `write:repository`）当密码，不要用登录密码。

---

## 3. 目录结构

```
wrangler.toml            部署配置。唯一事实来源，见第 4 节第 1 条
src/index.js             入口：Host/路径分发、queue()/scheduled()。只做路由，不写业务
src/catalog.js           工具目录（数据）。门户和 JSON API 都读它
src/toolkit.js           浏览器端工具的元数据（数据）
src/portal-page.js       门户 HTML 渲染（内联 CSS/JS，无外部资源）
src/tools-page.js        工作台单页，13 个浏览器端工具的实现
src/favicon.js           内联 SVG favicon，零静态资源
packages/core/index.js     桶文件：工具只从这里 import
packages/core/response.js  统一响应格式、错误、CORS
packages/core/store.js     KV 适配器（带内存兜底）
packages/core/auth.js      管理面鉴权（Bearer + 签名 Cookie）
packages/core/bindings.js  能力探测：哪些绑定真的可用
packages/core/ai.js        Workers AI 适配器（chat / translate / embed）
packages/core/blobs.js     R2 适配器（带内存兜底 + 过期清理）
packages/core/db.js        D1 适配器 + 只读语句判定
packages/core/objects.js   Durable Object 类：Counter、Room
packages/core/quota.js     免费额度守卫：用量追踪 + 60% 熔断
packages/ui/theme.js       设计令牌 + 组件样式（全部 x- 前缀）
packages/ui/components.js  可复用片段：card / btn / field / table / login …
packages/ui/shell.js       工具页共用的页面外壳（内联 CSS）
tools/<id>/src/index.js    自包含工具模块
tools/<id>/wrangler.toml   未来拆成独立 Worker 的模板（当前不部署）
schema.sql                D1 建表脚本（/sql 控制台用）
test/smoke.test.mjs        端到端测试，直调 handleRequest
```

**分层原则**：`src/` 是门户和路由，`packages/` 是共享基础设施，`tools/` 是业务。`tools/` 只能 import `packages/`，**不能 import `src/`**（否则拆成独立 Worker 时会带着整个门户）。

### 3.1 页面只许用组件层

工具页的 HTML **不再手写**。所有片段来自 `packages/ui/components.js`，样式来自 `theme.js` 的 `x-` 前缀类，由 `shell()` 每页注入一次。

```js
import { page, card, btn, field, table, badge, notice, emptyState, loginCard } from "../../../packages/ui/components.js";
```

可用组件：`card` `btn` `field` `select` `checkbox` `badge` `notice` `emptyState` `stat`/`stats` `display` `table` `codeBlock` `toolbar` `section` `tabs` `chat` `dropzone` `copyLink` `meter`/`meterRow` `loginCard` `page`。

三条约束：

- **`page()` 是唯一出口**，它内部调 `shell()`。直接调 `shell()` 说明你在绕过标题/lead/actions 的排版。
- **不要新增页面级 CSS**。缺样式就往 `theme.js` 加一条 `x-` 规则 —— 加在页面里等于复制一份，正是重构前 23 个 `btn` 的成因。
- **组件只负责结构，数据一律转义**。`table()` 的单元格接受 HTML（为了内嵌 badge 和链接），所以**单元格里的用户数据必须由调用方先过 `escapeHtml()`**。

三处重复已合并的实例：ADMIN 登录卡片（原来 kv / sql / short 各一份，逐字相同）、`copyLink` 复制按钮（三处）、空状态（十处）。

---

## 4. 硬性规则

这些规则每一条都踩过坑，破了一定会出问题。

### 4.1 `wrangler.toml` 是唯一事实来源

Wrangler 部署时会**按配置文件重建**，控制台里手工加的绑定和域名会被**静默删除**。所以：

- KV 绑定必须写在 `[[kv_namespaces]]`
- 自定义域名必须写在 `routes`
- 密钥除外（`secret` 是独立通道，不进配置文件）

历史事故：控制台加过 KV 绑定，一次 `wrangler deploy` 后线上 `/paste/` 变成 `"storage":"memory"`，数据全丢。

### 4.2 TOML 顶层键必须写在第一个 `[table]` 之前

```toml
# 正确
routes = [...]
[observability]
enabled = true

# 错误：routes 会被解析成 observability.routes
[observability]
enabled = true
routes = [...]
```

写错时 wrangler **只报一句 warning 就继续部署**，域名没绑上但部署显示成功。改完 `wrangler.toml` 一定看部署输出里的 `custom domain` 行。

### 4.3 任何工具都不许占裸根路径

不允许出现 `/<something>` 这种单段路由。原因：短链、分享码、用户别名这类东西一旦占了根路径，以后每个新页面都要和随机字符串抢命名空间。

工具一律用路径前缀：`/paste/*`、`/s/*`、`/tools`。短码生成时还要过 `RESERVED` 集合兜底（见 `tools/short/src/index.js`）。

### 4.4 管理面必须 fail-closed

任何需要鉴权的路由，在密钥**没配置**时返回 401，不能放行。`createAuth()` 已经这么实现了，直接用，别自己写判断。

```js
const auth = createAuth(request, env, { cookieName: "xt_xxx" });
const authorized = await auth.authorized();   // 无密钥时恒为 false
```

### 4.5 门户不代理工具流量

门户只负责渲染链接，`/` 和 `/api/tools` 永远不转发到工具。这样某个工具挂了、升级出 bug 了，门户还是好的。工具之间也不互相调用。

### 4.6 所有页面资源内联

不许引入外部 CSS / JS / 字体 / 图片 / CDN。工具页要在「其他服务全挂」的情况下仍然完整可用。图标用内联 SVG（`src/portal-page.js` 的 `ICONS`）。

### 4.7 用户输入必须转义

服务端渲染用 `escapeHtml()`（`packages/ui/shell.js`）。客户端**只用 `textContent` / `createElement`，不许 `innerHTML` 拼用户数据**。

---

## 5. 请求是怎么分发的

`src/index.js` 的 `handleRequest` 按顺序匹配，命中即返回：

1. `OPTIONS` → CORS 预检直接 200
2. `/health`、`/ping`
3. `/favicon.svg`、`/favicon.ico`（302 到 svg）
4. `/tools` → 工作台（带 `Cache-Control: max-age=300`）
5. **Host 精确匹配**：`catalog.js` 里某个工具的 `host` 等于当前域名 → 交给它（用于未来绑定 `paste.xen.autos`）
6. `/` → 门户（`Accept: text/html` 返回 HTML，否则 JSON）
7. `/api/tools` → 目录 JSON
8. **路径前缀匹配**：`pathname` 等于或开始于某个工具的 `path`
9. 都没有 → 404

传给工具的 `ctx` 是**重新构造**的，不是原始 ExecutionContext：

```js
{
  path,       // 去掉前缀后的路径。请求 /s/abc → path 是 "/abc"
  basePath,   // 前缀本身，如 "/s"。生成绝对链接要用它
  host,       // 当前域名（已去端口、转小写）
  waitUntil,  // 已绑定的函数；直接传 ctx.waitUntil 会 detached 报错
}
```

`path` 和 `basePath` 的区别是最容易写错的地方：工具内部**只处理 `path`**，对外输出链接时拼 `host + basePath`。

---

## 6. 加一个服务端工具（有存储/有 API）

以 `id = "note"` 为例，四步。

### 6.1 写模块 `tools/note/src/index.js`

```js
import {
  json, html, health, fail, notFound,
  createStore, createAuth,
} from "../../../packages/core/index.js";
import { shell, escapeHtml } from "../../../packages/ui/shell.js";

const NO_STORE = { "Cache-Control": "no-store" };

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const basePath = ctx.basePath ?? "";
  const host = ctx.host ?? url.hostname;
  const store = createStore(env, "note");        // 前缀必须全局唯一
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-note");

  if (path === "/" && request.method === "GET") {
    if (wantsHtml) {
      return html(shell({ title: "笔记", basePath, body: "<h1>笔记</h1>" }), 200, NO_STORE);
    }
    return json({ tool: "note", storage: store.backend, durable: store.backend === "kv" });
  }

  return wantsHtml ? html(shell({ title: "笔记", basePath, body: "<h1>404</h1>" }), 404, NO_STORE) : notFound();
}

// 拆成独立 Worker 时用这个入口；进程内运行时它不会被调用
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
```

### 6.2 注册到 `src/catalog.js`

```js
{
  id: "note",
  name: "笔记",
  description: "一句话说清它解决什么问题。",
  path: "/note",          // 必须有前缀，不能是 "/"
  href: "/note/",         // 门户卡片点击地址
  host: "",               // 未来绑 note.xen.autos 时填这个值，路由会自动生效
  status: "available",    // planned = 只展示、不路由、访问 404
  tags: ["KV", "存储"],
},
```

### 6.3 注册到 `src/index.js`

```js
import * as note from "../tools/note/src/index.js";
const HANDLERS = { paste: paste.handle, short: short.handle, note: note.handle };
```

**顺序无所谓**，但如果两个工具路径互为前缀（`/a` 和 `/a/b`），`CATALOG` 里更长的那个要排在前面。

### 6.4 加测试（`test/smoke.test.mjs`）

```js
test("note creates and reads back", async () => {
  const res = await call("/note/");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).tool, "note");
});
```

`call(path, init, host, env, ctx)` 的默认 host 是 `tool.xen.autos`，env 是 `{}`（内存 KV）。

---

## 7. 加一个浏览器端工具（纯前端，零请求）

这类工具**不占 Worker CPU、不发请求、数据不出设备**，优先做这种。

两处改动：

1. `src/toolkit.js` 加一条元数据（`id` / `name` / `desc` / `category`）
2. `src/tools-page.js` 的 `CLIENT_JS` 里加一个 view 渲染函数

门户卡片会自动出现（`catalog.js` 从 `TOOLKIT` 生成），**不需要改 catalog**。

`CLIENT_JS` 是 `String.raw` 字符串，两条铁律：

- **不能包含反引号**
- **不能包含 `${`**（会被外层模板字符串吞掉）

所以内部一律用 `'` 引号和字符串拼接。DOM 用 `document.createElement` + `textContent`。

---

## 8. 现有接口速查

### 门户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | HTML（浏览器）或目录 JSON |
| GET | `/api/tools` | 目录 JSON |
| GET | `/tools` | 工作台单页，9 个浏览器端工具 |
| GET | `/health` · `/ping` | 健康检查 |

### paste

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/paste/` | 创建页（HTML）或能力说明（JSON） |
| POST | `/paste/api/paste` | 建：纯文本，或 `{"content":"…","ttl":604800,"burn":false}` |
| GET | `/paste/<id>` | 读；`?raw=1` 强制纯文本 |

TTL 60s ~ 30d，默认 7d，上限 64 KiB。`burn: true` 阅后即焚。

### short

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/s/<code>` | 公开 | 302 到目标 |
| GET | `/s/` | — | 未登录显示登录框，登录后是控制台 |
| POST | `/s/login` · `/s/logout` | — | 表单或 JSON |
| GET | `/s/api` | 需 | 列出全部链接 |
| POST | `/s/api` | 需 | 建：`{"url":"…","ttl":0}` |
| DELETE | `/s/api/<code>` | 需 | 删除 |
| GET | `/s/<code>+` | 需 | 点击数 |

鉴权两种：`Authorization: Bearer <ADMIN>`，或登录后拿到的签名 Cookie。

### ai（Workers AI）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/ai/` | — | 页面，或能力说明 JSON |
| POST | `/ai/api/summary` | 需 | `{"text":"…","style":"brief\|bullets\|outline"}` |
| POST | `/ai/api/translate` | 需 | `{"text":"…","source":"zh","target":"en"}` |
| POST | `/ai/api/embed` | 需 | `{"text":"…"}` → 向量 |
| POST | `/ai/api/similar` | 需 | `{"text":"…","candidates":["…"]}` |

鉴权默认 fail-closed；设 `AI_PUBLIC=true` 可开放（会产生推理费用）。上限 12000 字符。

### file（R2）

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/file/` | — | 上传页，或能力说明 |
| POST | `/file/api` | 需 | multipart 字段 `file`，或原始 body + `?name=&ttl=` |
| GET | `/file/<id>` | 公开 | 下载；`?download=1` 强制附件 |
| GET | `/file/api` | 需 | 列出对象 |
| DELETE | `/file/api/<id>` | 需 | 删除 |

上限 25 MB，TTL 300s ~ 30d。设 `FILE_PUBLIC=true` 可开放上传。

### hit / room（Durable Objects）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/hit/<name>` | 自增并返回；`?op=peek` 只读；`?op=reset` 归零 |
| GET | `/room/<name>` | WebSocket 升级即入房；无升级头返回房间概况 |

`Counter` 串行化写入，并发下计数精确；KV 做不到。`Room` 用休眠 API，空闲不计费。

### sql / kv（运维面，需要 ADMIN）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/sql/` · `/sql/login` | 控制台 / 登录 |
| GET | `/sql/api/schema` | 表、字段、行数 |
| POST | `/sql/api` | `{"sql":"select …"}`，**只读**，写语句在到达 D1 前被拒 |
| GET | `/kv/api?prefix=` | 列出键 |
| GET | `/kv/api/<key>` | 读值 |
| PUT · DELETE | `/kv/api/<key>` | **仅限 `kv:` 前缀**，其他工具的数据不可写入 |

### status

`GET /status/` — 所有绑定的可用性一览。排查「为什么某个工具 503」从这里开始。

---

## 9. 基础设施用法

### 存储 `createStore(env, prefix)`

```js
const store = createStore(env, "note");
await store.put(id, value, { expirationTtl: 3600 });  // ttl 单位秒，可选
await store.get(id);      // string | null
await store.delete(id);
await store.list({ limit: 200 });   // 返回 id 数组
store.backend;            // "kv" | "memory"
```

- 有 `KV` 绑定时走 KV，没有时退回**进程内存**（仅用于测试和本地，不持久）
- KV 前缀由 `prefix` 自动加，不同工具共用同一个 namespace 不会串
- KV 是**最终一致**的，写入后立刻读可能读到旧值；**没有原子自增**，计数类功能只能尽力而为

### 免费额度 `createQuota(env)`

```js
const quota = createQuota(env);

const gate = await quota.guard("r2", { storageBytes: bytes.byteLength, classA: 1 });
if (!gate.ok) return json(quotaError(gate), 507);   // 507 = 容量上限，不是限流

quota.bump("r2", { storageBytes: stored.size, classA: 1 });
ctx.waitUntil(quota.flush());                        // 分钟级合并写 KV
```

免费额度（官方数值，改之前先核对价格页）：

| 维度 | 免费上限 | 周期 | 超了会怎样 |
| --- | --- | --- | --- |
| D1 读取 | 5,000,000 行 | 天（00:00 UTC） | 查询失败，不扣费 |
| D1 写入 | 100,000 行 | 天（00:00 UTC） | 写入失败，不扣费 |
| D1 存储 | 5 GB | — | 无法新增 |
| R2 存储 | 10 GB | 月 | **开始计费** |
| R2 Class A | 1,000,000 | 月 | **开始计费** |
| R2 Class B | 10,000,000 | 月 | **开始计费** |

**熔断点固定在 60%**（`SAFETY_RATIO`）。留 40% 的原因不是保守：计数器按分钟合并写 KV（KV 自己每天只有 1,000 次写），isolate 又短命，所以数值必然是近似的；剩下的余量也是清理动作必须的 —— 到达上限后还得能删除文件。

两个必须知道的点：

- **D1 按扫描行数计费，不按返回行数。** 未建索引的列做过滤会全表扫描，一次查询就能吃掉几十万行额度。`/sql` 会把 `meta.rows_read` 记进配额，并在超过 60% 后拒绝执行任何语句（`guard("d1")` 在无增量参数时也会返回 blocked）。
- **R2 超限才扣钱，所以上传是"先检查后写"。** `file` 在写入前用 `guard()` 判断 `已用 + 本次大小`，超阈值直接 507，一个字节都不写。

### 鉴权 `createAuth(request, env, opts)`

```js
const auth = createAuth(request, env, { cookieName: "xt_note" });
auth.configured;              // 密钥是否已配置
await auth.authorized();      // 是否通过（Bearer 或 Cookie）
auth.checkPassword(pw);       // 常时比较
await auth.sessionCookie();   // Set-Cookie 的值
auth.clearedCookie();         // 清除用
```

密钥名默认 `ADMIN`，Cookie 是 `<exp>.<HMAC-SHA256(secret, exp)>`，无状态。**换密钥 = 所有人登出**。

### 页面外壳 `shell({ title, body, basePath, script, style })`

返回完整 HTML 文档，内联深色主题 CSS，自动注入 `window.__BASE = basePath` 供客户端拼接口路径。`style` 是页面级追加 CSS。

### 能力探测 `capabilities(env)`

```js
import { capabilities } from "../../../packages/core/index.js";
const caps = capabilities(env);
caps.ai;      // true 仅当 env.AI.run 是函数
caps.r2;      // true 仅当 env.R2.put/get 都是函数
```

新增工具时**不要自己嗅探 env**：一处判断，`/status` 和各工具的降级行为才不会说法不一。

### Workers AI `createAI(env)`

```js
const ai = createAI(env);
ai.available;                                    // 未绑定为 false
await ai.chat({ prompt, system, maxTokens });    // → string
await ai.translate({ text, source, target });    // → string
await ai.embed(text);                            // → number[]
```

未绑定时抛 `AIUnavailable`，工具应转成 503，而不是让异常冒到 500。

### 对象存储 `createBlobs(env, prefix)`

```js
const blobs = createBlobs(env, "file");
await blobs.put(id, bytes, { contentType, expiresIn, name });
await blobs.get(id);        // { body, size, contentType, name, expiresAt } | null
await blobs.delete(id);
await blobs.list({ limit: 100 });
await blobs.sweepExpired(); // cron 调用
blobs.backend;              // "r2" | "memory"
```

R2 **没有 TTL**：过期时间写进 `customMetadata.expiresAt`，读时兜底删除，cron 每 15 分钟回收一次。

### D1 `createDb(env)`

```js
const db = createDb(env);
db.available;
await db.all("select 1");          // { rows, meta }
await db.run("insert …");          // { meta }
isReadOnly(sql);                   // 只读语句判定（/sql 用）
```

### Durable Objects

类在 `packages/core/objects.js`，由 `src/index.js` 重新导出——**runtime 按 `class_name` 从入口模块解析导出名**，少一处就会在部署时报「class not found」。

```js
const stub = env.COUNTER.get(env.COUNTER.idFromName("deploys"));
const res = await stub.fetch(new URL("https://do/?op=inc"));
```

测试里给一个 `{ idFromName, get: () => ({ fetch }) }` 的假命名空间即可，不需要真 DO。

---

## 10. 已知坑

| 现象 | 原因 / 处理 |
| --- | --- |
| 部署成功但域名没绑上 | `routes` 写在了 `[observability]` 后面，被解析成 `observability.routes` |
| 线上 `"storage":"memory"` | 控制台加的 KV 绑定被 `wrangler deploy` 删了，写进 `wrangler.toml` |
| `ctx.waitUntil` 报 detached / illegal invocation | 方法被当值传出去了，要包一层 `(p) => ctx.waitUntil(p)` |
| 客户端脚本语法错误 | `String.raw` 里混进了反引号或 `${` |
| 测试之间互相污染 | `createStore` 的内存 Map 是模块级的，整个测试进程共享。用不同的 id 前缀，别假设清空 |
| 自定义域名绑不上 | Custom Domain 只支持精确匹配，**不支持通配符**；且域名不能已存在同名 A/CNAME 记录 |
| `wrangler` 版本警告 | 当前锁 3.114，v4 升级需要单独验证，不要顺手升 |
| 302 后计数没变 | KV 最终一致，且计数走 `waitUntil` 后台写，刷新有延迟属正常 |
| 部署版本号对不上 | Git 构建和手动 `wrangler deploy` 各发一次，谁后完成谁生效。看 `npx wrangler deployments list` 里的 `Source` 区分 |
| 查不到 webhook 就以为没集成 | GitHub App 的 webhook 配在 App 层，**不会**出现在 `repos/<owner>/<repo>/hooks` 里。要看 check runs 或部署记录 |
| 部署报 `database_id` / bucket 无效 | 用了占位 ID。R2 / D1 / Queues / Vectorize 必须先建资源，拿到真实 ID 再放开注释。否则整次构建失败，自动部署一起挂 |
| 部署报 `class not found` | Durable Object 类没从入口模块导出。`src/index.js` 里的 `export { Counter, Room }` 不能少 |
| `String.raw` 里写了 `${}` 却不报错 | `String.raw` 只关掉转义，**不关掉插值**。`${` 会被静默求值，页面照常返回但脚本是错的。提交前抽出客户端脚本跑一遍 `node --check` |
| 缺绑定的工具返回 500 而不是 503 | 直接用了 `env.XXX`。先过 `capabilities(env)` 或用对应适配器的 `available` |

---

## 11. 提交前检查清单

```bash
npm test               # 必须全绿，一个都不能跳
npm run deploy:dry     # 看包体积有没有异常膨胀（当前 ~83 KiB / gzip ~23 KiB）
```

再加人工确认：

- [ ] 新工具占的是 `/<prefix>/*`，不是裸根路径
- [ ] 管理面没密钥时是 401，不是放行
- [ ] 用户输入都过了 `escapeHtml` 或 `textContent`
- [ ] 新页面没有外部资源引用（搜一遍 `https://` 和 `<script src`）
- [ ] 新工具在缺绑定时返回 503 + 可操作的提示，不是 500
- [ ] 加了绑定就跑一次 `/status/`，确认这一项变成「可用」
- [ ] 改了工作台客户端脚本：抽出来 `node --check` 一遍
- [ ] 改了 `wrangler.toml` 就看部署输出里的绑定和域名行
- [ ] `.dev.vars`、`.shots/`、`node_modules/`、`dist/` 没进 git

提交信息用祈使句，说清「为什么」而不只是「改了什么」：

```
Gate short links behind ADMIN and move them under /s/

The apex root was a short-code namespace, which would collide with every
future page.
```

---

## 12. 路线图候选

按「值得做」排序，挑一个开工就行。做完记得更新 `src/catalog.js` 里的 `status`。

**浏览器端（成本最低，不占 Worker CPU）**
- 二维码生成 / 解析（需要完整的 QR 编码器，约 300 行位级代码；本地没有解码器可验证，建议单独一轮做并配手工扫码核对）
- 时区批量转换
- 图片压缩 / 格式转换

**边缘端**
- Vectorize → `/vector` 语义检索（catalog 里 `status` 已是 `planned`，代码要走 `capabilities().vectorize`）
- Queues 接管过期清理（现在 cron 已够用，队列只在「cron 跑失败也要清」时才值得）
- D1 写入型工具（现在 `/sql` 只读，`schema.sql` 已经留了 `notes` 表）

**平台能力**
- **把 `npm test` 挂进构建**：现在 Build command 是 `None`，测试挂了照样能部署。改成 `npm test && npx wrangler deploy`（或加一个 `predeploy`）就能挡住。这是当前最大的缺口
- 给 `/api/tools` 加 OpenAPI 描述
- 工具级限流（AI 和上传现在只靠 ADMIN 把关，没有频率限制）
- 短链计数改用 `Counter` DO，替换现在的最终一致方案

---

## 13. 不要做的事

- 不要把 `tools/` 里的代码 import 到 `src/` 之外的地方，也不要在 `tools/` 里 import `src/`
- 不要在 `wrangler.toml` 里写密钥
- 不要为了让某个测试过而放宽断言（尤其是鉴权相关的）
- 不要给门户加外部依赖
- 不要在没有 `Cache-Control: no-store` 的情况下返回含用户数据的响应
- 不要在 `git push` 之后紧接着手动 `wrangler deploy`，两次发布会互相覆盖（谁后完成算谁的）
