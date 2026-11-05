/*
 * Ported from it-toolbox packages/core/format.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
function formatJson(input, indent = 2) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed, null, indent) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function minifyJson(input) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: JSON.stringify(parsed) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function validateJson(input) {
  try {
    const parsed = JSON.parse(input);
    return { ok: true, value: { valid: true, type: Array.isArray(parsed) ? "array" : typeof parsed } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function formatXml(xml, indent = 2) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const error = doc.querySelector("parsererror");
    if (error) {
      return { ok: false, error: "Invalid XML: " + error.textContent };
    }
    const format = (node, level) => {
      const indentStr = " ".repeat(indent * level);
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        return text ? text : "";
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        const children = Array.from(element.childNodes).filter((c) => c.nodeType === Node.ELEMENT_NODE || c.nodeType === Node.TEXT_NODE && c.textContent?.trim());
        let result2 = `${indentStr}<${element.tagName}`;
        for (const attr of Array.from(element.attributes)) {
          result2 += ` ${attr.name}="${attr.value}"`;
        }
        if (children.length === 0) {
          result2 += " />\n";
        } else if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
          result2 += `>${children[0].textContent?.trim()}</${element.tagName}>
`;
        } else {
          result2 += ">\n";
          for (const child of children) {
            result2 += format(child, level + 1);
          }
          result2 += `${indentStr}</${element.tagName}>
`;
        }
        return result2;
      }
      return "";
    };
    const result = format(doc.documentElement, 0);
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function minifyXml(xml) {
  try {
    return { ok: true, value: xml.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
const ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "a",
  "p",
  "br",
  "hr",
  "span",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "img",
  "figure",
  "figcaption",
  "sup",
  "sub",
  "kbd",
  "mark",
  "dl",
  "dt",
  "dd",
  "details",
  "summary"
]);
const ALLOWED_ATTRS = /* @__PURE__ */ new Set([
  "href",
  "title",
  "alt",
  "src",
  "class",
  "colspan",
  "rowspan",
  "start",
  "lang",
  "id"
]);
const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.{1,2}\/)/i;
function sanitizeElement(element) {
  for (const child of Array.from(element.children)) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      if (tag === "script" || tag === "style" || tag === "iframe" || tag === "object" || tag === "embed") {
        child.remove();
        continue;
      }
      sanitizeElement(child);
      const parent = child.parentNode;
      while (child.firstChild) parent?.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const isEvent = name.startsWith("on");
      const isUnsafeUrl = (name === "href" || name === "src") && !SAFE_URL.test(attr.value) && !(name === "src" && /^data:image\//i.test(attr.value));
      if (isEvent || !ALLOWED_ATTRS.has(name) || isUnsafeUrl) {
        child.removeAttribute(attr.name);
      }
    }
    if (tag === "a" && child.getAttribute("href")) {
      child.setAttribute("rel", "noopener noreferrer");
    }
    sanitizeElement(child);
  }
}
function sanitizeMarkdownHtml(html) {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").replace(/on\w+\s*=\s*"[^"]*"/gi, "").replace(/on\w+\s*=\s*'[^']*'/gi, "").replace(/\s(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "");
  }
  const preCleaned = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "").replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "").replace(/<(?:object|embed)\b[^>]*>/gi, "");
  const doc = new DOMParser().parseFromString(preCleaned, "text/html");
  sanitizeElement(doc.body);
  return doc.body.innerHTML;
}
export {
  formatJson,
  formatXml,
  minifyJson,
  minifyXml,
  sanitizeMarkdownHtml,
  validateJson
};
