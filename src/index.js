/**
 * xentool — single Worker entry.
 *
 * Zero-config by design: one Worker, one `npx wrangler deploy`.
 *   tool.xen.autos  → portal + tools under path prefixes (/paste, /s, /tools)
 *   xen.autos       → same, plus short links at the root (/abc123)
 *
 * Tools are self-contained modules under tools/<id>/. If a dedicated hostname
 * is bound later (e.g. paste.xen.autos), the same module is served by host
 * automatically — no code change required.
 *
 * The portal never proxies tool traffic. Tool modules run in-process today;
 * promoting one to its own Worker later only changes deployment, not routing.
 */
import { json, html, health, notFound, PROTOCOL_VERSION } from "../packages/core/index.js";
import { CATALOG, SITE, portalTools } from "./catalog.js";
import { renderPortal } from "./portal-page.js";
import { renderToolsPage } from "./tools-page.js";
import { FAVICON_SVG, FAVICON_HEADERS } from "./favicon.js";
import * as paste from "../tools/paste/src/index.js";
import * as short from "../tools/short/src/index.js";

const HANDLERS = { paste: paste.handle, short: short.handle };

// Hosts where the short-link tool owns the root path, so links are as short as
// possible (xen.autos/abc123). Adding a host here is the only change needed
// once the domain is bound as a Custom Domain on this Worker.
const APEX_HOSTS = new Set(["xen.autos"]);

// On the apex, the tool's own control surface folds back to basePath "".
const APEX_SHORT_ALIASES = new Map([
  ["/s", "/"],
  ["/s/", "/"],
]);

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
    // On an apex host the short tool drops its prefix, so generated links are
    // xen.autos/abc123 instead of xen.autos/s/abc123 (both keep working).
    const basePath = APEX_HOSTS.has(host) && byPath.id === "short" ? "" : byPath.path;
    const path = url.pathname.slice(byPath.path.length) || "/";
    return HANDLERS[byPath.id](request, env, toolContext({ path, basePath, host }, ctx));
  }

  // Apex fallback: a single path segment that no real route claimed is a short
  // code. Anything deeper stays a 404 so typos don't get masked.
  if (APEX_HOSTS.has(host) && /^\/[^/]*$/.test(url.pathname)) {
    const path = APEX_SHORT_ALIASES.get(url.pathname) ?? url.pathname;
    return HANDLERS.short(request, env, toolContext({ path, basePath: "", host }, ctx));
  }

  return notFound();
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};