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
import { CATALOG } from "./catalog.js";
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
  if (url.pathname === "/") return portal(request, host);
  if (url.pathname === "/api/tools") {
    return json({ protocol: PROTOCOL_VERSION, tools: CATALOG });
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

function portal(request, host) {
  const tools = CATALOG.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    href: `${tool.path}/`,
    host: tool.host,
    status: tool.status,
  }));

  if ((request.headers.get("accept") || "").includes("text/html")) {
    const items = tools
      .map(
        (t) =>
          `<li><a href="${t.href}">${t.name}</a> — ${t.description} <code>${t.href}</code></li>`,
      )
      .join("");
    return html(
      `<!doctype html><meta charset="utf-8"><title>xentool</title>` +
        `<h1>xentool</h1><p>${host}</p><ul>${items}</ul>` +
        `<p><a href="/api/tools">/api/tools</a> · <a href="/health">/health</a></p>`,
    );
  }

  return json({ name: "xentool", host, protocol: PROTOCOL_VERSION, tools });
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
