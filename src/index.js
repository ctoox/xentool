/**
 * xentool — single Worker entry.
 *
 * Zero-config by design: one Worker, one `npx wrangler deploy`.
 *   tool.xen.autos  → portal + tools under path prefixes (/paste, /s, /tools)
 *   xen.autos       → the same, so the apex stays available for future use
 *
 * Tools are self-contained modules under tools/<id>/. If a dedicated hostname
 * is bound later (e.g. paste.xen.autos), the same module is served by host
 * automatically — no code change required.
 *
 * The portal never proxies tool traffic. Tool modules run in-process today;
 * promoting one to its own Worker later only changes deployment, not routing.
 *
 * Routing rule: no tool may claim the bare root path. `/<code>` style routes
 * would make every future page share a namespace with random short codes, so
 * short links live under /s/ and the root stays free.
 */
import { json, html, health, notFound, PROTOCOL_VERSION, createBlobs } from "../packages/core/index.js";
import { CATALOG, SITE, portalTools } from "./catalog.js";
import { renderPortal } from "./portal-page.js";
import { renderToolsPage } from "./tools-page.js";
import { FAVICON_SVG, FAVICON_HEADERS } from "./favicon.js";
import * as paste from "../tools/paste/src/index.js";
import * as short from "../tools/short/src/index.js";
import * as ai from "../tools/ai/src/index.js";
import * as file from "../tools/file/src/index.js";
import * as kv from "../tools/kv/src/index.js";
import * as sql from "../tools/sql/src/index.js";
import * as hit from "../tools/hit/src/index.js";
import * as room from "../tools/room/src/index.js";
import * as status from "../tools/status/src/index.js";

const HANDLERS = {
  paste: paste.handle,
  short: short.handle,
  ai: ai.handle,
  file: file.handle,
  kv: kv.handle,
  sql: sql.handle,
  hit: hit.handle,
  room: room.handle,
  status: status.handle,
};

// Durable Object classes must be exported from the entry module; the runtime
// resolves `class_name` in wrangler.toml against these exports.
export { Counter, Room } from "../packages/core/objects.js";

/**
 * Builds the context handed to tool modules. `waitUntil` is re-bound rather
 * than passed by reference: ExecutionContext methods throw when detached.
 */
function toolContext({ path, basePath, host }, ctx) {
  return {
    path,
    basePath,
    host,
    waitUntil:
      typeof ctx?.waitUntil === "function" ? (promise) => ctx.waitUntil(promise) : undefined,
  };
}

export async function handleRequest(request, env = {}, ctx = {}) {
  const url = new URL(request.url);
  const host = (request.headers.get("host") || url.hostname)
    .split(":")[0]
    .toLowerCase()
    .replace(/\.$/, "");

  if (request.method === "OPTIONS") return json({ ok: true });
  if (url.pathname === "/health") return health("xentool");
  if (url.pathname === "/ping") return json({ pong: true, timestamp: Date.now() });

  if (url.pathname === "/favicon.svg") {
    return new Response(FAVICON_SVG, { headers: FAVICON_HEADERS });
  }
  if (url.pathname === "/favicon.ico") {
    return new Response(null, {
      status: 302,
      headers: { Location: "/favicon.svg", "Cache-Control": "public, max-age=86400" },
    });
  }

  // Workbench: browser-side tools, cached briefly at the edge.
  if (url.pathname === "/tools" || url.pathname === "/tools/") {
    return html(renderToolsPage({ host, site: SITE }), 200, {
      "Cache-Control": "public, max-age=300",
    });
  }

  // Dedicated hostname (optional, activates as soon as the domain is bound).
  const byHost = CATALOG.find((tool) => tool.host && tool.host === host);
  if (byHost && HANDLERS[byHost.id]) {
    return HANDLERS[byHost.id](request, env, toolContext({ path: url.pathname, basePath: "", host }, ctx));
  }

  // Portal + path routing (default, works immediately after deploy).
  if (url.pathname === "/") {
    const tools = portalTools();
    if ((request.headers.get("accept") || "").includes("text/html")) {
      return html(renderPortal({ tools, host, site: SITE }));
    }
    return json({ name: "xentool", host, protocol: PROTOCOL_VERSION, tools });
  }
  if (url.pathname === "/api/tools") {
    return json({ protocol: PROTOCOL_VERSION, tools: portalTools() });
  }

  const byPath = CATALOG.find(
    (tool) => url.pathname === tool.path || url.pathname.startsWith(`${tool.path}/`),
  );
  if (byPath && HANDLERS[byPath.id]) {
    const path = url.pathname.slice(byPath.path.length) || "/";
    return HANDLERS[byPath.id](request, env, toolContext({ path, basePath: byPath.path, host }, ctx));
  }

  return notFound();
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  /**
   * Cron entry point. R2 has no TTL, so expired objects are swept here — the
   * read path already hides them, this just reclaims the storage. Without an
   * R2 binding the sweep is a no-op rather than an error: the trigger stays
   * configured, the deployment stays valid.
   */
  async scheduled(controller, env, ctx) {
    const blobs = createBlobs(env, "file");
    if (blobs.backend !== "r2") return;
    ctx.waitUntil(blobs.sweepExpired({ limit: 200 }));
  },

  /**
   * Queue consumer. Kept intentionally thin: the only background job today is
   * the same expiry sweep, dispatched from the cron trigger. A queue is useful
   * once expiry has to survive a failed cron run.
   */
  async queue(batch, env, ctx) {
    const blobs = createBlobs(env, "file");
    for (const message of batch.messages) {
      if (message.body?.type !== "sweep") {
        message.ack();
        continue;
      }
      ctx.waitUntil(
        blobs
          .sweepExpired({ limit: 200 })
          .then(() => message.ack())
          .catch(() => message.retry()),
      );
    }
  },
};