/**
 * Shared wire protocol. Keep this file extremely stable: every Worker builds
 * responses through it, so a change here means all Workers must be redeployed.
 * Protocol version: 1
 */

export const PROTOCOL_VERSION = 1;

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "X-Xentool-Protocol": String(PROTOCOL_VERSION),
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...BASE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function text(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...BASE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export function notFound(what = "Not Found") {
  return fail(what, 404);
}

export function health(service) {
  return json({ service, status: "ok", protocol: PROTOCOL_VERSION, timestamp: Date.now() });
}
