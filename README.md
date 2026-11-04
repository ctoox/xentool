# xentool

AI 工具库，运行在 Cloudflare Workers 边缘。**一个 Worker、一个域名、零额外配置** —— push 到 `main` 即触发 Cloudflare 项目 `xentool`（`npx wrangler deploy`，root `/`），服务立刻在 `tool.xen.autos` 生效。

门户是深色、可搜索的工具库界面（光晕背景、玻璃卡片、指针跟随与卡片倾斜），完全内联渲染，无任何外部 CSS/JS/字体/图片依赖，因此门户不会因第三方资源失效而变丑或变慢。

## Live endpoints

| Path | Description |
| --- | --- |
| `GET /` | Portal page (HTML for browsers, JSON otherwise) |
| `GET /api/tools` | Machine-readable catalog |
| `GET /tools` | Workbench: 9 browser-side tools (URL, Base64, JSON, JWT, hash, UUID, timestamp, regex, color) |
| `GET /health` | Portal health + protocol version |
| `GET /ping` | Liveness probe |
| `GET /paste/` | Paste tool info and limits |
| `POST /paste/api/paste` | Create a paste: plain text or `{"content":"...","ttl":604800}` |
| `GET /paste/<id>` | Read a paste |

```bash
curl -X POST https://tool.xen.autos/paste/api/paste \
  -H 'Content-Type: text/plain' --data 'hello xentool'
# -> {"id":"...","url":"https://tool.xen.autos/paste/<id>", ...}
```

Storage uses the KV binding `KV` (namespace `tool`, configured in the Cloudflare dashboard). No namespace id is committed and no code branch is needed — `createStore()` picks `env.KV` automatically and only falls back to in-memory when the binding is absent.

**Verify after deploy:** `GET /paste/` should report `"storage":"kv","durable":true`. If it reports `"memory"`, the deploy replaced the dashboard binding; add `[[kv_namespaces]]` with `binding = "KV"` and the namespace id to `wrangler.toml`.

## Architecture

Planning is kept in the code structure, not in the deployment topology.

```
wrangler.toml          portal Worker (the only deployed Worker today)
src/index.js           thin entry + Host/path dispatch
src/catalog.js         tool catalog — DATA, not logic
src/portal-page.js     standalone portal HTML (no external CSS/JS/assets)
packages/core/         shared wire protocol (response format, errors, KV adapter)
tools/<id>/src/        self-contained tool module, exports handle()
tools/<id>/wrangler.toml  template for a future standalone Worker
test/                  plain Node tests, no wrangler or credentials needed
```

Rules that keep future splitting cheap:

1. **The portal never proxies tool traffic.** It only links to tools. A tool upgrade can never break the portal.
2. **Tools are self-contained.** Each exports `handle(request, env, ctx)` and a `default` Worker entry. Running it in-process or as its own Worker is a deployment decision, not a code change.
3. **`packages/core` stays minimal and versioned.** Everything shares it, so a change there requires redeploying all Workers. Protocol code only, no business logic.
4. **Adding a tool** = create `tools/<id>/src/index.js`, add one entry to `src/catalog.js`, add one line to `HANDLERS` in `src/index.js`. Push, done.

## Promote a tool to its own Worker (when needed)

Worth doing when a tool needs independent quotas, its own release cadence, or different bindings (R2 / Durable Objects / D1).

1. Bind a Custom Domain (`<id>.xen.autos`) to a new Worker — exact match only, no wildcards. Cloudflare issues the certificate automatically.
2. Deploy with `npx wrangler deploy --config tools/<id>/wrangler.toml` (or point a new CF project at that config).
3. `src/index.js` already routes that hostname to the same module. No portal change.

Do this per tool, not upfront: it adds one deploy unit and one domain binding each time.

## Local development

```bash
npm test          # plain Node, no credentials
npm run dev       # wrangler dev
npm run deploy:dry
```
