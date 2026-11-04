/**
 * xentool — single Worker entry (tool.xen.autos).
 *
 * Zero-config by design: one Worker, one domain, one `npx wrangler deploy`.
 * Tools are self-contained modules under tools/<id>/ and are reached by path.
 * If a dedicated hostname is bound later (e.g. paste.xen.autos), the same
 * module is served by host automatically — no code change required.
 *
 * The portal never proxies tool traffic. Tool modules run in-process today;
 * promoting one to its own Worker later only changes deployment, not routing.
 */
import { json, html, health, notFound, PROTOCOL_VERSION } from "../packages/core/index.js";
import { CATALOG, SITE, portalTools } from "./catalog.js";
import { renderPortal } from "./portal-page.js";
import { FAVICON_SVG, FAVICON_HEADERS } from "./favicon.js";
import * as paste from "../tools/paste/src/index.js";

const HANDLERS = { paste: paste.handle };

export async function handleRequest(request, env = {}) {
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

  // Dedicated hostname (optional, activates as soon as the domain is bound).
  const byHost = CATALOG.find((tool) => tool.host === host);
  if (byHost && HANDLERS[byHost.id]) {
    return HANDLERS[byHost.id](request, env, {
      path: url.pathname,
      basePath: "",
      host,
    });
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
    return HANDLERS[byPath.id](request, env, {
      path: url.pathname.slice(byPath.path.length) || "/",
      basePath: byPath.path,
      host,
    });
  }

  return notFound();
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
