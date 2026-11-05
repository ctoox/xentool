/*
 * JSON → TypeScript / JSON Schema — original code for xentool.
 *
 * Both functions infer the same shape, so they share the traversal below.
 * The inference is deliberately conservative: mixed arrays become unions
 * instead of `any`, fields missing from some elements become optional, and
 * integers stay integers so the generated TypeScript does not lie.
 */

const MAX_DEPTH = 12;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifierSafe(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
}

function pascal(text) {
  const words = String(text)
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const joined = words.map((word) => word[0].toUpperCase() + word.slice(1)).join("");
  return joined || "Item";
}

function singular(text) {
  if (/ies$/i.test(text)) return text.slice(0, -3) + (text.endsWith("IES") ? "Y" : "y");
  if (/ss$/i.test(text)) return text + "Item";
  if (/s$/i.test(text) && text.length > 1) return text.slice(0, -1);
  return text + "Item";
}

/* ---------------------------- TypeScript ---------------------------- */

function scalarType(value) {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "undefined":
      return "undefined";
    default:
      return "unknown";
  }
}

function unique(types) {
  return [...new Set(types)];
}

function objectType(object, name, out, depth) {
  const keys = Object.keys(object);
  if (!keys.length) return "Record<string, never>";

  const lines = [];
  for (const key of keys) {
    const field = identifierSafe(key) ? key : JSON.stringify(key);
    const childName = pascal(key);
    const type = typeOf(object[key], childName, out, depth + 1);
    lines.push(`  ${field}: ${type};`);
  }

  out.push(`export interface ${name} {\n${lines.join("\n")}\n}`);
  return name;
}

function arrayType(array, name, out, depth) {
  if (!array.length) return "unknown[]";

  const objects = array.filter(isPlainObject);
  if (objects.length === array.length) {
    // One interface for the whole array: union of keys, `?` where a key is
    // missing from some element.
    const merged = {};
    const counts = new Map();
    for (const item of array) {
      for (const [key, value] of Object.entries(item)) {
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!(key in merged)) merged[key] = value;
        else if (merged[key] === null) merged[key] = value;
      }
    }

    const elementName = pascal(singular(name));
    const lines = [];
    for (const [key, value] of Object.entries(merged)) {
      const field = identifierSafe(key) ? key : JSON.stringify(key);
      const optional = (counts.get(key) || 0) < array.length ? "?" : "";
      const type = typeOf(value, pascal(key), out, depth + 1);
      lines.push(`  ${field}${optional}: ${type};`);
    }
    out.push(`export interface ${elementName} {\n${lines.join("\n")}\n}`);
    return `${elementName}[]`;
  }

  const types = unique(array.map((item) => typeOf(item, pascal(singular(name)), out, depth + 1)));
  if (types.length === 1) return `${types[0]}[]`;
  return `(${types.join(" | ")})[]`;
}

function typeOf(value, name, out, depth) {
  if (depth > MAX_DEPTH) return "unknown";
  if (Array.isArray(value)) return arrayType(value, name, out, depth);
  if (isPlainObject(value)) return objectType(value, name, out, depth);
  return scalarType(value);
}

/**
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function jsonToTypeScript(value, rootName = "Root") {
  try {
    const out = [];
    const root = typeOf(value, pascal(rootName) || "Root", out, 0);
    const head = isPlainObject(value) || (Array.isArray(value) && value.length) ? "" : `export type ${pascal(rootName) || "Root"} = ${root};\n`;
    return { ok: true, value: (head + out.join("\n\n") + (out.length ? "\n" : "")).trim() + "\n" };
  } catch (err) {
    return { ok: false, error: `生成 TypeScript 失败：${err.message}` };
  }
}

/* ---------------------------- JSON Schema ---------------------------- */

function mergeSchemas(schemas) {
  const uniqueByJson = [];
  const seen = new Set();
  for (const schema of schemas) {
    const key = JSON.stringify(schema);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueByJson.push(schema);
  }
  if (uniqueByJson.length === 1) return uniqueByJson[0];

  // Objects merge key by key; anything else becomes a union.
  if (uniqueByJson.every((schema) => schema.type === "object")) {
    const properties = {};
    const requiredCount = new Map();
    for (const schema of uniqueByJson) {
      for (const [key, value] of Object.entries(schema.properties || {})) {
        properties[key] = properties[key] ? mergeSchemas([properties[key], value]) : value;
      }
      for (const key of schema.required || []) requiredCount.set(key, (requiredCount.get(key) || 0) + 1);
    }
    const required = [...requiredCount.entries()]
      .filter(([, count]) => count === uniqueByJson.length)
      .map(([key]) => key);
    const merged = { type: "object", properties };
    if (required.length) merged.required = required;
    return merged;
  }

  return { anyOf: uniqueByJson };
}

function schemaOf(value, depth) {
  if (depth > MAX_DEPTH) return {};
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    if (!value.length) return { type: "array", items: {} };
    return { type: "array", items: mergeSchemas(value.map((item) => schemaOf(item, depth + 1))) };
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return { type: "object", properties: {} };
    const properties = {};
    for (const key of keys) properties[key] = schemaOf(value[key], depth + 1);
    return { type: "object", properties, required: keys };
  }
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  return {};
}

/**
 * @returns {{ok: true, value: string} | {ok: false, error: string}}
 */
export function jsonToJsonSchema(value, title = "Root", draft = "2020-12") {
  try {
    const schema = {
      $schema:
        draft === "07"
          ? "http://json-schema.org/draft-07/schema#"
          : "https://json-schema.org/draft/2020-12/schema",
      title: String(title || "Root"),
      ...schemaOf(value, 0),
    };
    return { ok: true, value: JSON.stringify(schema, null, 2) };
  } catch (err) {
    return { ok: false, error: `生成 JSON Schema 失败：${err.message}` };
  }
}
