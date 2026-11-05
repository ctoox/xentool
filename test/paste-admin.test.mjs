import test from "node:test";
import assert from "node:assert/strict";

import { handle } from "../tools/paste/src/index.js";

const BASE = { path: "/api/paste", basePath: "/paste", host: "tool.xen.autos" };
const ADMIN = { ADMIN: "test-admin-token" };

async function createPaste(body, env = {}) {
  const response = await handle(
    new Request("https://tool.xen.autos/paste/api/paste", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    BASE,
  );
  assert.equal(response.status, 201);
  return response.json();
}

function adminRequest(path, { method = "GET", token = "test-admin-token", env = ADMIN } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return handle(
    new Request(`https://tool.xen.autos/paste${path}`, { method, headers }),
    env,
    { ...BASE, path },
  );
}

test("admin listing requires the ADMIN token", async () => {
  const created = await createPaste({ content: "secret" });

  const anonymous = await adminRequest("/api/admin/pastes", { token: "" });
  assert.equal(anonymous.status, 401);

  const wrong = await adminRequest("/api/admin/pastes", { token: "nope" });
  assert.equal(wrong.status, 401);

  // No ADMIN configured on the server means the door stays shut, not open.
  const unconfigured = await adminRequest("/api/admin/pastes", { env: {} });
  assert.equal(unconfigured.status, 401);

  const allowed = await adminRequest("/api/admin/pastes");
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.ok(body.items.some((item) => item.id === created.id));
});

test("admin listing reports size and preview without reading the value", async () => {
  const created = await createPaste({ content: "line one\nline two" });
  const body = await (await adminRequest("/api/admin/pastes")).json();
  const item = body.items.find((entry) => entry.id === created.id);

  assert.equal(item.size, "line one\nline two".length);
  assert.equal(item.preview, "line one line two");
  assert.equal(item.burn, false);
  assert.ok(item.expiresAt > Date.now());
});

test("revoking a paste makes the link 404 before it expires", async () => {
  const created = await createPaste({ content: "revoke me" });

  const before = await handle(new Request(`https://tool.xen.autos/paste/${created.id}`), {}, { ...BASE, path: `/${created.id}` });
  assert.equal(before.status, 200);

  const revoked = await adminRequest(`/api/admin/pastes/${created.id}`, { method: "DELETE" });
  assert.equal(revoked.status, 200);

  const after = await handle(new Request(`https://tool.xen.autos/paste/${created.id}`), {}, { ...BASE, path: `/${created.id}` });
  assert.equal(after.status, 404);

  const list = await (await adminRequest("/api/admin/pastes")).json();
  assert.equal(list.items.some((item) => item.id === created.id), false);
});

test("revoking rejects a malformed id instead of deleting a prefix", async () => {
  const response = await adminRequest("/api/admin/pastes/../other", { method: "DELETE" });
  assert.ok([400, 404].includes(response.status));
});

test("listing does not burn a burn-after-read paste", async () => {
  const created = await createPaste({ content: "one shot", burn: true });

  await adminRequest("/api/admin/pastes");

  const first = await handle(new Request(`https://tool.xen.autos/paste/${created.id}`), {}, { ...BASE, path: `/${created.id}` });
  assert.equal(first.status, 200, "listing consumed the paste");
  assert.equal(await first.text(), "one shot");

  const second = await handle(new Request(`https://tool.xen.autos/paste/${created.id}`), {}, { ...BASE, path: `/${created.id}` });
  assert.equal(second.status, 404);
});

test("admin page is only served when the server has a token", async () => {
  const withToken = await handle(new Request("https://tool.xen.autos/paste/admin"), ADMIN, { ...BASE, path: "/admin" });
  assert.equal(withToken.status, 200);
  const html = await withToken.text();
  assert.match(html, /Paste 管理/);
  assert.doesNotMatch(html, /test-admin-token/);

  const withoutToken = await handle(new Request("https://tool.xen.autos/paste/admin"), {}, { ...BASE, path: "/admin" });
  assert.equal(withoutToken.status, 404);
});
