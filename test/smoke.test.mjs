import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/index.js";
import { CATALOG } from "../src/catalog.js";

/**
 * Tools that serve a page under their own path prefix.
 *
 * `status: "available"` filters out the planned entries, which have no
 * handler; `/tools` is the workbench and lives at the apex rather than under a
 * tool prefix.
 */
const PAGE_TOOLS = CATALOG.filter((tool) => tool.status === "available" && tool.path.startsWith("/") && tool.path !== "/tools");

function call(path, init = {}, host = "tool.xen.autos", env = {}, ctx = {}) {
  return handleRequest(new Request(`https://${host}${path}`, init), env, ctx);
}

test("health and ping", async () => {
  const health = await call("/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "xentool");

  const ping = await call("/ping");
  assert.equal((await ping.json()).pong, true);
});

test("portal renders a complete standalone page", async () => {
  const res = await call("/");
  const body = await res.json();
  assert.equal(body.tools[0].id, "url");
  assert.equal(body.tools[0].path, "/tools");
  assert.equal(body.tools[0].href, "/tools#url");

  const page = await call("/", { headers: { accept: "text/html" } });
  const html = await page.text();
  assert.match(html, /<!doctype html>/);
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /href="\/paste\/"/);
  assert.match(html, /href="\/s\/"/);
  assert.match(html, /xentool/);
  assert.match(html, /已上线/);
  assert.match(html, /即将上线/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /github\.com\/ctoox\/xentool/);
  assert.match(html, /rel="icon"/);
  assert.match(html, /theme-color/);
  assert.doesNotMatch(html, /<script src=/);
  assert.equal(body.tools.length, 52);
  assert.equal(body.tools.filter((t) => t.status === "planned").length, 1);
});

test("paste create then read via path", async () => {
  const created = await call("/paste/api/paste", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "hello xentool",
  });
  assert.equal(created.status, 201);
  const { id, url } = await created.json();
  assert.match(url, /^https:\/\/tool\.xen\.autos\/paste\//);

  const read = await call(`/paste/${id}`);
  assert.equal(read.status, 200);
  assert.equal(await read.text(), "hello xentool");
});

test("paste accepts JSON body with ttl", async () => {
  const created = await call("/paste/api/paste", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "json body", ttl: 120 }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal(await (await call(`/paste/${id}`)).text(), "json body");
});

test("paste uses the dashboard KV binding when present", async () => {
  const data = new Map();
  const env = {
    KV: {
      get: async (key) => (data.has(key) ? data.get(key) : null),
      put: async (key, value) => {
        data.set(key, value);
      },
    },
  };
  const created = await call(
    "/paste/api/paste",
    { method: "POST", body: "durable" },
    "tool.xen.autos",
    env,
  );
  assert.equal(created.status, 201);
  const { id, storage } = await created.json();
  assert.equal(storage, "kv");
  assert.equal(JSON.parse(data.get(`paste:${id}`)).content, "durable");
  assert.equal(await (await call(`/paste/${id}`, {}, "tool.xen.autos", env)).text(), "durable");

  const info = await call("/paste/", {}, "tool.xen.autos", env);
  assert.equal((await info.json()).durable, true);
});

test("paste renders a create page for browsers", async () => {
  const res = await call("/paste/", { headers: { accept: "text/html" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /创建链接/);
  assert.match(html, /阅后即焚/);
  assert.match(html, /返回工具库/);
});

test("paste view page escapes content and supports raw output", async () => {
  const created = await call("/paste/api/paste", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "<b>hi</b>", ttl: 120 }),
  });
  const { id } = await created.json();

  const page = await call(`/paste/${id}`, { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("cache-control"), /no-store/);
  const html = await page.text();
  assert.match(html, /&lt;b&gt;hi&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>hi<\/b>/);

  const raw = await call(`/paste/${id}?raw=1`, { headers: { accept: "text/html" } });
  assert.equal(await raw.text(), "<b>hi</b>");
});

test("burn after read destroys the paste", async () => {
  const created = await call("/paste/api/paste", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "once", ttl: 120, burn: true }),
  });
  const { id, burn } = await created.json();
  assert.equal(burn, true);
  assert.equal(await (await call(`/paste/${id}`)).text(), "once");
  assert.equal((await call(`/paste/${id}`)).status, 404);
});

test("dedicated host routes to the same tool without code changes", async () => {
  const res = await call("/api/paste", { method: "GET" }, "paste.xen.autos");
  assert.equal(res.status, 404);

  const info = await call("/", {}, "paste.xen.autos");
  assert.equal((await info.json()).tool, "paste");
});

test("favicon is served and legacy .ico redirects", async () => {
  const svg = await call("/favicon.svg");
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get("content-type"), /image\/svg\+xml/);
  assert.match(await svg.text(), /<svg/);

  const ico = await call("/favicon.ico");
  assert.equal(ico.status, 302);
  assert.equal(ico.headers.get("location"), "/favicon.svg");
});

test("workbench page renders the browser toolkit", async () => {
  const res = await call("/tools");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  assert.match(res.headers.get("cache-control"), /max-age=300/);
  const html = await res.text();
  assert.match(html, /id="meta"/);
  assert.match(html, /URL 编码/);
  assert.match(html, /颜色转换/);
  assert.match(html, /返回工具库/);
  assert.doesNotMatch(html, /<script src=/);
});

test("every tool page exposes the base path its client script needs", async () => {
  // Regression: page() used to drop basePath, so window.__BASE stayed empty and
  // client fetches hit /api/... at the apex. The AI page came back "Not Found"
  // and read as a model failure rather than a routing bug.
  const env = {
    ADMIN: "test-admin-secret",
    AI: { run: async () => ({ response: "x", translated_text: "x", data: [[0.1]] }) },
    R2: { put: async () => ({}), get: async () => null, delete: async () => {}, list: async () => ({ objects: [] }) },
  };
  // The list comes from the catalog rather than a hand-written array: an
  // earlier version of this test named six tools and quietly excluded the
  // ones it had broken. A new tool must be covered the day it is added.
  for (const tool of PAGE_TOOLS) {
    // /hit and /room legitimately answer 503 without their Durable Object
    // binding — the page still must be complete enough to explain that.
    const res = await call(`${tool.path}/`, { headers: { accept: "text/html", authorization: `Bearer ${env.ADMIN}` } }, "tool.xen.autos", env);
    assert.ok([200, 503].includes(res.status), `${tool.path}/ should render a page, got ${res.status}`);
    const html = await res.text();
    const declared = html.match(/window\.__BASE=("[^"]*"|'[^']*');/);
    assert.ok(declared, `${tool.path}/ must declare window.__BASE`);
    // The prefix keeps its leading slash: the client concatenates it with a
    // route like "/api/translate", so "/ai" + "/api/translate" is the URL.
    assert.equal(declared[1], JSON.stringify(tool.path), `${tool.path}/ must declare its own prefix`);
  }
});

test("no tool page renders a server error", async () => {
  // A leftover `style: SHORT_CSS` threw a ReferenceError and turned the whole
  // page into a 500. The symptom pointed at the wrong file, so the cheapest
  // guard is to render every tool and require a status below 500. 503 is fine:
  // that is how a tool says "this capability is not bound", and it still
  // renders a complete page explaining so.
  const env = {
    ADMIN: "test-admin-secret",
    AI: { run: async () => ({ response: "x", translated_text: "x", data: [[0.1]] }) },
    R2: { put: async () => ({}), get: async () => null, delete: async () => {}, list: async () => ({ objects: [] }) },
  };
  for (const tool of PAGE_TOOLS) {
    const res = await call(`${tool.path}/`, { headers: { accept: "text/html", authorization: `Bearer ${env.ADMIN}` } }, "tool.xen.autos", env);
    // 503 is a legitimate answer — it is how a tool says "this capability is
    // not bound here", and it still renders a page explaining so. What must
    // never happen is a 500: that is a crash, typically an undefined
    // reference in the page renderer.
    assert.ok(res.status < 500 || res.status === 503, `${tool.path}/ rendered ${res.status} — a crash, not a missing capability`);
  }
});

test("ai page gates browsers with a login form instead of returning 401 JSON", async () => {
  const env = { ADMIN: "test-admin-secret", AI: { run: async () => ({ translated_text: "Hello" }) } };

  const gate = await call("/ai/", { headers: { accept: "text/html" } }, "tool.xen.autos", env);
  assert.equal(gate.status, 401);
  const gateHtml = await gate.text();
  assert.match(gateHtml, /\/ai\/login/, "the gate must post to the tool's own prefix");

  const login = await call(
    "/ai/login",
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "password=test-admin-secret" },
    "tool.xen.autos",
    env,
  );
  assert.equal(login.status, 303);
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^xt_ai=/);

  const page = await call("/ai/", { headers: { accept: "text/html", cookie } }, "tool.xen.autos", env);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /translate-text/);

  const translated = await call(
    "/ai/api/translate",
    { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ text: "你好", source: "zh", target: "en" }) },
    "tool.xen.autos",
    env,
  );
  assert.equal(translated.status, 200);
  assert.equal((await translated.json()).translation, "Hello");
});

test("portal carries a display category for every tool", async () => {
  const body = await (await call("/")).json();
  // The chips are built from these; a missing category silently collapses
  // every new tool into "其他" as the catalog grows past 100.
  for (const tool of body.tools) {
    assert.ok(tool.category && tool.category !== "其他", `${tool.id} needs an explicit category`);
  }
  const groups = new Set(body.tools.map((tool) => tool.category));
  assert.ok(groups.size >= 5, `expected several categories, got ${[...groups].join(", ")}`);
});

const ADMIN = "test-admin-secret";
const ADMIN_ENV = { ADMIN };
const BEARER = { authorization: `Bearer ${ADMIN}` };

async function createLink(url, env = ADMIN_ENV, host = "tool.xen.autos") {
  const res = await call(
    "/s/api",
    {
      method: "POST",
      headers: { ...BEARER, "content-type": "application/json" },
      body: JSON.stringify({ url }),
    },
    host,
    env,
  );
  return { res, body: await res.json() };
}

test("short is closed without the admin secret", async () => {
  const payload = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "example.com" }),
  };

  // secret bound, but the caller did not present it
  const anon = await call("/s/api", payload, "tool.xen.autos", ADMIN_ENV);
  assert.equal(anon.status, 401);

  // no ADMIN bound at all: still closed, never open by default
  const unset = await call("/s/api", payload, "tool.xen.autos", {});
  assert.equal(unset.status, 401);

  // a wrong bearer is rejected too
  const wrong = await call(
    "/s/api",
    { ...payload, headers: { ...payload.headers, authorization: "Bearer wrong-secret" } },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.equal(wrong.status, 401);

  const info = await call("/s/", {}, "tool.xen.autos", ADMIN_ENV);
  assert.equal((await info.json()).admin, "required");
  assert.equal((await (await call("/s/", {})).json()).admin, "unset");
});

test("short creates, redirects and counts clicks", async () => {
  const { res, body } = await createLink("example.com/path");
  assert.equal(res.status, 201);
  const { code, short, target } = body;
  assert.equal(target, "https://example.com/path");
  assert.equal(short, `https://tool.xen.autos/s/${code}`);

  // the redirect itself is public
  const visit = await call(`/s/${code}`);
  assert.equal(visit.status, 302);
  assert.equal(visit.headers.get("location"), "https://example.com/path");
  assert.match(visit.headers.get("cache-control"), /no-store/);

  // stats are not
  assert.equal((await call(`/s/${code}+`)).status, 401);
  const stats = await call(`/s/${code}+`, { headers: BEARER }, "tool.xen.autos", ADMIN_ENV);
  const statsBody = await stats.json();
  assert.equal(statsBody.code, code);
  assert.equal(statsBody.hits, 1);
});

test("short console is gated and login issues a signed cookie", async () => {
  const locked = await call("/s/", { headers: { accept: "text/html" } }, "tool.xen.autos", ADMIN_ENV);
  assert.equal(locked.status, 200);
  assert.match(locked.headers.get("cache-control"), /no-store/);
  assert.match(await locked.text(), /需要管理员口令/);

  const wrong = await call(
    "/s/login",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "password=nope",
    },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.equal(wrong.status, 303);
  assert.match(wrong.headers.get("location"), /e=1/);
  assert.equal(wrong.headers.get("set-cookie"), null);

  const ok = await call(
    "/s/login",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `password=${ADMIN}`,
    },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.equal(ok.status, 303);
  const setCookie = ok.headers.get("set-cookie");
  assert.match(setCookie, /xt_short=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);

  const cookie = setCookie.split(";")[0];
  const unlocked = await call(
    "/s/",
    { headers: { accept: "text/html", cookie } },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  const page = await unlocked.text();
  assert.match(page, /短链控制台/);
  assert.match(page, /生成短链/);
  assert.match(page, /已有链接/);
  assert.match(page, /返回工具库/);

  // a tampered cookie is rejected
  const forged = `${cookie.split(".")[0]}.deadbeef`;
  const denied = await call(
    "/s/",
    { headers: { accept: "text/html", cookie: forged } },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.match(await denied.text(), /需要管理员口令/);
});

test("short console warns when ADMIN is not bound", async () => {
  const res = await call("/s/", { headers: { accept: "text/html" } });
  assert.match(await res.text(), /还没有配置 ADMIN/);
});

test("short lists and deletes links", async () => {
  const { body } = await createLink("https://example.com/to-remove");
  const { code } = body;

  const list = await call("/s/api", { headers: BEARER }, "tool.xen.autos", ADMIN_ENV);
  assert.equal(list.status, 200);
  const listing = await list.json();
  assert.ok(listing.links.some((link) => link.code === code && link.target === "https://example.com/to-remove"));

  const removed = await call(
    `/s/api/${code}`,
    { method: "DELETE", headers: BEARER },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).deleted, true);
  assert.equal((await call(`/s/${code}`)).status, 404);
});

test("the apex root is not a short code namespace", async () => {
  const { body } = await createLink("https://xen.autos/tools", ADMIN_ENV, "xen.autos");
  assert.equal(body.short, `https://xen.autos/s/${body.code}`);

  // /<code> must stay a 404 so future pages keep the root path free
  assert.equal((await call(`/${body.code}`, {}, "xen.autos")).status, 404);
  assert.equal((await call(`/${body.code}+`, {}, "xen.autos")).status, 404);

  const portal = await call("/", { headers: { accept: "text/html" } }, "xen.autos");
  assert.match(await portal.text(), /xentool/);
});

test("short rejects invalid input and unknown codes", async () => {
  const bad = await call(
    "/s/api",
    {
      method: "POST",
      headers: { ...BEARER, "content-type": "application/json" },
      body: JSON.stringify({ url: "not a url" }),
    },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.equal(bad.status, 400);

  const badTtl = await call(
    "/s/api",
    {
      method: "POST",
      headers: { ...BEARER, "content-type": "application/json" },
      body: JSON.stringify({ url: "example.com", ttl: 5 }),
    },
    "tool.xen.autos",
    ADMIN_ENV,
  );
  assert.equal(badTtl.status, 400);

  assert.equal((await call("/s/zzzzzzzz")).status, 404);
});

test("a missing resource renders an HTML page, not a server error", async () => {
  // The JSON branch answered 404 correctly while the HTML branch threw a
  // ReferenceError and answered 500 — the same request shape, two different
  // renderers, and only one of them was exercised. Ask for both.
  const html = await call("/s/zzzzzzzz", { headers: { accept: "text/html" } }, "tool.xen.autos", ADMIN_ENV);
  assert.equal(html.status, 404, "a missing short link is a 404, never a 500");
  const body = await html.text();
  assert.match(body, /<!doctype html>/i, "the browser should get a page, not a stack trace");
  assert.doesNotMatch(body, /ReferenceError/, "no unhandled reference may reach the browser");
});

test("short counts clicks through waitUntil without blocking the redirect", async () => {
  const { body } = await createLink("https://example.com/async");
  const { code } = body;

  const pending = [];
  const visit = await call(
    `/s/${code}`,
    {},
    "tool.xen.autos",
    {},
    { waitUntil: (promise) => pending.push(promise) },
  );
  assert.equal(visit.status, 302);
  assert.equal(pending.length, 1, "click count must go through waitUntil");

  await Promise.all(pending);
  const stats = await call(`/s/${code}+`, { headers: BEARER }, "tool.xen.autos", ADMIN_ENV);
  assert.equal((await stats.json()).hits, 1);
});

test("unknown routes return 404", async () => {
  assert.equal((await call("/nope")).status, 404);
  assert.equal((await call("/paste/does-not-exist")).status, 404);
  // planned tools are listed in the catalog but have no handler yet
  assert.equal((await call("/ai/summary")).status, 404);
});

/* ---------------------------------------------------- platform capability */

test("tools fail closed when their binding is absent", async () => {
  // The discovery endpoint stays readable — that is how a client learns *why*
  // a tool is unavailable. Operations, not descriptions, are what fail.
  for (const path of ["/file/", "/sql/", "/hit/", "/room/"]) {
    const info = await call(path);
    assert.equal(info.status, 200, `${path} should describe itself`);
    assert.equal((await info.json()).available, false, `${path} should report unavailable`);
  }

  // HTML pages explain the gap instead of rendering an empty shell.
  const page = await call("/file/", { headers: { accept: "text/html" } });
  assert.equal(page.status, 503);
  assert.match(await page.text(), /R2/);

  const ai = await call("/ai/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ text: "hello" }),
  }, "tool.xen.autos", ADMIN_ENV);
  assert.equal(ai.status, 503);
  assert.match((await ai.json()).error, /Workers AI/);
});

test("status reports bindings without leaking values", async () => {
  const bare = await call("/status/");
  assert.equal(bare.status, 200);
  const bareBody = await bare.json();
  assert.equal(bareBody.total, 9);
  assert.equal(bareBody.bindings.find((b) => b.key === "ai").available, false);

  const withAI = await call("/status/", {}, "tool.xen.autos", { AI: { run: async () => ({}) } });
  assert.equal((await withAI.json()).bindings.find((b) => b.key === "ai").available, true);

  const page = await call("/status/", { headers: { accept: "text/html" } });
  const html = await page.text();
  assert.match(html, /平台能力/);
  assert.match(html, /Workers AI/);
  assert.doesNotMatch(html, /test-admin-secret/);
});

/* ------------------------------------------------------------------ AI */

function fakeAI() {
  return {
    async run(model, inputs) {
      if (model.includes("llama")) return { response: "一句话摘要" };
      if (model.includes("m2m100")) return { translated_text: "hello world" };
      return { data: [new Array(1024).fill(0.01)] };
    },
  };
}

test("ai is gated and returns model output when authorized", async () => {
  const env = { AI: fakeAI(), ADMIN };

  const anon = await call("/ai/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "长文" }),
  }, "tool.xen.autos", env);
  assert.equal(anon.status, 401);

  const ok = await call("/ai/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ text: "长文", style: "bullets" }),
  }, "tool.xen.autos", env);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).summary, "一句话摘要");

  const translated = await call("/ai/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ text: "你好", source: "zh", target: "en" }),
  }, "tool.xen.autos", env);
  assert.equal((await translated.json()).translation, "hello world");

  const embedded = await call("/ai/api/embed", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ text: "向量" }),
  }, "tool.xen.autos", env);
  assert.equal((await embedded.json()).dimensions, 1024);
});

test("ai rejects oversized input and allows public mode when opted in", async () => {
  const env = { AI: fakeAI(), ADMIN, AI_PUBLIC: "true" };

  const tooBig = await call("/ai/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(12001) }),
  }, "tool.xen.autos", env);
  assert.equal(tooBig.status, 413);

  const open = await call("/ai/api/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "公开模式" }),
  }, "tool.xen.autos", env);
  assert.equal(open.status, 200);
});

/* ---------------------------------------------------------------- file */

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, { httpMetadata, customMetadata }) {
      objects.set(key, { value, httpMetadata, customMetadata });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        body: found.value,
        size: found.value.byteLength,
        httpMetadata: found.httpMetadata,
        customMetadata: found.customMetadata,
      };
    },
    async delete(key) {
      objects.delete(key);
    },
    async list({ prefix = "", limit = 100 } = {}) {
      const out = [];
      for (const [key, value] of objects) {
        if (!key.startsWith(prefix)) continue;
        out.push({ key, size: value.value.byteLength, customMetadata: value.customMetadata });
        if (out.length >= limit) break;
      }
      return { objects: out };
    },
  };
}

test("file uploads to R2 and serves the bytes back", async () => {
  const r2 = fakeR2();
  const env = { R2: r2, ADMIN };

  const denied = await call(
    "/file/api?name=hello.txt",
    { method: "POST", headers: { "content-type": "text/plain" }, body: "nope" },
    "tool.xen.autos",
    env,
  );
  assert.equal(denied.status, 401);

  const ok = await call(
    "/file/api?name=hello.txt",
    { method: "POST", headers: { "content-type": "text/plain", authorization: `Bearer ${ADMIN}` }, body: "file body" },
    "tool.xen.autos",
    env,
  );
  assert.equal(ok.status, 201);
  const created = await ok.json();
  assert.equal(created.storage, "r2");
  assert.match(created.url, /^https:\/\/tool\.xen\.autos\/file\//);

  const download = await call(`/file/${created.id}`, {}, "tool.xen.autos", env);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "text/plain");
  assert.equal(await download.text(), "file body");

  const missing = await call("/file/0000000000000000", {}, "tool.xen.autos", env);
  assert.equal(missing.status, 404);
});

test("file rejects empty uploads and reports the memory backend in tests", async () => {
  const info = await call("/file/");
  const body = await info.json();
  assert.equal(body.storage, "memory");
  assert.equal(body.durable, false);

  const empty = await call(
    "/file/api",
    { method: "POST", headers: { authorization: `Bearer ${ADMIN}` }, body: "" },
    "tool.xen.autos",
    { ADMIN },
  );
  assert.equal(empty.status, 503, "no R2 binding means upload is unavailable");
});

/* ------------------------------------------------------------ durable */

test("hit counter delegates to the COUNTER namespace", async () => {
  const seen = [];
  const env = {
    COUNTER: {
      idFromName: (name) => `id:${name}`,
      get: (id) => ({
        async fetch(request) {
          const target = request instanceof URL ? request : new URL(request.url);
          const op = target.searchParams.get("op");
          seen.push(`${id}:${op}`);
          return new Response(JSON.stringify({ value: 7, op }));
        },
      }),
    },
  };

  const res = await call("/hit/deploys", {}, "tool.xen.autos", env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.value, 7);
  assert.equal(body.name, "deploys");
  assert.deepEqual(seen, ["id:deploys:inc"]);

  const bad = await call("/hit/bad%20name", {}, "tool.xen.autos", env);
  assert.equal(bad.status, 400);
});

test("room hands the upgrade request to the ROOM namespace", async () => {
  let forwarded = false;
  const env = {
    ROOM: {
      idFromName: (name) => name,
      get: () => ({
        async fetch() {
          forwarded = true;
          return new Response(JSON.stringify({ room: "/lobby", clients: 0 }), { status: 200 });
        },
      }),
    },
  };

  const info = await call("/room/lobby", {}, "tool.xen.autos", env);
  assert.equal(info.status, 200);
  assert.equal(forwarded, true);
  assert.equal((await info.json()).room, "/lobby");
});

/* ------------------------------------------------------------------ sql */

function fakeD1(rows) {
  const statement = {
    bind: () => statement,
    all: async () => ({ results: rows, meta: {} }),
    run: async () => ({ meta: {} }),
  };
  return { prepare: () => statement };
}

test("sql console is read-only and admin only", async () => {
  const env = { DB: fakeD1([{ n: 1 }]), ADMIN };

  const anon = await call("/sql/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sql: "select 1" }),
  }, "tool.xen.autos", env);
  assert.equal(anon.status, 401);

  const write = await call("/sql/api", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ sql: "delete from notes" }),
  }, "tool.xen.autos", env);
  assert.equal(write.status, 403);

  const read = await call("/sql/api", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ sql: "select count(*) as n from notes" }),
  }, "tool.xen.autos", env);
  assert.equal(read.status, 200);
  const result = await read.json();
  assert.equal(result.rowCount, 1);
  assert.deepEqual(result.rows, [{ n: 1 }]);
});

/* ------------------------------------------------------------------- kv */

function fakeKV(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix = "", limit = 100 } = {}) {
      const keys = [];
      for (const key of data.keys()) {
        if (!key.startsWith(prefix)) continue;
        keys.push({ name: key });
        if (keys.length >= limit) break;
      }
      return { keys };
    },
  };
}

test("kv console lists everything but only writes under kv:", async () => {
  const env = { KV: fakeKV({ "paste:abc": "x", "kv:note": "hello" }), ADMIN };

  const anon = await call("/kv/api", {}, "tool.xen.autos", env);
  assert.equal(anon.status, 401);

  const list = await call("/kv/api", { headers: BEARER }, "tool.xen.autos", env);
  const body = await list.json();
  assert.equal(body.count, 2);
  assert.equal(body.keys.find((k) => k.name === "kv:note").editable, true);
  assert.equal(body.keys.find((k) => k.name === "paste:abc").editable, false);

  const blocked = await call(
    "/kv/api/paste%3Aabc",
    { method: "PUT", headers: BEARER, body: "overwrite" },
    "tool.xen.autos",
    env,
  );
  assert.equal(blocked.status, 403);
  assert.equal(env.KV.data.get("paste:abc"), "x", "foreign tool data must stay intact");

  const written = await call(
    "/kv/api/kv%3Anote",
    { method: "PUT", headers: BEARER, body: "updated" },
    "tool.xen.autos",
    env,
  );
  assert.equal(written.status, 200);
  assert.equal(env.KV.data.get("kv:note"), "updated");
});

/* ------------------------------------------------------------- workbench */

test("workbench exposes the new browser-side tools", async () => {
  const page = await (await call("/tools")).text();
  assert.match(page, /CIDR 计算/);
  assert.match(page, /Cron 解释/);
  assert.match(page, /文本对比/);
  assert.match(page, /Markdown 预览/);
  // the embedded client script must stay free of template-literal syntax
  assert.doesNotMatch(page, /<script src=/);
});

test("every listed browser tool is actually implemented", async () => {
  const { TOOLKIT } = await import("../src/toolkit.js");
  const { CORE_SOURCES } = await import("../src/toolkit-core-sources.js");
  const html = await (await call("/tools")).text();

  // A tool that is in the catalog but has no view renders "该工具暂未实现" —
  // the same dead end the planned entries used to create. Catch it here
  // instead of in a browser.
  const implemented = new Set([...html.matchAll(/VIEWS\.([a-zA-Z0-9]+)\s*=/g)].map((m) => m[1]));
  const missing = TOOLKIT.filter((tool) => !implemented.has(tool.id)).map((tool) => tool.id);
  assert.deepEqual(missing, [], `tools without a view: ${missing.join(", ")}`);

  // Views import their logic from /core/<name>; a typo there would only show
  // up as a failed import in the browser.
  const requested = new Set([...html.matchAll(/core\('([a-z-]+\.js)'\)/g)].map((m) => m[1]));
  const unknown = [...requested].filter((name) => !Object.hasOwn(CORE_SOURCES, name));
  assert.deepEqual(unknown, [], `views ask for unknown core modules: ${unknown.join(", ")}`);
});
