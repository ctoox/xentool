import test from "node:test";
import assert from "node:assert/strict";

import { handle as paste } from "../tools/paste/src/index.js";
import { handle as md } from "../tools/md/src/index.js";
import { handle as room } from "../tools/room/src/index.js";
import { renderToolsPage } from "../src/tools-page.js";
import { SITE } from "../src/catalog.js";

/**
 * Every tool page ships its client script as a string inside `String.raw`.
 * That string is never parsed by anything at build time, so a typo in it is
 * invisible to `node --test` and to the Worker: the page renders, the script
 * throws in the browser, and the only symptom is a dead button.
 *
 * These tests compile each inline block with `new Function`, which is the
 * cheapest thing that is actually a parse.
 */

const ADMIN = { ADMIN: "test-admin-token" };

/* A stand-in for the ROOM namespace: the page renders only when the binding
 * exists, and rendering is all this file cares about. */
const ROOM_BINDING = {
  idFromName: (name) => name,
  get: () => ({ fetch: async () => new Response("{}") }),
};

function scriptsOf(html) {
  const found = [];
  const pattern = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const attrs = match[1] || "";
    if (/type=["']application\/(ld\+)?json["']/i.test(attrs)) continue;
    found.push(match[2]);
  }
  return found;
}

function assertParses(html, label) {
  const scripts = scriptsOf(html);
  assert.ok(scripts.length > 0, `${label} produced no inline script to check`);
  scripts.forEach((source, index) => {
    try {
      // Dynamic import() is legal in a classic script body, so this parses the
      // room page's `import(...)` form too.
      new Function(source);
    } catch (error) {
      assert.fail(`${label} inline script #${index + 1} does not parse: ${error.message}`);
    }
  });
}

test("the markdown editor's inline script parses", async () => {
  const response = await md(
    new Request("https://tool.xen.autos/md/", { headers: { accept: "text/html" } }),
    {},
    { path: "/", basePath: "/md", host: "tool.xen.autos" },
  );
  assert.equal(response.status, 200);
  assertParses(await response.text(), "/md editor");
});

test("the room page's inline script parses", async () => {
  const response = await room(
    new Request("https://tool.xen.autos/room/", { headers: { accept: "text/html" } }),
    { ROOM: ROOM_BINDING },
    { path: "/", basePath: "/room", host: "tool.xen.autos" },
  );
  assert.equal(response.status, 200);
  assertParses(await response.text(), "/room");
});

test("the shared link admin page's inline script parses", async () => {
  const response = await paste(
    new Request("https://tool.xen.autos/paste/admin", { headers: { accept: "text/html" } }),
    ADMIN,
    { path: "/admin", basePath: "/paste", host: "tool.xen.autos" },
  );
  assert.equal(response.status, 200);
  assertParses(await response.text(), "paste admin");
});

test("cross-tool URLs in the admin panel are root-relative, not __BASE-prefixed", async () => {
  const html = await (
    await paste(
      new Request("https://tool.xen.autos/paste/admin", { headers: { accept: "text/html" } }),
      ADMIN,
      { path: "/admin", basePath: "/paste", host: "tool.xen.autos" },
    )
  ).text();

  /* The panel is served from /paste but manages /md too. Prefixing the md
   * routes with window.__BASE produced /paste/api/admin/md, a 404 that showed
   * up as an empty list rather than as an error. */
  assert.match(html, /MD_ROOT = '\/md'/, "the md root must be a literal, not derived from __BASE");
  assert.ok(!html.includes("__BASE + '/api/admin/md"), "md admin must not be __BASE-prefixed");
  assert.ok(!html.includes("__BASE + '/md/"), "md links must not be __BASE-prefixed");
});

test("the workbench's inline script parses", async () => {
  /* This one is worth having: the whole workbench is a String.raw template,
   * so a stray real newline inside one of its JS string literals is invisible
   * to `node --check` — the file itself is still valid. It reached the browser
   * once as "every tool renders blank", which is a slow thing to diagnose. */
  assertParses(renderToolsPage({ host: "tool.xen.autos", site: SITE }), "/tools");
});

test("the room page asks for the same parser the server renders with", async () => {
  const html = await (
    await room(
      new Request("https://tool.xen.autos/room/", { headers: { accept: "text/html" } }),
      { ROOM: ROOM_BINDING },
      { path: "/", basePath: "/room", host: "tool.xen.autos" },
    )
  ).text();

  /* Root-relative, not prefixed with __BASE: /core/ is served from the site
   * root, and `base + "/core/..."` silently 404s under /room. */
  assert.match(html, /import\('\/core\/markdown\.js'\)/);
  assert.match(html, /x-chat__textarea/, "the message box must accept newlines for fenced code");
  assert.match(html, /id="md-toggle"/);
});
