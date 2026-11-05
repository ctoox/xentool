/*
 * YAML subset — parser and serializer.
 *
 * Original code for xentool, not ported. The reference project's YAML support
 * is a thin wrapper over js-yaml, which is far heavier than what these tools
 * need; this covers the shapes that actually show up in config files:
 *
 *   - block mappings and sequences, nested by indentation
 *   - flow collections: [a, b] and {a: 1}
 *   - plain, single-quoted, double-quoted and block (| and >) scalars
 *   - comments, multiple documents separated by ---
 *
 * Anchors, aliases, tags and merge keys are rejected with an error instead of
 * being silently mis-parsed — a tool that quietly drops half a config is worse
 * than one that says "not supported".
 */

const NULLS = new Set(["null", "Null", "NULL", "~"]);
const TRUES = new Set(["true", "True", "TRUE"]);
const FALSES = new Set(["false", "False", "FALSE"]);

function result(value) {
  return { ok: true, value };
}

function failure(error) {
  return { ok: false, error };
}

function isSeqItem(text, indent) {
  return text[indent] === "-" && (text.length === indent + 1 || text[indent + 1] === " ");
}

function indentOf(text) {
  return text.length - text.trimStart().length;
}

/* Splits on a separator that sits outside quotes and outside [] / {}. */
function splitTopLevel(text, separator = ",") {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++;
      } else if (ch === quote) {
        if (quote === "'" && text[i + 1] === "'") i++;
        else quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "[" || ch === "{") {
      depth++;
    } else if (ch === "]" || ch === "}") {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (quote) throw new Error("引号没有闭合");
  if (depth !== 0) throw new Error("括号没有闭合");
  parts.push(text.slice(start));
  return parts;
}

/* Drops a trailing # comment, but keeps # that is inside quotes or a word. */
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === "\\") i++;
      else if (ch === quote) {
        if (quote === "'" && text[i + 1] === "'") i++;
        else quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i);
  }
  return text;
}

function unescapeDouble(text) {
  if (!text.endsWith('"') || text.length < 2) throw new Error("双引号字符串没有闭合");
  const body = text.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = body[++i];
    switch (next) {
      case "n": out += "\n"; break;
      case "t": out += "\t"; break;
      case "r": out += "\r"; break;
      case "0": out += "\0"; break;
      case "b": out += "\b"; break;
      case "f": out += "\f"; break;
      case '"': out += '"'; break;
      case "\\": out += "\\"; break;
      case "/": out += "/"; break;
      case "x": {
        const hex = body.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error("无效的 \\x 转义");
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2;
        break;
      }
      case "u": {
        let hex;
        let skip;
        if (body[i + 1] === "{") {
          const end = body.indexOf("}", i);
          if (end < 0) throw new Error("无效的 \\u{...} 转义");
          hex = body.slice(i + 2, end);
          skip = end - i;
        } else {
          hex = body.slice(i + 1, i + 5);
          skip = 4;
        }
        if (!/^[0-9a-fA-F]{2,6}$/.test(hex)) throw new Error("无效的 \\u 转义");
        out += String.fromCodePoint(parseInt(hex, 16));
        i += skip;
        break;
      }
      case "U": {
        const hex = body.slice(i + 1, i + 9);
        if (!/^[0-9a-fA-F]{8}$/.test(hex)) throw new Error("无效的 \\U 转义");
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 8;
        break;
      }
      default:
        out += next == null ? "" : next;
    }
  }
  return out;
}

function unquoteSingle(text) {
  if (!text.endsWith("'") || text.length < 2) throw new Error("单引号字符串没有闭合");
  return text.slice(1, -1).replace(/''/g, "'");
}

function plainScalar(text) {
  const s = text.trim();
  if (NULLS.has(s)) return null;
  if (TRUES.has(s)) return true;
  if (FALSES.has(s)) return false;
  if (/^[-+]?(0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+)$/.test(s)) return Number(s);
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/* `key: value` — returns null when the line is not a mapping entry. */
function matchKey(text, indent) {
  const body = text.slice(indent);
  const match = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^#\s][^:]*?))\s*:(?=\s|$)/.exec(body);
  if (!match) return null;
  let key;
  if (match[1] !== undefined) key = unescapeDouble(`"${match[1]}"`);
  else if (match[2] !== undefined) key = match[2].replace(/''/g, "'");
  else key = match[3].trim();
  if (!key) return null;
  return { key, rest: body.slice(match[0].length).trim() };
}

class YamlParser {
  constructor(lines) {
    this.lines = lines;
    this.i = 0;
  }

  get lineNo() {
    if (this.i < this.lines.length) return this.lines[this.i].no;
    return this.lines.length ? this.lines[this.lines.length - 1].no : 1;
  }

  fail(message) {
    const err = new Error(`${message}（第 ${this.lineNo} 行）`);
    throw err;
  }

  static isBlank(line) {
    const text = line.text.trim();
    return text === "" || text.startsWith("#");
  }

  skipBlank() {
    while (this.i < this.lines.length && YamlParser.isBlank(this.lines[this.i])) this.i++;
  }

  peek() {
    this.skipBlank();
    return this.i < this.lines.length ? this.lines[this.i] : null;
  }

  parseDocument() {
    const first = this.peek();
    if (!first) return null;
    const value = this.parseBlock(indentOf(first.text));
    const leftover = this.peek();
    if (leftover) this.fail("缩进对不上，这行不属于任何结构");
    return value;
  }

  parseBlock(indent) {
    const line = this.peek();
    if (!line) return null;
    const actual = indentOf(line.text);
    if (actual < indent) return null;
    if (isSeqItem(line.text, actual)) return this.parseSequence(actual);
    const key = matchKey(line.text, actual);
    if (key) return this.parseMapping(actual);
    return this.parseScalarBlock(actual);
  }

  parseSequence(indent) {
    const items = [];
    for (;;) {
      const line = this.peek();
      if (!line) break;
      const actual = indentOf(line.text);
      if (actual !== indent || !isSeqItem(line.text, indent)) break;

      const afterDash = line.text.slice(indent + 1);
      const content = afterDash.replace(/^\s+/, "");
      const contentIndent = indent + 1 + (afterDash.length - content.length);

      if (content === "" || content.startsWith("#")) {
        this.i++;
        const next = this.peek();
        items.push(next && indentOf(next.text) > indent ? this.parseBlock(indentOf(next.text)) : null);
        continue;
      }

      // Re-anchor the line at the column where its content starts, so a
      // "  other: 1" under "- key: 1" lines up with the mapping parser.
      this.lines[this.i] = { text: " ".repeat(contentIndent) + content, no: line.no };
      items.push(this.parseBlock(contentIndent));
    }
    return items;
  }

  parseMapping(indent) {
    const object = {};
    for (;;) {
      const line = this.peek();
      if (!line) break;
      const actual = indentOf(line.text);
      if (actual < indent) break;
      if (actual > indent) this.fail("缩进不一致");
      if (isSeqItem(line.text, indent)) break;

      const entry = matchKey(line.text, indent);
      if (!entry) this.fail("这一行既不是键值对，也不是列表项");
      this.i++;

      const { key, rest } = entry;
      if (rest === "" || rest.startsWith("#")) {
        const next = this.peek();
        if (!next) {
          object[key] = null;
          continue;
        }
        const nextIndent = indentOf(next.text);
        if (nextIndent > indent) object[key] = this.parseBlock(nextIndent);
        // "key:" followed by a sequence at the same column is valid YAML.
        else if (nextIndent === indent && isSeqItem(next.text, indent)) {
          object[key] = this.parseSequence(indent);
        } else {
          object[key] = null;
        }
        continue;
      }

      if (/^[|>][+-]?\d*$/.test(rest)) {
        object[key] = this.parseBlockScalar(rest, indent);
        continue;
      }

      object[key] = this.parseInline(rest);
    }
    return object;
  }

  parseScalarBlock(indent) {
    const parts = [];
    for (;;) {
      const line = this.peek();
      if (!line) break;
      const actual = indentOf(line.text);
      if (actual < indent) break;
      if (parts.length && (isSeqItem(line.text, actual) || matchKey(line.text, actual))) break;
      parts.push(line.text.trim());
      this.i++;
    }
    if (parts.length === 1) return this.parseInline(parts[0]);
    return parts.join(" ");
  }

  parseInline(raw) {
    let text = stripComment(raw).trim();
    if (text === "") return null;

    if (text[0] === "&") this.fail("暂不支持锚点（&name）");
    if (text[0] === "*") this.fail("暂不支持别名（*name）");
    if (text[0] === "!") this.fail("暂不支持标签（!tag）");
    if (text[0] === "?") this.fail("暂不支持复杂键（? key）");

    text = this.collectFlow(text);

    if (text[0] === '"') return unescapeDouble(text);
    if (text[0] === "'") return unquoteSingle(text);
    if (text[0] === "[") {
      const body = text.slice(1, -1);
      if (!body.trim()) return [];
      return splitTopLevel(body).map((part) => this.parseInline(part));
    }
    if (text[0] === "{") {
      const body = text.slice(1, -1);
      if (!body.trim()) return {};
      const object = {};
      for (const part of splitTopLevel(body)) {
        const entry = matchKey(part.trim() + (part.includes(":") ? "" : ":"), 0);
        if (!entry) this.fail("无法解析行内对象");
        object[entry.key] = entry.rest === "" ? null : this.parseInline(entry.rest);
      }
      return object;
    }
    return plainScalar(text);
  }

  /* Flow collections may wrap across lines; pull in more lines until balanced. */
  collectFlow(text) {
    if (text[0] !== "[" && text[0] !== "{") return text;
    const balanced = (s) => {
      let depth = 0;
      let quote = null;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (quote) {
          if (quote === '"' && ch === "\\") i++;
          else if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === "[" || ch === "{") depth++;
        else if (ch === "]" || ch === "}") depth--;
      }
      return depth <= 0 && !quote;
    };
    if (balanced(text)) return text;

    let buffer = text;
    while (this.i < this.lines.length && !balanced(buffer)) {
      buffer += " " + this.lines[this.i].text.trim();
      this.i++;
    }
    if (!balanced(buffer)) this.fail("行内集合没有闭合");
    return buffer;
  }

  parseBlockScalar(header, parentIndent) {
    const literal = header[0] === "|";
    const chomp = header.includes("-") ? "strip" : header.includes("+") ? "keep" : "clip";

    const raw = [];
    let blockIndent = null;
    while (this.i < this.lines.length) {
      const line = this.lines[this.i];
      const text = line.text;
      if (!text.trim()) {
        raw.push("");
        this.i++;
        continue;
      }
      const actual = indentOf(text);
      if (actual <= parentIndent) break;
      if (blockIndent === null) blockIndent = actual;
      raw.push(text.slice(Math.min(blockIndent, actual)));
      this.i++;
    }

    // Trailing blank lines belong to chomping, not to the content.
    let trailing = 0;
    while (raw.length && raw[raw.length - 1] === "") {
      raw.pop();
      trailing++;
    }

    let text;
    if (literal) {
      text = raw.join("\n");
    } else {
      const folded = [];
      for (let i = 0; i < raw.length; i++) {
        if (raw[i] === "") folded.push("\n");
        else if (i > 0 && raw[i - 1] !== "") folded.push(" " + raw[i]);
        else folded.push(raw[i]);
      }
      text = folded.join("");
    }

    if (chomp === "strip") return text;
    if (chomp === "keep") return text + "\n".repeat(trailing + 1);
    return text + "\n";
  }
}

/**
 * Parses a YAML document. Multiple documents return an array.
 * @returns {{ok: true, value: any, documents: any[]} | {ok: false, error: string}}
 */
export function parseYaml(text) {
  if (typeof text !== "string") return failure("需要文本输入");
  if (!text.trim()) return result(null);

  const lines = [];
  const rawLines = text.replace(/\r\n?/g, "\n").split("\n");
  const chunks = [[]];
  rawLines.forEach((raw, index) => {
    if (/^(---|\.\.\.)(\s|$)/.test(raw)) {
      chunks.push([]);
      return;
    }
    chunks[chunks.length - 1].push({ text: raw.replace(/\s+$/, ""), no: index + 1 });
  });

  const documents = [];
  for (const chunk of chunks) {
    if (chunk.every((line) => YamlParser.isBlank(line))) continue;
    try {
      documents.push(new YamlParser(chunk).parseDocument());
    } catch (err) {
      return failure(err.message || String(err));
    }
  }

  return { ok: true, value: documents.length > 1 ? documents : documents[0] ?? null, documents };
}

/* ------------------------------------------------------------------ */
/* Serializer                                                          */
/* ------------------------------------------------------------------ */

const PLAIN_SAFE = /^[A-Za-z0-9_./+@$][A-Za-z0-9_./+@$ ()-]*$/;

function needsQuotes(text) {
  if (text === "") return true;
  if (NULLS.has(text) || TRUES.has(text) || FALSES.has(text)) return true;
  if (/^(yes|no|on|off|y|n)$/i.test(text)) return true;
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(text)) return true;
  if (/^[-+]?(0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+)$/.test(text)) return true;
  if (/^\s|\s$/.test(text)) return true;
  if (/[\n\t\r]/.test(text)) return true;
  if (/^[!&*?|>%@`"'{[\],#:-]/.test(text)) return true;
  if (/: | #/.test(text)) return true;
  if (text.endsWith(":")) return true;
  return !PLAIN_SAFE.test(text);
}

function quote(text) {
  return (
    '"' +
    text
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r") +
    '"'
  );
}

function renderKey(key) {
  const text = String(key);
  return needsQuotes(text) ? quote(text) : text;
}

function renderScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return ".nan";
    if (!Number.isFinite(value)) return value > 0 ? ".inf" : "-.inf";
    return String(value);
  }
  if (typeof value === "bigint") return String(value);
  const text = String(value);
  return needsQuotes(text) ? quote(text) : text;
}

function isContainer(value) {
  return value !== null && typeof value === "object";
}

function isEmptyContainer(value) {
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

/* Multiline strings read much better as a literal block than as "\n" soup. */
function renderBlockString(text, pad) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const body = lines.map((line) => (line ? pad + line : "")).join("\n");
  return text.endsWith("\n") ? `|\n${body}` : `|-\n${body}`;
}

function renderValue(value, indent) {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (!value.length) return [`${pad}[]`];
    const lines = [];
    for (const item of value) {
      if (!isContainer(item)) {
        lines.push(`${pad}- ${renderScalar(item)}`);
      } else if (isEmptyContainer(item)) {
        lines.push(`${pad}- ${Array.isArray(item) ? "[]" : "{}"}`);
      } else {
        const child = renderValue(item, indent + 2);
        lines.push(pad + "- " + child[0].slice(indent + 2));
        for (let i = 1; i < child.length; i++) lines.push(child[i]);
      }
    }
    return lines;
  }

  const entries = Object.entries(value);
  if (!entries.length) return [`${pad}{}`];

  const lines = [];
  for (const [key, item] of entries) {
    const name = renderKey(key);
    if (!isContainer(item)) {
      if (typeof item === "string" && item.includes("\n")) {
        lines.push(`${pad}${name}: ${renderBlockString(item, pad + "  ")}`);
      } else {
        lines.push(`${pad}${name}: ${renderScalar(item)}`);
      }
    } else if (isEmptyContainer(item)) {
      lines.push(`${pad}${name}: ${Array.isArray(item) ? "[]" : "{}"}`);
    } else {
      lines.push(`${pad}${name}:`);
      lines.push(...renderValue(item, indent + 2));
    }
  }
  return lines;
}

/** Serializes a value as block-style YAML. */
export function stringifyYaml(value) {
  if (!isContainer(value)) return `${renderScalar(value)}\n`;
  if (isEmptyContainer(value)) return `${Array.isArray(value) ? "[]" : "{}"}\n`;
  return renderValue(value, 0).join("\n") + "\n";
}

/** YAML text to pretty JSON. */
export function yamlToJson(text, indent = 2) {
  const parsed = parseYaml(text);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, value: JSON.stringify(parsed.value, null, indent) };
  } catch (err) {
    return failure(`无法序列化为 JSON：${err.message}`);
  }
}

/** JSON text (or a value) to YAML. */
export function jsonToYaml(input, indent = 2) {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (err) {
      return failure(`JSON 解析失败：${err.message}`);
    }
  }
  if (typeof indent !== "number" || indent < 1 || indent > 8) indent = 2;
  try {
    return { ok: true, value: stringifyYaml(value) };
  } catch (err) {
    return failure(`无法生成 YAML：${err.message}`);
  }
}
