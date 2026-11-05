import test from "node:test";
import assert from "node:assert/strict";

import { handle } from "../tools/md/src/index.js";

const ADMIN = { ADMIN: "test-admin-token" };

function call(path, { method = "GET", headers = {}, body, env = {} } = {}) {
  return handle(
    new Request(`https://tool.xen.autos/md${path}`, { method, headers, body }),
    env,
    // ctx.path mirrors url.pathname in the Worker: a query string is not part
    // of it, so it must be stripped before the handler sees it.
    { path: path.split("?")[0], basePath: "/md", host: "tool.xen.autos" },
  );
}

async function create(content, env = {}) {
  const response = await call("/api/md", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
    env,
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

test("creating a document returns a /md link and a title", async () => {
  const created = await create("# Hello\n\nbody");
  assert.match(created.url, /^https:\/\/tool\.xen\.autos\/md\/[a-z0-9]{10}$/);
  assert.equal(created.title, "Hello");
  assert.equal(created.expiresIn, 7 * 24 * 3600);
  assert.equal(created.storage, "memory");
});

test("the rendered page shows formatted markup, not the source", async () => {
  const created = await create("# 标题\n\n**粗体** 和 `code`");
  const response = await call(`/${created.id}`, { headers: { accept: "text/html" } });
  const page = await response.text();

  assert.equal(response.status, 200);
  /* The document's own `#` heading becomes the page h1 — and is removed from
   * the body, so the title is not printed twice. */
  assert.equal((page.match(/<h1>/g) || []).length, 1, "exactly one h1 per page");
  assert.match(page, /<h1>标题<\/h1>/);
  assert.ok(!page.includes("<h2>标题</h2>"), "the title heading was duplicated in the body");
  assert.match(page, /<strong>粗体<\/strong>/);
  assert.match(page, /<code>code<\/code>/);
  /* The # markers must be gone from the body, otherwise the renderer silently
   * fell back to showing the source. */
  assert.ok(!page.includes("# 标题"), "raw markdown leaked into the page");
});

test("a document that starts at ## keeps its structure and gets a neutral title", async () => {
  const created = await create("## 背景\n\n正文");
  const page = await (await call(`/${created.id}`, { headers: { accept: "text/html" } })).text();

  assert.match(page, /<h1>Markdown 文档<\/h1>/, "no h1 heading means the fallback title");
  assert.match(page, /<h2>背景<\/h2>/, "a level-2 heading is content, not a title");
});

test("the source stays reachable through ?raw=1", async () => {
  const created = await create("# Hello\n\n**bold**");

  const raw = await call(`/${created.id}?raw=1`, { headers: { accept: "text/html" } });
  assert.equal(await raw.text(), "# Hello\n\n**bold**");

  const plain = await call(`/${created.id}`);
  assert.equal(await plain.text(), "# Hello\n\n**bold**");
});

test("a document cannot smuggle script into the rendered page", async () => {
  const created = await create(
    '# x\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[a](javascript:alert(1))',
  );
  const page = await (await call(`/${created.id}`, { headers: { accept: "text/html" } })).text();

  assert.ok(!page.includes("<script>alert(1)"), "a script tag reached the page");
  assert.ok(!page.includes("onerror=alert(1)>"), "an onerror attribute reached the page");
  assert.ok(!page.includes('href="javascript:'), "a javascript: href reached the page");
  assert.ok(page.includes("&lt;script&gt;"), "the payload should still be visible as text");
  assert.ok(page.includes("md-inert"), "the refused link should be marked inert");
});

test("an expired or revoked document is a 404 for both readers and scripts", async () => {
  const created = await create("gone soon");
  const revoked = await call(`/api/admin/md/${created.id}`, {
    method: "DELETE",
    headers: { authorization: "Bearer test-admin-token" },
    env: ADMIN,
  });
  assert.equal(revoked.status, 200);

  assert.equal((await call(`/${created.id}`, { headers: { accept: "text/html" } })).status, 404);
  assert.equal((await call(`/${created.id}`)).status, 404);
});

test("admin routes refuse a missing or wrong token", async () => {
  await create("x", ADMIN);

  const noToken = await call("/api/admin/md", { env: ADMIN });
  assert.equal(noToken.status, 401);

  const wrongToken = await call("/api/admin/md", {
    headers: { authorization: "Bearer nope" },
    env: ADMIN,
  });
  assert.equal(wrongToken.status, 401);

  /* Without the secret configured, every admin route is closed — never open. */
  const unconfigured = await call("/api/admin/md", {
    headers: { authorization: "Bearer test-admin-token" },
    env: {},
  });
  assert.equal(unconfigured.status, 401);
});

test("the admin list carries kind md so the shared panel can route revokes", async () => {
  const first = await create("# first", ADMIN);
  const second = await create("second", ADMIN);

  const response = await call("/api/admin/md", {
    headers: { authorization: "Bearer test-admin-token" },
    env: ADMIN,
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  /* The in-memory fallback store is shared by the whole file, so assert on
   * the records this test made rather than on the total. */
  const ids = data.items.map((item) => item.id);
  assert.ok(ids.includes(first.id) && ids.includes(second.id), "both documents should be listed");
  for (const item of data.items) {
    assert.equal(item.kind, "md");
    assert.ok(item.createdAt > 0);
    assert.ok(item.expiresAt > Date.now());
    assert.equal(typeof item.preview, "string");
  }
});

test("listing does not delete anything", async () => {
  const created = await create("keep me", ADMIN);
  await call("/api/admin/md", { headers: { authorization: "Bearer test-admin-token" }, env: ADMIN });

  const still = await call(`/${created.id}`);
  assert.equal(await still.text(), "keep me");
});

test("burn-after-reading is refused: a source toggle must not destroy the doc", async () => {
  const response = await call("/api/md", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "# x", burn: true }),
  });
  const data = await response.json();

  assert.equal(response.status, 201);
  assert.equal(data.burn, undefined);

  const shown = await call(`/${data.id}?raw=1`);
  assert.equal(await shown.text(), "# x");
  const again = await call(`/${data.id}?raw=1`);
  assert.equal(await again.text(), "# x", "the second read must still work");
});

test("bad input is rejected with a status the caller can act on", async () => {
  const empty = await call("/api/md", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "" }),
  });
  assert.equal(empty.status, 400);

  const huge = await call("/api/md", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "a".repeat(70 * 1024) }),
  });
  assert.equal(huge.status, 413);

  const badTtl = await call("/api/md", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "x", ttl: 5 }),
  });
  assert.equal(badTtl.status, 400);
});

test("a plain text body is accepted as the content itself", async () => {
  const response = await call("/api/md", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "# from curl",
  });
  const data = await response.json();
  assert.equal(response.status, 201);

  const shown = await call(`/${data.id}?raw=1`);
  assert.equal(await shown.text(), "# from curl");
});

test("the editor page loads and points the preview at the shared core module", async () => {
  const page = await (await call("/", { headers: { accept: "text/html" } })).text();
  assert.match(page, /id="content"/);
  assert.match(page, /id="preview"/);
  /* Root-relative: the module lives at /core/ on the site root, not under the
   * tool basePath, so a __BASE prefix would 404. */
  assert.match(page, /import\('\/core\/markdown\.js'\)/, "the preview must import the same parser the server uses");
});

test("a document whose id is malformed is a 404, not a lookup", async () => {
  assert.equal((await call("/NOTVALID")).status, 404);
  assert.equal((await call("/short")).status, 404);
});
