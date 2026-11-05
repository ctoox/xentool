/*
 * JSONPath — original code for xentool.
 *
 * Implements the query surface people actually use day to day: $, dot and
 * bracket children, numeric indices, slices, wildcards, recursive descent and
 * filter expressions with &&, || and the usual comparison operators.
 *
 * Every match comes back with the concrete path that produced it ($['a'][0]),
 * which is the difference between "here is some value" and "here is where it
 * lives" — the second one is what you need when editing the document.
 */

class PathError extends Error {}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

function unquote(text) {
  const quote = text[0];
  if (quote !== '"' && quote !== "'") return text;
  if (text[text.length - 1] !== quote) throw new PathError("引号没有闭合");
  return text.slice(1, -1).replace(/\\(.)/g, "$1");
}

function parsePath(path) {
  let text = path.trim();
  if (text === "" || text === "$") return [];
  if (text[0] === "$") text = text.slice(1);

  const segments = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === ".") {
      if (text[i + 1] === ".") {
        i += 2;
        if (text[i] === "*") {
          segments.push({ type: "recursive", key: null });
          i++;
          continue;
        }
        if (text[i] === "[") continue; // ..[0] — the bracket parser handles it
        const name = readName(text, i);
        segments.push({ type: "recursive", key: name.value });
        i = name.end;
        continue;
      }
      i++;
      if (text[i] === "*") {
        segments.push({ type: "wildcard" });
        i++;
        continue;
      }
      const name = readName(text, i);
      segments.push({ type: "child", key: name.value });
      i = name.end;
      continue;
    }

    if (ch === "[") {
      const end = findClosing(text, i);
      const body = text.slice(i + 1, end).trim();
      segments.push(parseBracket(body));
      i = end + 1;
      continue;
    }

    if (ch === "*" ) {
      segments.push({ type: "wildcard" });
      i++;
      continue;
    }

    const name = readName(text, i);
    segments.push({ type: "child", key: name.value });
    i = name.end;
  }

  return segments;
}

function readName(text, start) {
  let i = start;
  while (i < text.length && text[i] !== "." && text[i] !== "[") i++;
  const raw = text.slice(start, i).trim();
  if (!raw) throw new PathError("路径里有一个空的属性名");
  return { value: unquote(raw), end: i };
}

function findClosing(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new PathError("方括号没有闭合");
}

function parseBracket(body) {
  if (!body) throw new PathError("空的方括号");

  if (body === "*") return { type: "wildcard" };

  if (body[0] === "?") {
    let expression = body.slice(1).trim();
    if (expression[0] === "(" && expression[expression.length - 1] === ")") {
      expression = expression.slice(1, -1);
    }
    if (!expression) throw new PathError("过滤表达式是空的");
    return { type: "filter", expression };
  }

  if (body.includes(":") && !/^\s*['"]/.test(body)) {
    const parts = body.split(":");
    if (parts.length > 3) throw new PathError("切片最多三段：start:end:step");
    const number = (value, fallback) => {
      if (value === undefined || value.trim() === "") return fallback;
      const parsed = Number(value.trim());
      if (!Number.isInteger(parsed)) throw new PathError(`切片里的 ${value} 不是整数`);
      return parsed;
    };
    return {
      type: "slice",
      start: number(parts[0], 0),
      end: number(parts[1], undefined),
      step: number(parts[2], 1),
    };
  }

  const items = splitTopLevel(body, ",");
  if (!items.length) throw new PathError("空的方括号");

  const keys = items.map((item) => {
    const trimmed = item.trim();
    if (/^['"]/.test(trimmed)) return unquote(trimmed);
    const asNumber = Number(trimmed);
    if (Number.isInteger(asNumber)) return asNumber;
    return trimmed;
  });

  if (keys.length === 1) {
    const key = keys[0];
    return typeof key === "number" ? { type: "index", index: key } : { type: "child", key };
  }
  return { type: "union", keys };
}

function pathKey(path, key) {
  if (typeof key === "number") return `${path}[${key}]`;
  return IDENTIFIER.test(key) ? `${path}.${key}` : `${path}['${String(key).replace(/'/g, "\\'")}']`;
}

function applySegment(matches, segment) {
  const next = [];

  for (const match of matches) {
    const value = match.value;

    switch (segment.type) {
      case "child": {
        if (value === null || typeof value !== "object") break;
        if (Array.isArray(value)) {
          // A named child on an array means "this key on each element", which
          // is what people expect from a list of records.
          value.forEach((item, index) => {
            if (item && typeof item === "object" && Object.hasOwn(item, segment.key)) {
              next.push({ path: pathKey(match.path, index) + pathKey("", segment.key).replace(/^\./, "."), value: item[segment.key] });
            }
          });
          break;
        }
        if (Object.hasOwn(value, segment.key)) {
          next.push({ path: pathKey(match.path, segment.key), value: value[segment.key] });
        }
        break;
      }

      case "index": {
        if (!Array.isArray(value)) break;
        const index = segment.index < 0 ? value.length + segment.index : segment.index;
        if (index >= 0 && index < value.length) {
          next.push({ path: `${match.path}[${index}]`, value: value[index] });
        }
        break;
      }

      case "union": {
        for (const key of segment.keys) {
          if (typeof key === "number") {
            if (Array.isArray(value)) {
              const index = key < 0 ? value.length + key : key;
              if (index >= 0 && index < value.length) {
                next.push({ path: `${match.path}[${index}]`, value: value[index] });
              }
            }
          } else if (value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, key)) {
            next.push({ path: pathKey(match.path, key), value: value[key] });
          }
        }
        break;
      }

      case "slice": {
        if (!Array.isArray(value)) break;
        const step = segment.step || 1;
        const length = value.length;
        let start = segment.start ?? (step > 0 ? 0 : length - 1);
        let end = segment.end ?? (step > 0 ? length : -1);
        if (start < 0) start += length;
        if (end < 0 && segment.end !== undefined) end += length;
        if (step > 0) {
          for (let i = Math.max(0, start); i < Math.min(length, end); i += step) {
            next.push({ path: `${match.path}[${i}]`, value: value[i] });
          }
        } else {
          for (let i = Math.min(length - 1, start); i > Math.max(-1, end); i += step) {
            next.push({ path: `${match.path}[${i}]`, value: value[i] });
          }
        }
        break;
      }

      case "wildcard": {
        if (Array.isArray(value)) {
          value.forEach((item, index) => next.push({ path: `${match.path}[${index}]`, value: item }));
        } else if (value && typeof value === "object") {
          for (const [key, item] of Object.entries(value)) {
            next.push({ path: pathKey(match.path, key), value: item });
          }
        }
        break;
      }

      case "recursive": {
        const walk = (node, nodePath) => {
          if (Array.isArray(node)) {
            node.forEach((item, index) => {
              const childPath = `${nodePath}[${index}]`;
              // Keys are collected by the object branch below; pushing here too
              // would report every match twice.
              if (segment.key === null) next.push({ path: childPath, value: item });
              walk(item, childPath);
            });
            return;
          }
          if (node && typeof node === "object") {
            for (const [key, item] of Object.entries(node)) {
              const childPath = pathKey(nodePath, key);
              if (segment.key === null) next.push({ path: childPath, value: item });
              else if (key === segment.key) next.push({ path: childPath, value: item });
              walk(item, childPath);
            }
          }
        };
        walk(value, match.path);
        break;
      }

      case "filter": {
        const candidates = Array.isArray(value)
          ? value.map((item, index) => ({ path: `${match.path}[${index}]`, value: item }))
          : value && typeof value === "object"
            ? Object.entries(value).map(([key, item]) => ({ path: pathKey(match.path, key), value: item }))
            : [];
        for (const candidate of candidates) {
          if (evaluateFilter(segment.expression, candidate.value)) next.push(candidate);
        }
        break;
      }

      default:
        throw new PathError(`未知的路径段：${segment.type}`);
    }
  }

  return next;
}

/* ------------------------------ filters ------------------------------ */

function resolveAt(expression, node) {
  const segments = parsePath(expression);
  let matches = [{ path: "$", value: node }];
  for (const segment of segments) matches = applySegment(matches, segment);
  return matches.length ? matches[0].value : undefined;
}

function literal(text) {
  const trimmed = text.trim();
  if (/^['"]/.test(trimmed)) return unquote(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  const number = Number(trimmed);
  if (trimmed !== "" && !Number.isNaN(number)) return number;
  return trimmed;
}

function compare(left, operator, right) {
  const bothNumbers = typeof left === "number" && typeof right === "number";
  const a = bothNumbers ? left : typeof left === "string" && typeof right === "string" ? left : left;
  const b = bothNumbers ? right : typeof left === "string" && typeof right === "string" ? right : right;

  switch (operator) {
    case "==":
      return a === b || String(a) === String(b);
    case "!=":
      return !(a === b || String(a) === String(b));
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "=~": {
      const pattern = String(b);
      const match = /^\/(.*)\/([a-z]*)$/.exec(pattern);
      try {
        return match ? new RegExp(match[1], match[2]).test(String(a)) : new RegExp(pattern).test(String(a));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function evaluateTerm(term, node) {
  let text = term.trim();
  while (text[0] === "(" && text[text.length - 1] === ")") text = text.slice(1, -1).trim();
  if (!text) return false;

  // Comparisons are matched from the right so ">=" wins over ">".
  const operator = /(===|!==|==|!=|>=|<=|=~|>|<)(?!=)/.exec(text);
  if (!operator) {
    const value = text[0] === "@" ? resolveAt(text.slice(1), node) : literal(text);
    return value !== undefined && value !== null && value !== false && value !== "" && value !== 0;
  }

  const leftText = text.slice(0, operator.index).trim();
  const rightText = text.slice(operator.index + operator[0].length).trim();
  const left = leftText[0] === "@" ? resolveAt(leftText.slice(1), node) : literal(leftText);
  const right = rightText[0] === "@" ? resolveAt(rightText.slice(1), node) : literal(rightText);
  if (left === undefined) return false;
  return compare(left, operator[1] === "===" ? "==" : operator[1] === "!==" ? "!=" : operator[1], right);
}

function evaluateFilter(expression, node) {
  return splitTopLevel(expression, "||").some((clause) =>
    splitTopLevel(clause, "&&").every((term) => evaluateTerm(term, node)),
  );
}

/**
 * Runs a JSONPath query.
 * @returns {{ok: true, value: {matches: {path: string, value: any}[], count: number}} | {ok: false, error: string}}
 */
export function queryJsonPath(data, path) {
  if (typeof path !== "string") return { ok: false, error: "需要 JSONPath 表达式" };

  let segments;
  try {
    segments = parsePath(path);
  } catch (err) {
    return { ok: false, error: err.message.startsWith("路径") || err instanceof PathError ? err.message : `路径有误：${err.message}` };
  }

  try {
    let matches = [{ path: "$", value: data }];
    for (const segment of segments) {
      matches = applySegment(matches, segment);
      if (!matches.length) break;
    }
    return { ok: true, value: { matches, count: matches.length } };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export const JSONPATH_EXAMPLES = [
  { path: "$.store.book[*].author", note: "所有作者" },
  { path: "$..price", note: "任意深度的 price" },
  { path: "$.store.book[0,1]", note: "前两本书" },
  { path: "$.store.book[?(@.price < 10)]", note: "价格低于 10 的书" },
  { path: "$.store.book[-1:]", note: "最后一本书" },
];
