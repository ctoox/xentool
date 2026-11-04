import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../src/index.js";

function call(path, init = {}, host = "tool.xen.autos") {
  return handleRequest(new Request(`https://${host}${path}`, init), {}, {});
}

test("health and ping", async () => {
  const health = await call("/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "xentool");

  const ping = await call("/ping");
  assert.equal((await ping.json()).pong, true);
});

test("portal lists tools in JSON and HTML", async () => {
  const res = await call("/");
  const body = await res.json();
  assert.equal(body.tools[0].id, "paste");
  assert.equal(body.tools[0].path, "/paste");

  const html = await call("/", { headers: { accept: "text/html" } });
  assert.match(await html.text(), /href="\/paste\/"/);
  assert.equal(body.tools[0].href, "/paste/");
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

test("dedicated host routes to the same tool without code changes", async () => {
  const res = await call("/api/paste", { method: "GET" }, "paste.xen.autos");
  assert.equal(res.status, 404);

  const info = await call("/", {}, "paste.xen.autos");
  assert.equal((await info.json()).tool, "paste");
});

test("unknown routes return 404", async () => {
  assert.equal((await call("/nope")).status, 404);
  assert.equal((await call("/paste/does-not-exist")).status, 404);
});
