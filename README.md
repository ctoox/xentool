# xentool

Cloudflare Worker tool platform. **One Worker, one domain, zero extra config** — pushing to `main` triggers the Cloudflare project `xentool` (`npx wrangler deploy`, root `/`) and the service is immediately live at `tool.xen.autos`.

## Live endpoints

| Path | Description |
| --- | --- |
| `GET /` | Tool catalog (HTML for browsers, JSON otherwise) |
| `GET /api/tools` | Machine-readable catalog |
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

By default storage is an in-memory fallback (per-isolate, **not durable**). To make pastes persist, create a KV namespace and uncomment `[[kv_namespaces]]` in `wrangler.toml` for binding `XENTOOL_KV`. No code change needed — `createStore()` switches backend automatically.

## Architecture

Planning is kept in the code structure, not in the deployment topology.

```
wrangler.toml          portal Worker (the only deployed Worker today)
src/index.js           thin entry + Host/path dispatch
src/catalog.js         tool catalog — DATA, not logic
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
