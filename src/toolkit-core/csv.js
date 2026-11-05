/*
 * CSV — original code for xentool.
 *
 * RFC 4180 parsing: quoted fields, doubled quotes, embedded commas and
 * newlines, CRLF or LF. The delimiter is sniffed from the first row so
 * semicolon and tab exports work without a setting.
 *
 * Values stay strings. "007" must not become 7, and "1e3" must not become
 * 1000 — a converter that silently retypes columns is a source of bugs.
 */

const CANDIDATES = [",", ";", "\t", "|"];

function sniffDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  let best = ",";
  let bestCount = -1;
  for (const candidate of CANDIDATES) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') {
        if (quoted && firstLine[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && ch === candidate) {
        count++;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      continue;
    }

    if (ch === delimiter) {
      endField();
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      continue;
    }

    field += ch;
    fieldStarted = true;
  }

  if (quoted) throw new Error("引号没有闭合");
  if (field !== "" || row.length) endRow();

  return rows;
}

export function parseCsv(text, options = {}) {
  if (typeof text !== "string") return { ok: false, error: "需要 CSV 文本" };
  const delimiter = options.delimiter && options.delimiter !== "auto" ? options.delimiter : null;

  try {
    const used = delimiter || sniffDelimiter(text.replace(/^\uFEFF/, ""));
    const rows = parseRows(text.replace(/^\uFEFF/, ""), used);
    return { ok: true, value: { rows, delimiter: used } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCell(text, delimiter) {
  if (text === "") return "";
  const needsQuotes =
    text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text) || /^\s|\s$/.test(text);
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * CSV to an array of objects (header row) or arrays (header: false).
 * @returns {{ok: true, value: any[], delimiter: string, columns: string[]} | {ok: false, error: string}}
 */
export function csvToJson(text, options = {}) {
  const parsed = parseCsv(text, options);
  if (!parsed.ok) return parsed;

  const { rows, delimiter } = parsed.value;
  if (!rows.length) return { ok: true, value: [], delimiter, columns: [] };

  if (options.header === false) {
    return { ok: true, value: rows, delimiter, columns: [] };
  }

  const header = rows[0].map((name, index) => name.trim() || `column_${index + 1}`);
  const seen = new Map();
  const columns = header.map((name) => {
    const count = (seen.get(name) || 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });

  const value = rows.slice(1).map((row) => {
    const object = {};
    columns.forEach((name, index) => {
      object[name] = row[index] ?? "";
    });
    return object;
  });

  return { ok: true, value, delimiter, columns };
}

/** Rows (objects or arrays) to CSV text. Columns follow first-seen key order. */
export function jsonToCsv(rows, options = {}) {
  if (!Array.isArray(rows)) return { ok: false, error: "需要数组，例如 [{...}, {...}]" };
  if (!rows.length) return { ok: true, value: "" };

  const delimiter = options.delimiter && options.delimiter !== "auto" ? options.delimiter : ",";
  const header = options.header !== false;

  let columns;
  if (rows.every((row) => Array.isArray(row))) {
    columns = [];
    for (const row of rows) {
      if (row.length > columns.length) columns = row.map((_, index) => String(index));
    }
    const body = rows.map((row) => row.map((cell) => escapeCell(cellText(cell), delimiter)).join(delimiter));
    return { ok: true, value: body.join("\r\n") + "\r\n" };
  }

  columns = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const lines = [];
  if (header) lines.push(columns.map((key) => escapeCell(key, delimiter)).join(delimiter));
  for (const row of rows) {
    lines.push(
      columns
        .map((key) => escapeCell(cellText(row === null || typeof row !== "object" ? "" : row[key]), delimiter))
        .join(delimiter),
    );
  }

  return { ok: true, value: lines.join("\r\n") + "\r\n" };
}

export const DELIMITERS = [
  ["auto", "自动检测"],
  [",", "逗号 ,"],
  [";", "分号 ;"],
  ["\t", "制表符 Tab"],
  ["|", "竖线 |"],
];
