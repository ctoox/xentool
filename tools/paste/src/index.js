/**
 * Paste tool — self-contained module.
 *
 * Works in-process today (tool.xen.autos/paste/) and as a standalone Worker
 * later (paste.xen.autos) without changing this file: the default export is
 * the standalone Worker entry, `handle` is the in-process entry.
 */
import { json, text, health, fail, notFound, createStore } from "../../../packages/core/index.js";

const MAX_BYTES = 64 * 1024;
const MIN_TTL = 60;
const DEFAULT_TTL = 7 * 24 * 3600;
const MAX_TTL = 30 * 24 * 3600;
const ID_PATTERN = /^[a-z0-9]{6,16}$/;

export async function handle(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const path = ctx.path ?? url.pathname;
  const host = ctx.host ?? url.hostname;
  const basePath = ctx.basePath ?? "";
  const store = createStore(env, "paste");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (path === "/health") return health("xentool-paste");

  if (path === "/" && request.method === "GET") {
    return json({
      tool: "paste",
      storage: store.backend,
      durable: store.backend === "kv",
      limits: { maxBytes: MAX_BYTES, minTtl: MIN_TTL, maxTtl: MAX_TTL, defaultTtl: DEFAULT_TTL },
      usage: {
        create: `POST ${basePath}/api/paste  (plain text or {"content":"...","ttl":604800})`,
        read: `GET ${basePath}/<id>`,
      },
    });
  }

  if (path === "/api/paste" && request.method === "POST") {
    return create(request, store, host, basePath);
  }

  const id = path.slice(1);
  if (request.method === "GET" && ID_PATTERN.test(id)) {
    const value = await store.get(id);
    if (value === null || value === undefined) return notFound("Paste not found or expired");
    return text(value);
  }

  return notFound();
}

async function create(request, store, host, basePath) {
  const raw = await request.text();
  const size = new TextEncoder().encode(raw).length;
  if (!raw || size > MAX_BYTES) {
    return fail(`content must be 1-${MAX_BYTES} bytes`, size > MAX_BYTES ? 413 : 400);
  }

  let content = raw;
  let ttl = DEFAULT_TTL;

  if ((request.headers.get("content-type") || "").includes("application/json")) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return fail("invalid JSON", 400);
    }
    if (typeof payload?.content !== "string") return fail("content must be a string", 400);
    content = payload.content;
    if (payload.ttl !== undefined) {
      if (!Number.isInteger(payload.ttl) || payload.ttl < MIN_TTL || payload.ttl > MAX_TTL) {
        return fail(`ttl must be an integer between ${MIN_TTL} and ${MAX_TTL}`, 400);
      }
      ttl = payload.ttl;
    }
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  await store.put(id, content, { expirationTtl: ttl });

  return json(
    {
      id,
      url: `https://${host}${basePath}/${id}`,
      expiresIn: ttl,
      storage: store.backend,
    },
    201,
  );
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    return handle(request, env, { path: url.pathname, basePath: "", host: url.hostname });
  },
};
