/*
 * TOML parser — original code for xentool.
 *
 * Supports the parts of TOML 1.0 that appear in real config files: bare and
 * quoted keys, dotted keys, [tables], [[arrays of tables]], basic and literal
 * strings (single- and multi-line), integers in four bases, floats, booleans,
 * dates/times (kept as ISO strings, since JSON has no date type), arrays and
 * inline tables.
 *
 * Dates stay strings on purpose: turning 2024-01-01 into a JS Date would shift
 * the value by the browser's timezone and quietly corrupt the output.
 */

function failure(error) {
  return { ok: false, error };
}

const BARE_KEY = /^[A-Za-z0-9_-]+/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?/;
const LOCAL_TIME = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?/;
const NUMBER = /^[+-]?(?:0x[0-9a-fA-F](?:_?[0-9a-fA-F])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*|inf|nan|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?)/;

const ESCAPES = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

class TomlParser {
  constructor(text) {
    this.text = text.replace(/\r\n?/g, "\n");
    this.i = 0;
    this.root = {};
    this.current = this.root;
    // Table headers may only be written once; dotted keys may create the same
    // table implicitly, which TOML allows.
    this.tables = new Set();
  }

  fail(message) {
    const before = this.text.slice(0, this.i);
    const line = before.split("\n").length;
    const column = this.i - before.lastIndexOf("\n");
    throw new Error(`${message}（第 ${line} 行第 ${column} 列）`);
  }

  eof() {
    return this.i >= this.text.length;
  }

  peek(offset = 0) {
    return this.text[this.i + offset];
  }

  skipSpace() {
    while (!this.eof() && (this.peek() === " " || this.peek() === "\t")) this.i++;
  }

  skipComment() {
    if (this.peek() !== "#") return;
    while (!this.eof() && this.peek() !== "\n") this.i++;
  }

  /* Whitespace, comments and newlines — legal between array items and statements. */
  skipBlank() {
    for (;;) {
      this.skipSpace();
      this.skipComment();
      if (this.peek() === "\n") {
        this.i++;
        continue;
      }
      break;
    }
  }

  parse() {
    for (;;) {
      this.skipBlank();
      if (this.eof()) break;
      if (this.peek() === "[") this.parseTableHeader();
      else this.parseKeyValue();

      this.skipSpace();
      this.skipComment();
      if (this.eof()) break;
      if (this.peek() !== "\n") this.fail("这一行结束得不干净，可能有漏掉的逗号或引号");
      this.i++;
    }
    return this.root;
  }

  parseTableHeader() {
    this.i++; // [
    const isArray = this.peek() === "[";
    if (isArray) this.i++;

    const keys = this.parseKeyPath();
    this.skipSpace();
    if (this.peek() !== "]") this.fail("表名后面缺少 ]");
    this.i++;
    if (isArray) {
      if (this.peek() !== "]") this.fail("数组表名后面缺少 ]]");
      this.i++;
    }

    let parent = this.root;
    for (const key of keys.slice(0, -1)) {
      parent = this.descend(parent, key);
    }
    const last = keys[keys.length - 1];

    if (isArray) {
      if (parent[last] === undefined) parent[last] = [];
      if (!Array.isArray(parent[last])) this.fail(`[[${keys.join(".")}]] 与已有值冲突`);
      const entry = {};
      parent[last].push(entry);
      this.current = entry;
    } else {
      const id = keys.join("\u0000");
      if (this.tables.has(id)) this.fail(`表 [${keys.join(".")}] 重复定义`);
      this.tables.add(id);
      if (parent[last] === undefined) parent[last] = {};
      if (typeof parent[last] !== "object" || parent[last] === null || Array.isArray(parent[last])) {
        this.fail(`[${keys.join(".")}] 与已有值冲突`);
      }
      this.current = parent[last];
    }
  }

  /* Walks one step of a dotted path, creating tables as needed. */
  descend(parent, key) {
    let next = parent[key];
    if (Array.isArray(next)) next = next[next.length - 1];
    if (next === undefined) {
      next = {};
      parent[key] = next;
    }
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      this.fail(`键 ${key} 已经是普通值，不能再往下展开`);
    }
    return next;
  }

  parseKeyValue() {
    const keys = this.parseKeyPath();
    this.skipSpace();
    if (this.peek() !== "=") this.fail("键后面缺少 =");
    this.i++;
    this.skipSpace();
    const value = this.parseValue();

    let target = this.current;
    for (const key of keys.slice(0, -1)) target = this.descend(target, key);
    const last = keys[keys.length - 1];
    if (Object.hasOwn(target, last)) this.fail(`键 ${last} 重复定义`);
    target[last] = value;
  }

  parseKeyPath() {
    const keys = [];
    for (;;) {
      this.skipSpace();
      keys.push(this.parseKey());
      this.skipSpace();
      if (this.peek() !== ".") break;
      this.i++;
    }
    return keys;
  }

  parseKey() {
    if (this.peek() === '"') return this.parseBasicString();
    if (this.peek() === "'") return this.parseLiteralString();
    const match = BARE_KEY.exec(this.text.slice(this.i));
    if (!match) this.fail("这里应该是一个键名");
    this.i += match[0].length;
    return match[0];
  }

  parseValue() {
    if (this.eof()) this.fail("等号后面缺少值");
    const ch = this.peek();

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const triple = this.peek(1) === ch && this.peek(2) === ch;
      if (triple) return quote === '"' ? this.parseMultilineBasic() : this.parseMultilineLiteral();
      return quote === '"' ? this.parseBasicString() : this.parseLiteralString();
    }
    if (ch === "[") return this.parseArray();
    if (ch === "{") return this.parseInlineTable();
    if (/[0-9+\-]/.test(ch)) {
      const rest = this.text.slice(this.i);
      const date = DATE_TIME.exec(rest);
      // A date-time must be followed by a delimiter, not by more digits.
      if (date && !/^[0-9A-Za-z_]/.test(rest.slice(date[0].length))) {
        this.i += date[0].length;
        return date[0];
      }
      const time = LOCAL_TIME.exec(rest);
      if (time && !/^[0-9A-Za-z_]/.test(rest.slice(time[0].length))) {
        this.i += time[0].length;
        return time[0];
      }
      return this.parseNumber();
    }
    if (this.text.startsWith("true", this.i) && !/[0-9A-Za-z_]/.test(this.peek(4) || "")) {
      this.i += 4;
      return true;
    }
    if (this.text.startsWith("false", this.i) && !/[0-9A-Za-z_]/.test(this.peek(5) || "")) {
      this.i += 5;
      return false;
    }
    this.fail("无法识别的值");
  }

  parseNumber() {
    const match = NUMBER.exec(this.text.slice(this.i));
    if (!match) this.fail("无法识别的数字");
    const raw = match[0];
    this.i += raw.length;
    const sign = raw[0] === "-" ? -1 : 1;
    const body = raw.replace(/^[+-]/, "").replace(/_/g, "");

    if (body === "inf") return sign * Infinity;
    if (body === "nan") return NaN;
    if (/^0x/.test(body)) return sign * parseInt(body.slice(2), 16);
    if (/^0o/.test(body)) return sign * parseInt(body.slice(2), 8);
    if (/^0b/.test(body)) return sign * parseInt(body.slice(2), 2);
    return Number(raw.replace(/_/g, ""));
  }

  parseBasicString() {
    this.i++; // "
    let out = "";
    for (;;) {
      if (this.eof()) this.fail("字符串没有闭合");
      const ch = this.peek();
      if (ch === "\n") this.fail("普通字符串不能换行，多行请用三引号");
      if (ch === '"') {
        this.i++;
        return out;
      }
      if (ch !== "\\") {
        out += ch;
        this.i++;
        continue;
      }
      this.i++;
      const esc = this.peek();
      if (esc === "u" || esc === "U") {
        const width = esc === "u" ? 4 : 8;
        const hex = this.text.slice(this.i + 1, this.i + 1 + width);
        if (!new RegExp(`^[0-9a-fA-F]{${width}}$`).test(hex)) this.fail("无效的 Unicode 转义");
        out += String.fromCodePoint(parseInt(hex, 16));
        this.i += width + 1;
        continue;
      }
      if (!(esc in ESCAPES)) this.fail(`无效的转义 \\${esc}`);
      out += ESCAPES[esc];
      this.i++;
    }
  }

  parseLiteralString() {
    this.i++; // '
    const start = this.i;
    for (;;) {
      if (this.eof()) this.fail("字符串没有闭合");
      const ch = this.peek();
      if (ch === "\n") this.fail("普通字符串不能换行，多行请用三引号");
      if (ch === "'") {
        const text = this.text.slice(start, this.i);
        this.i++;
        return text;
      }
      this.i++;
    }
  }

  parseMultilineBasic() {
    this.i += 3;
    if (this.peek() === "\n") this.i++;
    let out = "";
    for (;;) {
      if (this.eof()) this.fail("多行字符串没有闭合");
      if (this.text.startsWith('"""', this.i)) {
        this.i += 3;
        // Up to two extra quotes are content, not a terminator.
        while (this.peek() === '"') {
          out += '"';
          this.i++;
        }
        return out;
      }
      const ch = this.peek();
      if (ch === "\\") {
        // A backslash at end of line eats the newline and the indentation.
        let j = this.i + 1;
        while (j < this.text.length && (this.text[j] === " " || this.text[j] === "\t")) j++;
        if (this.text[j] === "\n") {
          this.i = j;
          while (!this.eof() && /[\s]/.test(this.peek())) this.i++;
          continue;
        }
        this.i++;
        const esc = this.peek();
        if (esc === "u" || esc === "U") {
          const width = esc === "u" ? 4 : 8;
          const hex = this.text.slice(this.i + 1, this.i + 1 + width);
          if (!new RegExp(`^[0-9a-fA-F]{${width}}$`).test(hex)) this.fail("无效的 Unicode 转义");
          out += String.fromCodePoint(parseInt(hex, 16));
          this.i += width + 1;
          continue;
        }
        if (!(esc in ESCAPES)) this.fail(`无效的转义 \\${esc}`);
        out += ESCAPES[esc];
        this.i++;
        continue;
      }
      out += ch;
      this.i++;
    }
  }

  parseMultilineLiteral() {
    this.i += 3;
    if (this.peek() === "\n") this.i++;
    const start = this.i;
    for (;;) {
      if (this.eof()) this.fail("多行字符串没有闭合");
      if (this.text.startsWith("'''", this.i)) {
        let text = this.text.slice(start, this.i);
        this.i += 3;
        while (this.peek() === "'") {
          text += "'";
          this.i++;
        }
        return text;
      }
      this.i++;
    }
  }

  parseArray() {
    this.i++; // [
    const items = [];
    for (;;) {
      this.skipBlank();
      if (this.eof()) this.fail("数组没有闭合");
      if (this.peek() === "]") {
        this.i++;
        return items;
      }
      items.push(this.parseValue());
      this.skipBlank();
      if (this.peek() === ",") {
        this.i++;
        continue;
      }
      if (this.peek() === "]") {
        this.i++;
        return items;
      }
      this.fail("数组元素之间缺少逗号");
    }
  }

  parseInlineTable() {
    this.i++; // {
    const table = {};
    for (;;) {
      this.skipBlank();
      if (this.eof()) this.fail("行内表没有闭合");
      if (this.peek() === "}") {
        this.i++;
        return table;
      }
      const keys = this.parseKeyPath();
      this.skipSpace();
      if (this.peek() !== "=") this.fail("行内表的键后面缺少 =");
      this.i++;
      this.skipSpace();
      const value = this.parseValue();

      let target = table;
      for (const key of keys.slice(0, -1)) {
        if (target[key] === undefined) target[key] = {};
        target = target[key];
      }
      target[keys[keys.length - 1]] = value;

      this.skipBlank();
      if (this.peek() === ",") {
        this.i++;
        continue;
      }
      if (this.peek() === "}") {
        this.i++;
        return table;
      }
      this.fail("行内表缺少逗号或 }");
    }
  }
}

/**
 * @returns {{ok: true, value: any} | {ok: false, error: string}}
 */
export function parseToml(text) {
  if (typeof text !== "string") return failure("需要文本输入");
  if (!text.trim()) return { ok: true, value: {} };
  try {
    return { ok: true, value: new TomlParser(text).parse() };
  } catch (err) {
    return failure(err.message || String(err));
  }
}

export function tomlToJson(text, indent = 2) {
  const parsed = parseToml(text);
  if (!parsed.ok) return parsed;
  try {
    return { ok: true, value: JSON.stringify(parsed.value, null, indent) };
  } catch (err) {
    return failure(`无法序列化为 JSON：${err.message}`);
  }
}
