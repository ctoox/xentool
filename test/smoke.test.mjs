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
  assert.equal(body.tools[0].id, "paste");
  assert.equal(body.tools[0].path, "/paste");
  assert.equal(body.tools[0].href, "/paste/");

  const page = await call("/", { headers: { accept: "text/html" } });
  const html = await page.text();
  assert.match(html, /<!doctype html>/);
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /href="\/paste\/"/);
  assert.match(html, /itools/);
  assert.match(html, /已上线/);
  assert.match(html, /即将上线/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /github\.com\/ctoox\/xentool/);
  assert.doesNotMatch(html, /<script src=/);
  assert.equal(body.tools.length, 6);
  assert.equal(body.tools[1].status, "planned");
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
  assert.equal(data.get(`paste:${id}`), "durable");
  assert.equal(await (await call(`/paste/${id}`, {}, "tool.xen.autos", env)).text(), "durable");

  const info = await call("/paste/", {}, "tool.xen.autos", env);
  assert.equal((await info.json()).durable, true);
});

test("dedicated host routes to the same tool without code changes", async () => {
  const res = await call("/api/paste", { method: "GET" }, "paste.xen.autos");
  assert.equal(res.status, 404);

  const info = await call("/", {}, "paste.xen.autos");
  assert.equal((await info.json()).tool, "paste");
});

test("unknown routes return 404", async () => {
  assert.equal((await call("/nope")).status, 404);
  assert.equal((await call("/paste/does-not-exist")).status, 404);
  // planned tools are listed in the catalog but have no handler yet
  assert.equal((await call("/chat/")).status, 404);
});
