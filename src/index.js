/**
 * xentool - Cloudflare Worker
 * A utility tool worker deployed on Cloudflare Workers.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/") {
      return jsonResponse({
        name: "xentool",
        status: "ok",
        timestamp: new Date().toISOString(),
        endpoints: ["/", "/ping", "/info"],
      });
    }

    if (url.pathname === "/ping") {
      return jsonResponse({ pong: true, timestamp: Date.now() });
    }

    if (url.pathname === "/info") {
      return jsonResponse({
        worker: "xentool",
        region: request.cf?.colo ?? "unknown",
        country: request.cf?.country ?? "unknown",
        city: request.cf?.city ?? "unknown",
        ip: request.headers.get("cf-connecting-ip") ?? "unknown",
      });
    }

    return jsonResponse({ error: "Not Found", path: url.pathname }, 404);
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
