/**
 * Markdown — a small, deliberately incomplete renderer.
 *
 * Two callers share this module:
 *   - the /md short-link page, rendering server-side through a build-time import
 *   - the room page, importing it in the browser via /core/markdown.js
 *
 * That split is the whole reason it lives here instead of inside a page
 * script. It also means it must stay dependency-free and side-effect free:
 * no DOM, no imports, nothing that only exists in one runtime.
 *
 * Security model — read this before changing the renderer. The output is
 * injected with innerHTML in the browser, so THIS FUNCTION IS THE ONLY
 * BOUNDARY. Two rules keep it honest:
 *
 *   1. Raw HTML is never passed through. Every run of text goes through
 *      escape() before it reaches the output, and the only tags in the
 *      result are the ones written as literals below.
 *   2. Link schemes are allowlisted. `[x](javascript:…)` renders as text,
 *      not an anchor. Same for data: and vbscript:.
 *
 * Any future feature that needs a new attribute must escape that value too.
 * The test file feeds this a pile of XSS payloads and asserts none survive.
 *
 * Supported: ATX headings, fenced code, blockquotes, ordered/unordered lists
 * (one level of nesting per pass, arbitrary depth recursively), task lists,
 * pipe tables with alignment, horizontal rules, and inline code / strong /
 * em / strikethrough / links.
 *
 * Not supported on purpose: raw HTML blocks, indented code blocks (four spaces
 * means nesting here, not code — this is a paste tool, not a spec renderer),
 * reference links, footnotes, and setext headings (`---` is a rule or a table
 * separator, never an underline).
 */

/* ------------------------------------------------------------------ inline */

/*
 * Every quantifier here is either a character class or length-bounded.
 *
 * An unbounded lazy `(.+?)` in front of a repeated delimiter backtracks
 * quadratically, and because strong/em recurse into their own content the cost
 * compounds across levels. A 64KB paste consisting only of asterisks pinned a
 * CPU core for minutes before this was bounded — on a shared Worker that is a
 * denial of service anyone can trigger with a paste. Bounding the window at 120
 * makes the scan linear at ~120 steps per position; anything longer than that
 * was never meaningful emphasis anyway.
 *
 * Two details that look like noise and are not:
 *
 *   - Underscore emphasis needs word boundaries on both sides. `\w` includes
 *     the underscore itself, so without the lookarounds `window.__pwned` and
 *     `__init__` get sliced into italics — and in escaped text that can span
 *     far more than a word.
 *   - The link destination allows one level of balanced parentheses, so
 *     `[wiki](https://en.wikipedia.org/wiki/Foo_(bar))` closes at the right
 *     place instead of leaving a stray `)` behind.
 */
const INLINE_SOURCE =
  "`([^`\\n]+)`|\\*\\*(.{1,120}?)\\*\\*|~~(.{1,120}?)~~|\\*([^*\\n]{1,120})\\*|(?<![\\w])_([^_\\n]{1,120})_(?![\\w])|\\[([^\\]\\n]*)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)";

/* A single shared global regex cannot be used here: strong/em recurse while
 * the outer loop is still walking matches, and the inner call would reset
 * lastIndex from under it — every match then repeats until the budget runs
 * out. Each call gets its own instance instead. */
const inlineScanner = () => new RegExp(INLINE_SOURCE, "g");

/* Total characters any one inline pass may process, recursion included. Real
 * documents use a few thousand; anything past this is adversarial. */
const INLINE_BUDGET = 200_000;

/* Above this, formatting a single block is not worth the work: nobody writes a
 * 16KB paragraph of emphasis, and skipping keeps a hostile paste cheap. */
const INLINE_MAX_BLOCK = 16_000;

/* Only these may reach an href. A protocol-relative `//host` is https in
 * practice, so a leading slash is allowed; a bare `javascript:` is not. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|#|\/|\.{1,2}\/)/i;

export function escape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render one run of inline markdown to HTML.
 *
 * Single pass over an alternation rather than a chain of .replace() calls:
 * chained replacements corrupt each other the moment a replacement emits a
 * tag whose text looks like the next pattern. The strong/em branches recurse,
 * so a shared budget travels with the call and everything past it degrades to
 * escaped text rather than to stalled CPU.
 */
export function renderInline(text, depth = 0) {
  return inline(String(text ?? ""), depth, { left: INLINE_BUDGET });
}

function inline(source, depth, budget) {
  if (source.length > INLINE_MAX_BLOCK) return escape(source);
  if (depth > 6 || budget.left <= 0) return escape(source);
  budget.left -= source.length;

  let out = "";
  let last = 0;
  let match;
  const scanner = inlineScanner();

  while ((match = scanner.exec(source)) !== null) {
    out += escape(source.slice(last, match.index));
    last = match.index + match[0].length;

    if (match[1] !== undefined) {
      out += `<code>${escape(match[1])}</code>`;
    } else if (match[2] !== undefined) {
      out += `<strong>${inline(match[2], depth + 1, budget)}</strong>`;
    } else if (match[3] !== undefined) {
      out += `<del>${inline(match[3], depth + 1, budget)}</del>`;
    } else if (match[4] !== undefined) {
      out += `<em>${inline(match[4], depth + 1, budget)}</em>`;
    } else if (match[5] !== undefined) {
      out += `<em>${inline(match[5], depth + 1, budget)}</em>`;
    } else {
      out += renderLink(match[6], match[7], depth, budget);
    }

    if (budget.left <= 0) break;
  }

  return out + escape(source.slice(last));
}

function renderLink(label, href, depth, budget) {
  const url = String(href).trim();
  if (!SAFE_HREF.test(url)) {
    /* Keep the destination visible but inert — silently dropping it would
     * leave the reader wondering where the link went. */
    return `<span class="md-inert">${inline(label, depth + 1, budget)} (${escape(url)})</span>`;
  }
  const title = String(label ?? "").trim() ? inline(label, depth + 1, budget) : escape(url);
  return `<a href="${escape(url)}" rel="nofollow noopener noreferrer" target="_blank">${title}</a>`;
}

/* ------------------------------------------------------------------- blocks */

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function matchList(line) {
  const bullet = line.match(BULLET);
  if (bullet) return { indent: bullet[1].length, ordered: false, start: 1, content: bullet[3] };
  const ordered = line.match(ORDERED);
  if (ordered) {
    return { indent: ordered[1].length, ordered: true, start: Number(ordered[2]), content: ordered[3] };
  }
  return null;
}

function isTableStart(lines, index) {
  const head = lines[index];
  const rule = lines[index + 1];
  if (!head || rule === undefined) return false;
  // Requiring a pipe in the separator as well keeps `Foo` / `---` from being
  // read as a one-column table, which is exactly how a setext heading looks.
  return head.includes("|") && rule.includes("|") && TABLE_RULE.test(rule);
}

function splitRow(line) {
  let source = line.trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|")) source = source.slice(0, -1);
  const cells = [];
  let cell = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && source[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (source[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += source[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function alignments(rule) {
  return splitRow(rule).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  });
}

/**
 * Parse into a block tree. Exported mainly so tests can assert on structure
 * instead of on rendered strings, which makes a formatting bug easier to
 * localise than a diff of HTML.
 */
export function parseBlocks(source, { breaks = true } = {}) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || "";
      const body = [];
      i++;
      while (i < lines.length) {
        const closing = lines[i].match(FENCE);
        if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) {
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang, text: body.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // Rules must be tested before lists: `- - -` satisfies both patterns.
    if (RULE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].match(QUOTE)[1]);
        i++;
      }
      blocks.push({ type: "quote", blocks: parseBlocks(inner.join("\n"), { breaks }) });
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      const align = alignments(lines[i + 1]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", head, align, rows });
      continue;
    }

    if (matchList(line)) {
      const parsed = parseList(lines, i, { breaks });
      blocks.push(parsed.block);
      i = parsed.next;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim()) {
      const next = lines[i];
      if (paragraph.length) {
        if (FENCE.test(next) || HEADING.test(next) || RULE.test(next) || QUOTE.test(next) || matchList(next)) break;
        if (isTableStart(lines, i)) break;
      }
      paragraph.push(next);
      i++;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

function parseList(lines, start, { breaks }) {
  const head = matchList(lines[start]);
  const base = head.indent;
  const ordered = head.ordered;
  const items = [];
  let i = start;
  let current = null;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      // A blank line only ends the list if what follows is not the same list
      // continuing — otherwise a single blank line between items would split
      // one list into several.
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const peek = j < lines.length ? matchList(lines[j]) : null;
      if (peek && peek.ordered === ordered && peek.indent === base) {
        i = j;
        continue;
      }
      break;
    }

    const marker = matchList(line);

    if (marker && marker.ordered === ordered && marker.indent === base) {
      current = { text: marker.content.trim(), blocks: [], task: taskState(marker.content) };
      if (current.task) current.text = current.task.text;
      items.push(current);
      i++;
      continue;
    }

    if (marker && marker.indent > base) {
      // Deeper marker: a child list. parseList re-bases on this line's indent
      // and stops on its own when the indent comes back down.
      const nested = parseList(lines, i, { breaks });
      if (current) current.blocks.push(nested.block);
      else items.push({ text: "", blocks: [nested.block], task: null });
      i = nested.next;
      continue;
    }

    if (marker && marker.indent < base) break;

    if (!marker && current) {
      // A wrapped line belongs to the item it follows.
      current.text += " " + line.trim();
      i++;
      continue;
    }

    break;
  }

  return {
    block: { type: "list", ordered, start: ordered ? head.start : 1, items },
    next: i,
  };
}

function taskState(content) {
  const task = String(content).match(/^\[([ xX])\]\s+(.*)$/);
  if (!task) return null;
  return { checked: task[1].toLowerCase() === "x", text: task[2] };
}

/* ---------------------------------------------------------------- rendering */

function renderBlocks(blocks, options) {
  const offset = options.headingOffset || 0;
  return blocks.map((block) => renderBlock(block, options, offset)).join("\n");
}

function renderBlock(block, options, offset) {
  switch (block.type) {
    case "heading": {
      const level = Math.min(block.level + offset, 6);
      return `<h${level}>${renderInline(block.text)}</h${level}>`;
    }
    case "paragraph":
      return `<p>${renderLines(block.text, options)}</p>`;
    case "code": {
      const lang = block.lang ? ` data-lang="${escape(block.lang)}"` : "";
      return `<pre class="md-code"${lang}><code>${escape(block.text)}</code></pre>`;
    }
    case "quote":
      return `<blockquote>${renderBlocks(block.blocks, options)}</blockquote>`;
    case "hr":
      return "<hr>";
    case "table": {
      const cell = (tag, text, index) => {
        const align = block.align[index] ? ` style="text-align:${block.align[index]}"` : "";
        return `<${tag}${align}>${renderInline(text)}</${tag}>`;
      };
      const head = block.head.map((text, index) => cell("th", text, index)).join("");
      const rows = block.rows
        .map((row) => `<tr>${row.map((text, index) => cell("td", text, index)).join("")}</tr>`)
        .join("");
      return `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const startAt = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
      const items = block.items
        .map((item) => {
          const box =
            item.task === null || item.task === undefined
              ? ""
              : `<input type="checkbox" disabled${item.task.checked ? " checked" : ""}> `;
          const inner = item.blocks.map((child) => renderBlock(child, options, offset)).join("");
          return `<li>${box}${renderInline(item.text)}${inner}</li>`;
        })
        .join("");
      return `<${tag}${startAt}>${items}</${tag}>`;
    }
    default:
      return "";
  }
}

function renderLines(text, options) {
  const parts = String(text).split("\n");
  // Hard-wrapped notes are the normal case in a paste bin, so a single newline
  // becomes a <br> by default. Pass { breaks: false } for CommonMark soft
  // breaks (a newline becomes a space) when rendering prose meant for export.
  const glue = options.breaks === false ? "\n" : "<br>\n";
  return parts.map((line) => renderInline(line)).join(glue);
}

/**
 * Render a whole document body. The result is a fragment, not a page: no
 * <html>, no <head>, no <style> — the caller wraps it.
 */
export function markdownToHtml(source, options = {}) {
  return renderBlocks(parseBlocks(source, options), options);
}

/**
 * Render a document that supplies its own page title.
 *
 * The first `#` heading becomes the title and is removed from the body. Left
 * in place it would print twice — once as the page's h1, once as the body's
 * h2 — which is exactly what the first version did. Headings that are not
 * level 1 are left alone: a document that starts at `##` has no title of its
 * own, and demoting its first section would be worse than the fallback.
 */
export function markdownDocument(source, fallbackTitle = "Markdown 文档") {
  const blocks = parseBlocks(source);
  let title = fallbackTitle;

  if (blocks.length && blocks[0].type === "heading" && blocks[0].level === 1) {
    const text = blocks.shift().text.replace(/[*_`~]/g, "").trim().slice(0, 80);
    if (text) title = text;
  }

  return { title, html: renderBlocks(blocks, {}) };
}

/** First ATX heading, used as the document title. */
export function markdownTitle(source, fallback = "Markdown 文档") {
  const heading = String(source ?? "").match(/^ {0,3}#{1,6}\s+(.+)$/m);
  if (!heading) return fallback;
  // Strip inline markup so the <title> stays plain text.
  return heading[1].replace(/[*_`~]/g, "").trim().slice(0, 80) || fallback;
}
