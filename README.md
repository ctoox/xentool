# xentool

AI 工具库，运行在 Cloudflare Workers 边缘。**一个 Worker、一个域名、零额外配置** —— push 到 `main` 即触发 Cloudflare 项目 `xentool`（`npx wrangler deploy`，root `/`），服务立刻在 `tool.xen.autos` 生效。

门户是深色、可搜索的工具库界面（光晕背景、玻璃卡片、指针跟随与卡片倾斜），完全内联渲染，无任何外部 CSS/JS/字体/图片依赖，因此门户不会因第三方资源失效而变丑或变慢。

> 要加新工具或接手这个仓库，先读 [AGENTS.md](./AGENTS.md)——里面有分层规则、加工具的完整步骤和所有已知坑。

## Live endpoints

| Path | Description |
| --- | --- |
| `GET /` | Portal page (HTML for browsers, JSON otherwise) |
| `GET /api/tools` | Machine-readable catalog |
| `GET /tools` | Workbench: 13 browser-side tools (URL, Base64, JSON, JWT, hash, UUID, timestamp, regex, color, CIDR, cron, diff, Markdown) |
| `GET /health` | Portal health + protocol version |
| `GET /ping` | Liveness probe |
| `GET /status/` | Capability dashboard — which Cloudflare bindings are live |
| `GET /ai/` · `POST /ai/api/{summary,translate,embed,similar}` | Workers AI (admin by default) |
| `GET /file/` · `POST /file/api` · `GET /file/<id>` | R2 file share, 25 MB, TTL up to 30 d |
| `GET /hit/<name>` | Exact counter via Durable Object (`?op=peek` or `?op=reset`) |
| `GET /room/<name>` | WebSocket broadcast room via Durable Object |
| `GET /sql/` · `POST /sql/api` | Read-only D1 console (admin) |
| `GET /kv/` · `GET /kv/api` | KV console; writes restricted to the `kv:` prefix (admin) |
| `GET /paste/` | Paste tool info and limits |
| `POST /paste/api/paste` | Create a paste: plain text or `{"content":"...","ttl":604800}` |
| `GET /paste/<id>` | Read a paste |
| `GET /s/` | Short link console — login, create, list, delete (admin) |
| `POST /s/login` | Password → signed session cookie |
| `POST /s/logout` | Clear the session cookie |
| `GET /s/api` | List links (admin) |
| `POST /s/api` | Create a short link: `{"url":"https://example.com","ttl":0}` (admin) |
| `DELETE /s/api/<code>` | Delete a link (admin) |
| `GET /s/<code>` | 302 to the target — **public** |
| `GET /s/<code>+` | Click stats (admin) |

Short links require the `ADMIN` secret. Create it once:

```bash
npx wrangler secret put ADMIN          # production
# local dev: put ADMIN=... in .dev.vars (gitignored)
```

Then either sign in at `https://tool.xen.autos/s/`, or use the bearer form:

```bash
A=$(cat ~/.xentool-admin)   # or paste it

curl -X POST https://xen.autos/s/api -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' -d '{"url":"github.com/ctoox/xentool"}'
# -> {"code":"rs5ztj","short":"https://xen.autos/s/rs5ztj", ...}

curl -sI https://xen.autos/s/rs5ztj | head -1          # HTTP/1.1 302 Found
curl -s  https://xen.autos/s/rs5ztj+ -H "Authorization: Bearer $A" | jq .hits
curl -s  https://xen.autos/s/api     -H "Authorization: Bearer $A" | jq .count
```

```bash
curl -X POST https://tool.xen.autos/paste/api/paste \
  -H 'Content-Type: text/plain' --data 'hello xentool'
# -> {"id":"...","url":"https://tool.xen.autos/paste/<id>", ...}
```

Storage uses the KV binding `KV` (namespace `tool`). Both the KV binding and the Custom Domains are declared in `wrangler.toml` on purpose: Wrangler treats that file as the source of truth and drops anything that only exists in the dashboard.

**Verify after deploy:** `GET /paste/` should report `"storage":"kv","durable":true`. If it reports `"memory"`, the deploy replaced the dashboard binding; add `[[kv_namespaces]]` with `binding = "KV"` and the namespace id to `wrangler.toml`.

Click counts are best-effort: KV has no atomic increment and is eventually consistent, so concurrent hits can undercount. The write goes through `ctx.waitUntil()` so the redirect is never delayed. `/hit/<name>` exists for the cases where exactness matters.

### Cloudflare capabilities

`/status/` is the single place to see what is actually available. The platform surface splits into two groups, and the difference matters at deploy time:

**Enabled by the config alone** — no resource has to exist first, so they are always on:

| Binding | Powers |
| --- | --- |
| `KV` | paste, short links, KV console |
| `AI` (`[ai]`) | summary, translation, embeddings |
| `COUNTER` / `ROOM` (Durable Objects + `[[migrations]]`) | exact counters, WebSocket rooms |
| Cache API | edge caching (no binding needed) |

**Requires a pre-created resource** — declared in `wrangler.toml` but commented out, because a placeholder id fails the build and takes auto-deploy down with it:

```bash
npx wrangler r2 bucket create xentool-files     # then uncomment [[r2_buckets]]
npx wrangler d1 create xentool                  # copy the id, uncomment [[d1_databases]]
npx wrangler d1 execute xentool --file=./schema.sql --remote
npx wrangler queues create xentool-tasks        # optional, cron already sweeps
```

Every tool degrades instead of crashing: with the binding absent, the JSON endpoint reports `"available": false` and the operation returns 503 with the exact line to add. Nothing silently half-works.

### Admin auth

`packages/core/auth.js` is a ~100 line primitive shared by any tool that needs an admin surface:

- **Bearer** (`Authorization: Bearer <ADMIN>`) for curl and scripts.
- **Signed cookie** for browsers: `<exp>.<hmac-sha256(secret, exp)>`, so it is stateless — no session store, no KV read, and rotating the secret logs everyone out.
- Comparison is constant-time; a wrong secret leaks no timing signal.
- **Fails closed.** With no `ADMIN` bound, every admin route returns 401 and the console shows setup instructions instead of a login form. A missing secret can never mean "open".

## Architecture

Planning is kept in the code structure, not in the deployment topology.

```
wrangler.toml          portal Worker (the only deployed Worker today)
src/index.js           thin entry + Host/path dispatch + scheduled()/queue()
src/catalog.js         tool catalog — DATA, not logic
src/portal-page.js     standalone portal HTML (no external CSS/JS/assets)
packages/core/         shared wire protocol (response format, errors, adapters)
packages/core/bindings.js  capability probe — one source of truth for "is it on?"
packages/core/ai.js    Workers AI adapter (chat / translate / embed)
packages/core/blobs.js R2 adapter with expiry, memory fallback for tests
packages/core/db.js    D1 adapter + read-only statement guard
packages/core/objects.js   Durable Objects: Counter, Room
packages/core/auth.js  admin auth primitive: bearer + signed cookie, fails closed
packages/ui/shell.js   shared page shell for tool UIs (inline CSS, no assets)
tools/<id>/src/        self-contained tool module, exports handle()
tools/<id>/wrangler.toml  template for a future standalone Worker
schema.sql             D1 schema for the SQL console
test/                  plain Node tests, no wrangler or credentials needed
```

Rules that keep future splitting cheap:

1. **The portal never proxies tool traffic.** It only links to tools. A tool upgrade can never break the portal.
2. **Tools are self-contained.** Each exports `handle(request, env, ctx)` and a `default` Worker entry. Running it in-process or as its own Worker is a deployment decision, not a code change.
3. **`packages/core` stays minimal and versioned.** Everything shares it, so a change there requires redeploying all Workers. Protocol code only, no business logic.
4. **Adding a tool** = create `tools/<id>/src/index.js`, add one entry to `src/catalog.js`, add one line to `HANDLERS` in `src/index.js`. Push, done.
5. **No tool may claim the bare root path.** `/<code>` style routes would put every future page in the same namespace as random short codes, so short links live under `/s/` and the apex root stays free. `tools/short` also keeps a `RESERVED` set so a generated code can never shadow a real route.
6. **Admin surfaces fail closed.** Anything gated by `createAuth()` returns 401 when the secret is absent — an unconfigured deploy is locked, never open.

## Promote a tool to its own Worker (when needed)

Worth doing when a tool needs independent quotas, its own release cadence, or different bindings (R2 / Durable Objects / D1).

1. Bind a Custom Domain (`<id>.xen.autos`) to a new Worker — exact match only, no wildcards. Cloudflare issues the certificate automatically.
2. Deploy with `npx wrangler deploy --config tools/<id>/wrangler.toml` (or point a new CF project at that config).
3. `src/index.js` already routes that hostname to the same module. No portal change.

Do this per tool, not upfront: it adds one deploy unit and one domain binding each time.

## Local development

```bash
npm test          # plain Node, no credentials
npm run dev       # wrangler dev (reads ADMIN from .dev.vars)
npm run deploy:dry
```
