import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/index.js";

function call(path, init = {}, host = "tool.xen.autos", env = {}) {
  return handleRequest(new Request(`https://${host}${path}`, init), env, {});
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
  assert.equal(body.tools.length, 13);
  assert.equal(body.tools.filter((t) => t.status === "planned").length, 2);
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

test("short link creates, redirects and counts clicks", async () => {
  const created = await call("/s/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "example.com/path" }),
  });
  assert.equal(created.status, 201);
  const { code, short, target } = await created.json();
  assert.equal(target, "https://example.com/path");
  assert.equal(short, `https://tool.xen.autos/s/${code}`);

  const visit = await call(`/s/${code}`);
  assert.equal(visit.status, 302);
  assert.equal(visit.headers.get("location"), "https://example.com/path");
  assert.match(visit.headers.get("cache-control"), /no-store/);

  const stats = await call(`/s/${code}+`);
  const body = await stats.json();
  assert.equal(body.code, code);
  assert.equal(body.hits, 1);
});

test("apex serves short codes at the root", async () => {
  const created = await call(
    "/api",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://xen.autos/tools" }),
    },
    "xen.autos",
  );
  assert.equal(created.status, 201);
  const { code, short } = await created.json();
  assert.equal(short, `https://xen.autos/${code}`);

  const visit = await call(`/${code}`, {}, "xen.autos");
  assert.equal(visit.status, 302);
  assert.equal(visit.headers.get("location"), "https://xen.autos/tools");

  // the portal still owns the apex root
  const portal = await call("/", { headers: { accept: "text/html" } }, "xen.autos");
  assert.match(await portal.text(), /xentool/);

  // on the apex the /s prefix is dropped from generated links
  const page = await call("/s/", { headers: { accept: "text/html" } }, "xen.autos");
  assert.match(await page.text(), /xen\.autos\/abc123/);
  assert.doesNotMatch(await (await call("/s/", { headers: { accept: "text/html" } }, "xen.autos")).text(), /xen\.autos\/s\/abc123/);
});

test("short rejects invalid input and unknown codes", async () => {
  const bad = await call("/s/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "not a url" }),
  });
  assert.equal(bad.status, 400);

  const badTtl = await call("/s/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "example.com", ttl: 5 }),
  });
  assert.equal(badTtl.status, 400);

  assert.equal((await call("/s/zzzzzzzz")).status, 404);
});

test("short renders a create page for browsers", async () => {
  const res = await call("/s/", { headers: { accept: "text/html" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/html/);
  const html = await res.text();
  assert.match(html, /短链/);
  assert.match(html, /生成短链/);
  assert.match(html, /返回工具库/);
});

test("unknown routes return 404", async () => {
  assert.equal((await call("/nope")).status, 404);
  assert.equal((await call("/paste/does-not-exist")).status, 404);
  // planned tools are listed in the catalog but have no handler yet
  assert.equal((await call("/ai/summary")).status, 404);
});
