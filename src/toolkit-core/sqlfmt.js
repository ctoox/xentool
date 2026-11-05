/*
 * SQL formatter — original code for xentool.
 *
 * A tokenizer plus a line-breaking pass, not a parser. It never rewrites the
 * query: string literals, quoted identifiers, numbers and comments are copied
 * through byte for byte, and only whitespace and keyword case change. That is
 * the property that makes it safe to run on a query you actually care about.
 */

const KEYWORDS = new Set(
  `select from where group order by having limit offset union all except intersect insert into values update set delete
  returning with as on join inner left right full outer cross natural using case when then else end and or not null is
  in between like ilike exists distinct asc desc nulls first last over partition window rows range current row unbounded
  preceding following create table alter drop index view primary key foreign references default unique check constraint
  cast begin commit rollback truncate explain analyze vacuum grant revoke if cascade add column rename to type`
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.toUpperCase()),
);

// Phrases that must be treated as one unit when deciding where a line breaks.
const PHRASES = [
  ["LEFT", "OUTER", "JOIN"],
  ["RIGHT", "OUTER", "JOIN"],
  ["FULL", "OUTER", "JOIN"],
  ["INNER", "JOIN"],
  ["LEFT", "JOIN"],
  ["RIGHT", "JOIN"],
  ["FULL", "JOIN"],
  ["CROSS", "JOIN"],
  ["GROUP", "BY"],
  ["ORDER", "BY"],
  ["PARTITION", "BY"],
  ["UNION", "ALL"],
  ["INSERT", "INTO"],
  ["DELETE", "FROM"],
  ["CREATE", "TABLE"],
  ["ALTER", "TABLE"],
  ["DROP", "TABLE"],
  ["IS", "NOT"],
];

const CLAUSE_STARTS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "GROUP BY",
  "ORDER BY",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "UNION",
  "UNION ALL",
  "EXCEPT",
  "INTERSECT",
  "VALUES",
  "SET",
  "RETURNING",
  "WITH",
  "INSERT INTO",
  "UPDATE",
  "DELETE FROM",
  "CREATE TABLE",
  "ALTER TABLE",
  "DROP TABLE",
  "JOIN",
  "INNER JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "FULL JOIN",
  "CROSS JOIN",
  "LEFT OUTER JOIN",
  "RIGHT OUTER JOIN",
  "FULL OUTER JOIN",
]);

const BREAK_KEYWORDS = new Set(["AND", "OR", "WHEN", "ELSE"]);

class SqlError extends Error {}

function tokenize(sql) {
  const tokens = [];
  let i = 0;

  const push = (type, value) => tokens.push({ type, value });

  while (i < sql.length) {
    const ch = sql[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      let end = sql.indexOf("\n", i);
      if (end < 0) end = sql.length;
      push("comment", sql.slice(i, end).trimEnd());
      i = end;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new SqlError("块注释没有闭合（缺少 */）");
      push("comment", sql.slice(i, end + 2));
      i = end + 2;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      let j = i + 1;
      let value = ch;
      for (;;) {
        if (j >= sql.length) throw new SqlError(`引号没有闭合：${quote}`);
        if (sql[j] === quote) {
          // Doubled quote is an escaped quote, both in SQL and in MySQL.
          if (sql[j + 1] === quote) {
            value += quote + quote;
            j += 2;
            continue;
          }
          value += quote;
          j++;
          break;
        }
        if (sql[j] === "\\" && quote !== "`") {
          value += sql[j] + (sql[j + 1] ?? "");
          j += 2;
          continue;
        }
        value += sql[j];
        j++;
      }
      push("string", value);
      i = j;
      continue;
    }

    if (ch === "[") {
      const end = sql.indexOf("]", i + 1);
      if (end < 0) throw new SqlError("方括号标识符没有闭合");
      push("string", sql.slice(i, end + 1));
      i = end + 1;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      const match = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(sql.slice(i));
      push("number", match[0]);
      i += match[0].length;
      continue;
    }

    if (/[A-Za-z_$\u0080-\uffff]/.test(ch)) {
      const match = /^[A-Za-z0-9_$\u0080-\uffff]+/.exec(sql.slice(i));
      push("word", match[0]);
      i += match[0].length;
      continue;
    }

    const two = sql.slice(i, i + 2);
    if (["<>", "!=", "<=", ">=", "||", "::", "->", "=>", ":=", "&&"].includes(two)) {
      push("punct", two);
      i += 2;
      continue;
    }

    push("punct", ch);
    i++;
  }

  return tokens;
}

/* Longest phrase starting at index j, as an uppercase label. */
function phraseAt(tokens, j) {
  for (const phrase of PHRASES) {
    let matched = true;
    for (let k = 0; k < phrase.length; k++) {
      const token = tokens[j + k];
      if (!token || token.type !== "word" || token.value.toUpperCase() !== phrase[k]) {
        matched = false;
        break;
      }
    }
    if (matched) return { label: phrase.join(" "), length: phrase.length };
  }
  return null;
}

function isWord(token) {
  return token && (token.type === "word" || token.type === "number" || token.type === "string");
}

/**
 * Formats a SQL statement: one clause per line, keywords upper-cased, list
 * items kept inline.
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function formatSql(sql, options = {}) {
  if (typeof sql !== "string" || !sql.trim()) return { ok: false, error: "需要 SQL 文本" };

  let tokens;
  try {
    tokens = tokenize(sql);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const uppercase = options.uppercase !== false;
  const indentSize = options.indent === 4 ? 4 : 2;

  const lines = [];
  let line = "";
  let lineIndent = 0;
  let depth = 0;
  const parens = [];
  let prev = null;

  const flush = () => {
    if (line.trim()) lines.push(" ".repeat(lineIndent) + line.trim());
    line = "";
  };

  const startLine = (indent) => {
    flush();
    lineIndent = indent;
  };

  const append = (text, space) => {
    if (!line) line = text;
    else line += (space ? " " : "") + text;
  };

  /* After ".", "::" or "(" the next token is glued, not spaced. */
  const needsSpace = () => {
    if (!prev) return false;
    return !(prev.type === "punct" && [".", "::", "("].includes(prev.value));
  };

  const spaceBeforeParen = () => {
    if (!prev) return false;
    if (prev.type === "punct") return !["(", ".", "::"].includes(prev.value);
    if (prev.type === "word") return KEYWORDS.has(prev.label || prev.value.toUpperCase());
    return true;
  };

  for (let j = 0; j < tokens.length; j++) {
    const token = tokens[j];

    if (token.type === "comment") {
      if (token.value.startsWith("--")) {
        startLine(depth * indentSize);
        append(token.value, false);
        flush();
      } else {
        append(token.value, true);
      }
      prev = token;
      continue;
    }

    if (token.type === "punct") {
      switch (token.value) {
        case "(": {
          const next = tokens[j + 1];
          const subquery = next && next.type === "word" && /^(SELECT|WITH)$/i.test(next.value);
          append("(", spaceBeforeParen());
          parens.push(subquery);
          if (subquery) {
            depth++;
            startLine(depth * indentSize);
          }
          prev = token;
          continue;
        }
        case ")": {
          const subquery = parens.pop();
          if (subquery) {
            depth = Math.max(0, depth - 1);
            startLine(depth * indentSize);
            append(")", false);
          } else {
            append(")", false);
          }
          prev = token;
          continue;
        }
        case ",":
          append(",", false);
          prev = token;
          continue;
        case ";":
          append(";", false);
          flush();
          depth = 0;
          parens.length = 0;
          prev = token;
          continue;
        case ".":
        case "::":
          append(token.value, false);
          prev = token;
          continue;
        case "*":
          // "t.*" stays glued; a bare "*" is an operator and gets spaces.
          append(token.value, !(prev && (prev.value === "." || prev.value === "(")));
          prev = token;
          continue;
        default:
          append(token.value, true);
          prev = token;
          continue;
      }
    }

    if (token.type === "word") {
      const upper = token.value.toUpperCase();
      const phrase = phraseAt(tokens, j);
      const label = phrase ? phrase.label : upper;
      const length = phrase ? phrase.length : 1;

      if (CLAUSE_STARTS.has(label)) {
        startLine(depth * indentSize);
        append(uppercase ? label : tokens.slice(j, j + length).map((t) => t.value).join(" "), false);
        prev = { type: "word", value: label, label };
        j += length - 1;
        continue;
      }

      if (BREAK_KEYWORDS.has(label)) {
        startLine(depth * indentSize + indentSize);
        append(upper, false);
        prev = { type: "word", value: upper, label: upper };
        continue;
      }

      if (label === "ON" || label === "USING") {
        append(upper, true);
        prev = { type: "word", value: upper, label: upper };
        continue;
      }

      append(uppercase && KEYWORDS.has(upper) ? upper : token.value, needsSpace());
      prev = { type: "word", value: token.value, label: upper };
      continue;
    }

    // Strings and numbers keep their exact text and only get a separating space.
    append(token.value, needsSpace());
    prev = token;
  }

  flush();

  if (!lines.length) return { ok: false, error: "没有可格式化的内容" };
  return { ok: true, value: lines.join("\n") };
}
