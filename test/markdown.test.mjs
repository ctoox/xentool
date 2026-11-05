import test from "node:test";
import assert from "node:assert/strict";

import {
  parseBlocks,
  renderInline,
  markdownToHtml,
  markdownDocument,
  markdownTitle,
} from "../src/toolkit-core/markdown.js";

/* ------------------------------------------------------------------ security */

/*
 * These are the tests that matter most. The renderer's output goes straight
 * into innerHTML on /md and in the room chat, so if any of these payloads
 * comes out alive, a shared paste can run script in a reader's tab.
 */
const PAYLOADS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg/onload=alert(1)>",
  "<iframe src=javascript:alert(1)></iframe>",
  '<a href="#" onclick="alert(1)">x</a>',
  "<body onload=alert(1)>",
];

test("raw HTML is always escaped into text, never emitted as markup", () => {
  for (const payload of PAYLOADS) {
    for (const source of [payload, `text\n\n${payload}\n`, `# ${payload}`, `- ${payload}`, `> ${payload}`]) {
      const out = markdownToHtml(source);
      // The check is on unescaped angle brackets, not on the words inside the
      // payload: `&lt;img onerror=…&gt;` is inert text and contains those
      // words legitimately. What must never appear is a real tag.
      assert.ok(!/<[a-z]/i.test(out.replace(/<\/?(?:p|h[1-6]|ul|ol|li|pre|code|strong|em|del|blockquote|hr|table|thead|tbody|tr|th|td|div|a|span|input)\b[^>]*>/g, "")), `${source} leaked a tag: ${out.slice(0, 120)}`);
      assert.ok(!out.includes("<script"), `${source} leaked a script tag`);
      assert.ok(!out.includes("<img"), `${source} leaked an img tag`);
      assert.ok(!out.includes("<svg"), `${source} leaked an svg tag`);
      assert.ok(!out.includes("<iframe"), `${source} leaked an iframe tag`);
      assert.ok(out.includes("&lt;"), `${source} did not arrive as escaped text`);
    }
  }
});

test("raw HTML inside a code fence stays literal", () => {
  const out = markdownToHtml("```html\n<script>alert(1)</script>\n```");
  assert.equal(out, '<pre class="md-code" data-lang="html"><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>');
});

test("dangerous link schemes render as inert text, not anchors", () => {
  for (const url of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "  javascript:alert(1)",
  ]) {
    const out = markdownToHtml(`[click](${url.trim()})`);
    assert.ok(!out.includes("<a "), `${url} produced an anchor`);
    assert.ok(out.includes("md-inert"), `${url} was not marked inert`);
    assert.ok(!out.includes('href="javascript'), `${url} reached an href`);
  }
});

test("safe link schemes survive and carry noopener", () => {
  const cases = [
    ["[a](https://xen.autos)", 'href="https://xen.autos"'],
    ["[a](http://example.com/p?q=1)", 'href="http://example.com/p?q=1"'],
    ["[a](mailto:hi@xen.autos)", 'href="mailto:hi@xen.autos"'],
    ["[a](/#top)", 'href="/#top"'],
  ];
  for (const [source, expected] of cases) {
    const out = markdownToHtml(source);
    assert.ok(out.includes(expected), `${source} lost its href`);
    assert.ok(out.includes('rel="nofollow noopener noreferrer"'));
    assert.ok(out.includes('target="_blank"'));
  }
});

test("a quote in the destination cannot break out of the attribute", () => {
  const out = markdownToHtml('[x](https://a.com/"onmouseover="alert(1))');
  assert.ok(!out.includes('" onmouseover="'), "attribute breakout succeeded");
  assert.ok(out.includes("&quot;"));
});

/* -------------------------------------------------------------------- inline */

test("inline markup renders in one pass without corrupting itself", () => {
  assert.equal(renderInline("**bold**"), "<strong>bold</strong>");
  assert.equal(renderInline("*em*"), "<em>em</em>");
  assert.equal(renderInline("~~gone~~"), "<del>gone</del>");
  assert.equal(renderInline("`a<b>&c`"), "<code>a&lt;b&gt;&amp;c</code>");
  assert.equal(
    renderInline("**a *b* c**"),
    "<strong>a <em>b</em> c</strong>",
    "emphasis nested inside strong must survive",
  );
  assert.equal(renderInline("plain *not em"), "plain *not em");
});

test("code spans win over emphasis inside them", () => {
  assert.equal(renderInline("`**not bold**`"), "<code>**not bold**</code>");
});

test("snake_case and dunder names are not italicised", () => {
  assert.equal(renderInline("call user_id here"), "call user_id here");
  assert.equal(renderInline("window.__pwned = 1"), "window.__pwned = 1");
  assert.equal(renderInline("def __init__(self):"), "def __init__(self):");
  /* But a real emphasis with boundaries still works. */
  assert.equal(renderInline("this is _emphasised_ text"), "this is <em>emphasised</em> text");
});

test("an inert link keeps a balanced pair of parentheses", () => {
  const out = markdownToHtml("[x](javascript:alert(1))");
  assert.equal(out, '<p><span class="md-inert">x (javascript:alert(1))</span></p>');
  assert.ok(!out.includes("<a "));
});

test("a link destination may contain balanced parentheses", () => {
  const out = markdownToHtml("[w](https://en.wikipedia.org/wiki/Foo_(bar))");
  assert.ok(out.includes('href="https://en.wikipedia.org/wiki/Foo_(bar)"'), out);
  assert.ok(!out.includes(")</p>"), "the closing paren leaked out of the anchor");
});

test("deeply nested emphasis stops at the depth cap instead of overflowing", () => {
  const nasty = "*".repeat(400) + "x" + "*".repeat(400);
  const out = renderInline(nasty);
  assert.equal(typeof out, "string");
  assert.ok(out.length > 0);
});

/* -------------------------------------------------------------------- blocks */

test("headings, code fences and rules parse", () => {
  const blocks = parseBlocks("# One\n\n## Two\n\n```js\nlet a = 1;\n```\n\n---");
  assert.deepEqual(blocks.map((b) => b.type), ["heading", "heading", "code", "hr"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].lang, "js");
  assert.equal(blocks[2].text, "let a = 1;");
});

test("an unclosed fence swallows the rest rather than dropping it", () => {
  const blocks = parseBlocks("```\nline one\nline two");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "code");
  assert.equal(blocks[0].text, "line one\nline two");
});

test("a tilde fence is not closed by a backtick fence", () => {
  const blocks = parseBlocks("~~~\na\n```\nb\n~~~");
  assert.equal(blocks[0].text, "a\n```\nb");
});

test("lists keep their numbering and support nesting", () => {
  const out = markdownToHtml("3. three\n4. four\n   - nested\n   - also");
  assert.ok(out.startsWith('<ol start="3">'), out);
  assert.ok(out.includes("<li>three</li>"));
  assert.ok(out.includes("<ul><li>nested</li><li>also</li></ul>"), out);
});

test("a blank line between items does not split the list", () => {
  const out = markdownToHtml("- a\n\n- b");
  assert.equal((out.match(/<ul>/g) || []).length, 1, out);
  assert.equal((out.match(/<li>/g) || []).length, 2, out);
});

test("task list items become real checkboxes, disabled", () => {
  const out = markdownToHtml("- [ ] todo\n- [x] done");
  assert.ok(out.includes('<input type="checkbox" disabled> todo'), out);
  assert.ok(out.includes('<input type="checkbox" disabled checked> done'), out);
});

test("a list inside a blockquote parses as a list, not as text", () => {
  const out = markdownToHtml("> - one\n> - two");
  assert.ok(out.startsWith("<blockquote>"), out);
  assert.ok(out.includes("<ul><li>one</li><li>two</li></ul>"), out);
});

test("tables parse with alignment, and cells render inline markup", () => {
  const out = markdownToHtml("| a | b |\n|:--|--:|\n| **x** | 1 |");
  assert.ok(out.includes('<th style="text-align:left">a</th>'), out);
  assert.ok(out.includes('<th style="text-align:right">b</th>'), out);
  assert.ok(out.includes('<td style="text-align:left"><strong>x</strong></td>'), out);
});

test("an escaped pipe stays inside its cell", () => {
  const out = markdownToHtml("| a |\n|---|\n| x \\| y |");
  assert.ok(out.includes("<td>x | y</td>"), out);
});

test("a rule is not mistaken for a one-column table", () => {
  const blocks = parseBlocks("Foo\n---");
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "hr"]);
});

test("ordered list syntax does not fire on years in prose", () => {
  const blocks = parseBlocks("2024 was a year");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
});

test("paragraph line breaks are preserved by default and joined on request", () => {
  assert.equal(markdownToHtml("a\nb"), "<p>a<br>\nb</p>");
  assert.equal(markdownToHtml("a\nb", { breaks: false }), "<p>a\nb</p>");
});

test("headingOffset lets a page keep exactly one h1", () => {
  const out = markdownToHtml("# Title", { headingOffset: 1 });
  assert.equal(out, "<h2>Title</h2>");
  assert.equal(markdownToHtml("###### deep", { headingOffset: 1 }), "<h6>deep</h6>");
});

test("CRLF input parses the same as LF", () => {
  assert.equal(markdownToHtml("# a\r\n\r\nb"), markdownToHtml("# a\n\nb"));
});

test("markdownTitle pulls the first heading and strips inline markup", () => {
  assert.equal(markdownTitle("# **Hi** there"), "Hi there");
  assert.equal(markdownTitle("no headings here", "fallback"), "fallback");
  assert.equal(markdownTitle("## later", "fallback"), "later");
});

test("markdownDocument lifts the leading h1 out of the body", () => {
  const doc = markdownDocument("# 标题\n\n正文");
  assert.equal(doc.title, "标题");
  assert.equal(doc.html, "<p>正文</p>");

  /* A document with no h1 keeps its fallback title and its full body. */
  const plain = markdownDocument("## 小节\n\n正文", "无题");
  assert.equal(plain.title, "无题");
  assert.ok(plain.html.startsWith("<h2>小节</h2>"));

  /* An empty h1 must not blank the page title. */
  const blank = markdownDocument("#\n\n正文", "兜底");
  assert.equal(blank.title, "兜底");
});

test("empty input renders nothing rather than throwing", () => {
  assert.equal(markdownToHtml(""), "");
  assert.equal(markdownToHtml("   \n\n  "), "");
  assert.equal(markdownToHtml(null), "");
});
