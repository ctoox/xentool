import test from "node:test";
import assert from "node:assert/strict";

import { parseYaml, stringifyYaml, yamlToJson, jsonToYaml } from "../src/toolkit-core/yaml.js";
import { parseToml, tomlToJson } from "../src/toolkit-core/toml.js";
import { parseCsv, csvToJson, jsonToCsv } from "../src/toolkit-core/csv.js";
import { queryJsonPath } from "../src/toolkit-core/jsonpath.js";
import { jsonToTypeScript, jsonToJsonSchema } from "../src/toolkit-core/schema.js";
import { formatSql } from "../src/toolkit-core/sqlfmt.js";

const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.value;
};

/* ------------------------------- YAML ------------------------------- */

test("yaml parses a realistic config with nesting, flow and block scalars", () => {
  const value = ok(
    parseYaml(
      [
        "# 注释不进入结果",
        "name: xentool",
        "version: 2",
        "enabled: true",
        "empty:",
        "tags: [a, b, 'c d']",
        "limits: { cpu: 2, mem: 512 }",
        "server:",
        "  host: 0.0.0.0",
        "  ports:",
        "    - 80",
        "    - 443",
        "script: |",
        "  echo hello",
        "  echo world",
        "note: >",
        "  folded",
        "  text",
        "registry: \"http://localhost:5000\"",
      ].join("\n"),
    ),
  );

  assert.equal(value.name, "xentool");
  assert.equal(value.version, 2);
  assert.equal(value.enabled, true);
  assert.equal(value.empty, null);
  assert.deepEqual(value.tags, ["a", "b", "c d"]);
  assert.deepEqual(value.limits, { cpu: 2, mem: 512 });
  assert.deepEqual(value.server, { host: "0.0.0.0", ports: [80, 443] });
  assert.equal(value.script, "echo hello\necho world\n");
  assert.equal(value.note, "folded text\n");
  assert.equal(value.registry, "http://localhost:5000");
});

test("yaml sequences of mappings keep their nested blocks attached", () => {
  const value = ok(
    parseYaml(
      ["workers:", "  - name: api", "    routes:", "      - /api/*", "    replicas: 2", "  - name: web", "    replicas: 1"].join(
        "\n",
      ),
    ),
  );

  assert.deepEqual(value.workers, [
    { name: "api", routes: ["/api/*"], replicas: 2 },
    { name: "web", replicas: 1 },
  ]);
});

test("yaml supports a sequence at the same indent as its key", () => {
  const value = ok(parseYaml("ports:\n- 80\n- 443"));
  assert.deepEqual(value.ports, [80, 443]);
});

test("yaml reads multiple documents as an array", () => {
  const result = parseYaml("---\na: 1\n---\nb: 2\n");
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, [{ a: 1 }, { b: 2 }]);
});

test("yaml rejects features it does not implement instead of guessing", () => {
  const anchored = parseYaml("base: &b\n  a: 1");
  assert.equal(anchored.ok, false);
  assert.match(anchored.error, /锚点/);

  const alias = parseYaml("copy: *b");
  assert.equal(alias.ok, false);
  assert.match(alias.error, /别名/);
});

test("yaml serializer round-trips the parsed value", () => {
  const original = {
    name: "xentool",
    version: 2,
    tags: ["a", "b"],
    nested: { deep: { value: "x", flag: false } },
    list: [{ id: 1 }, { id: 2, extra: "y" }],
    text: "line one\nline two\n",
    quoted: "true",
    colon: "a: b",
  };

  const text = stringifyYaml(original);
  const back = ok(parseYaml(text));
  assert.deepEqual(back, original);
});

test("yaml to json reports parse errors with a line number", () => {
  const result = yamlToJson("a: 1\n  b: 2");
  assert.equal(result.ok, false);
  assert.match(result.error, /第 2 行/);
});

test("json to yaml rejects malformed JSON", () => {
  const result = jsonToYaml("{ nope");
  assert.equal(result.ok, false);
  assert.match(result.error, /JSON/);
});

/* ------------------------------- TOML ------------------------------- */

test("toml parses tables, dotted keys and arrays of tables", () => {
  const value = ok(
    parseToml(
      [
        'title = "xentool"',
        "owner.name = 'Tom'",
        "enabled = true",
        "ratio = 0.85",
        "hex = 0xff",
        "",
        "[server]",
        "host = '127.0.0.1'",
        "ports = [ 8000, 8001, ]",
        "settings = { timeout = 30, retries = 3 }",
        "",
        "[[products]]",
        "name = 'Hammer'",
        "",
        "[[products]]",
        "name = 'Nail'",
        "",
        "[products.dims]",
        "w = 1.5",
      ].join("\n"),
    ),
  );

  assert.equal(value.title, "xentool");
  assert.deepEqual(value.owner, { name: "Tom" });
  assert.equal(value.enabled, true);
  assert.equal(value.ratio, 0.85);
  assert.equal(value.hex, 255);
  assert.deepEqual(value.server.ports, [8000, 8001]);
  assert.deepEqual(value.server.settings, { timeout: 30, retries: 3 });
  assert.equal(value.products.length, 2);
  assert.deepEqual(value.products[1], { name: "Nail", dims: { w: 1.5 } });
});

test("toml keeps dates as strings so the output does not shift by timezone", () => {
  const value = ok(parseToml("dob = 1979-05-27T07:32:00Z\nday = 2024-01-01"));
  assert.equal(value.dob, "1979-05-27T07:32:00Z");
  assert.equal(value.day, "2024-01-01");
});

test("toml handles multi-line strings and escapes", () => {
  const value = ok(
    parseToml(['multi = """', "line one", 'line two"""', "literal = 'C:\\path'", 'escaped = "a\\tb"'].join("\n")),
  );
  assert.equal(value.multi, "line one\nline two");
  assert.equal(value.literal, "C:\\path");
  assert.equal(value.escaped, "a\tb");
});

test("toml reports the line of a syntax error", () => {
  const result = parseToml("a = 1\nb = ");
  assert.equal(result.ok, false);
  assert.match(result.error, /第 2 行/);
});

test("toml rejects a table declared twice", () => {
  const result = parseToml("[a]\nb = 1\n[a]\nc = 2");
  assert.equal(result.ok, false);
  assert.match(result.error, /重复定义/);
});

test("toml to json emits JSON", () => {
  assert.equal(ok(tomlToJson("a = 1")), '{\n  "a": 1\n}');
});

/* -------------------------------- CSV ------------------------------- */

test("csv follows RFC 4180: quoted commas, doubled quotes and embedded newlines", () => {
  const parsed = ok(
    parseCsv('name,role,note\r\n"Ada, L",admin,"say ""hi"""\r\nBob,dev,"line1\nline2"\r\n'),
  );
  assert.deepEqual(parsed.rows, [
    ["name", "role", "note"],
    ["Ada, L", "admin", 'say "hi"'],
    ["Bob", "dev", "line1\nline2"],
  ]);
  assert.equal(parsed.delimiter, ",");
});

test("csv sniffs semicolon and tab delimiters", () => {
  assert.equal(ok(parseCsv("a;b\n1;2")).delimiter, ";");
  assert.equal(ok(parseCsv("a\tb\n1\t2")).delimiter, "\t");
});

test("csv keeps values as strings so leading zeros survive", () => {
  const rows = ok(csvToJson("id,code\n1,007"));
  assert.deepEqual(rows, [{ id: "1", code: "007" }]);
});

test("csv fills short rows with empty strings and de-duplicates headers", () => {
  const parsed = csvToJson("a,a\n1");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.columns, ["a", "a_2"]);
  assert.deepEqual(parsed.value, [{ a: "1", a_2: "" }]);
});

test("json to csv quotes only the cells that need it", () => {
  const text = ok(
    jsonToCsv([
      { name: "Ada, L", note: 'say "hi"' },
      { name: "Bob", note: "plain" },
    ]),
  );
  assert.equal(text, 'name,note\r\n"Ada, L","say ""hi"""\r\nBob,plain\r\n');
});

test("csv round-trips through JSON", () => {
  const rows = [{ a: "1", b: "x,y" }, { a: "2", b: "" }];
  const text = ok(jsonToCsv(rows));
  assert.deepEqual(ok(csvToJson(text)), rows);
});

test("csv rejects an unterminated quote instead of guessing", () => {
  const result = parseCsv('a,b\n"oops');
  assert.equal(result.ok, false);
  assert.match(result.error, /引号/);
});

/* ----------------------------- JSONPath ----------------------------- */

const DOC = {
  store: {
    book: [
      { title: "A", author: "X", price: 8.95 },
      { title: "B", author: "Y", price: 12.99 },
      { title: "C", author: "Z", price: 22.99 },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
};

test("jsonpath selects children, wildcards and indices", () => {
  assert.deepEqual(ok(queryJsonPath(DOC, "$.store.book[*].author")).matches.map((m) => m.value), ["X", "Y", "Z"]);
  assert.deepEqual(ok(queryJsonPath(DOC, "$.store.book[0,1]")).matches.map((m) => m.value.title), ["A", "B"]);
  assert.deepEqual(ok(queryJsonPath(DOC, "$.store.book[-1:]")).matches.map((m) => m.value.title), ["C"]);
});

test("jsonpath recursive descent reports each match exactly once", () => {
  const prices = ok(queryJsonPath(DOC, "$..price")).matches;
  assert.deepEqual(prices.map((m) => m.value), [8.95, 12.99, 22.99, 19.95]);
  assert.deepEqual(prices.map((m) => m.path), [
    "$.store.book[0].price",
    "$.store.book[1].price",
    "$.store.book[2].price",
    "$.store.bicycle.price",
  ]);
});

test("jsonpath filters compare numbers, strings and regexes", () => {
  const cheap = ok(queryJsonPath(DOC, "$.store.book[?(@.price < 10)]")).matches;
  assert.deepEqual(cheap.map((m) => m.value.title), ["A"]);

  const named = ok(queryJsonPath(DOC, '$.store.book[?(@.price > 10 && @.author == "Y")]')).matches;
  assert.deepEqual(named.map((m) => m.value.title), ["B"]);

  const regex = ok(queryJsonPath(DOC, "$..book[?(@.title =~ /B|C/)]")).matches;
  assert.deepEqual(regex.map((m) => m.value.title), ["B", "C"]);
});

test("jsonpath returns no matches instead of throwing on a valid miss", () => {
  const result = queryJsonPath(DOC, "$.store.nope");
  assert.equal(result.ok, true);
  assert.equal(result.value.count, 0);
});

test("jsonpath reports malformed paths", () => {
  const result = queryJsonPath(DOC, "$.a[b");
  assert.equal(result.ok, false);
  assert.match(result.error, /方括号|路径/);
});

/* -------------------------- TypeScript / Schema ---------------------- */

const SAMPLE = {
  id: 1,
  name: "Ada",
  tags: ["a"],
  address: { city: "X" },
  orders: [{ sku: "A1", qty: 2 }, { sku: "B2", qty: 1, note: "gift" }],
};

test("json to typescript generates interfaces and marks missing fields optional", () => {
  const text = ok(jsonToTypeScript(SAMPLE, "User"));
  assert.match(text, /export interface Address \{/);
  assert.match(text, /export interface Order \{/);
  assert.match(text, /note\?: string;/);
  assert.match(text, /orders: Order\[\];/);
  assert.match(text, /id: number;/);
});

test("json to typescript turns mixed arrays into a union", () => {
  const text = ok(jsonToTypeScript({ misc: [1, "x", true] }, "Root"));
  assert.match(text, /misc: \(number \| string \| boolean\)\[\];/);
});

test("json schema marks every root key required and infers integer vs number", () => {
  const schema = JSON.parse(ok(jsonToJsonSchema(SAMPLE, "User")));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.title, "User");
  assert.equal(schema.properties.id.type, "integer");
  assert.deepEqual(schema.required, ["id", "name", "tags", "address", "orders"]);
  assert.equal(schema.properties.orders.items.properties.qty.type, "integer");
});

test("json schema can emit draft-07", () => {
  const schema = JSON.parse(ok(jsonToJsonSchema({ a: 1 }, "Root", "07")));
  assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
});

/* -------------------------------- SQL ------------------------------- */

test("sql puts clauses on their own lines and upper-cases keywords", () => {
  const text = ok(
    formatSql(
      "select u.id, count(o.id) as orders from users u left join orders o on o.user_id = u.id where u.age > 18 and u.active = true order by orders desc limit 10;",
    ),
  );

  const lines = text.split("\n");
  assert.equal(lines[0], "SELECT u.id, count(o.id) AS orders");
  assert.equal(lines[1], "FROM users u");
  assert.equal(lines[2], "LEFT JOIN orders o ON o.user_id = u.id");
  assert.equal(lines[3], "WHERE u.age > 18");
  assert.equal(lines[4], "  AND u.active = true");
  assert.match(text, /ORDER BY orders DESC/);
  assert.match(text, /LIMIT 10;/);
});

test("sql leaves strings and quoted identifiers untouched", () => {
  const text = ok(formatSql('select "Mixed Case", \'select * from x\' from t'));
  assert.match(text, /"Mixed Case"/);
  assert.match(text, /'select \* from x'/);
});

test("sql indents a subquery and keeps the alias on the closing paren", () => {
  const text = ok(formatSql("select * from (select id from t where a = 1) x"));
  assert.match(text, /\n  SELECT id\n  FROM t\n  WHERE a = 1\n\) x/);
});

test("sql can keep the original keyword case", () => {
  const text = ok(formatSql("select a from t", { uppercase: false }));
  assert.equal(text.split("\n")[0], "select a");
});

test("sql reports an unterminated string", () => {
  const result = formatSql("select 'abc");
  assert.equal(result.ok, false);
  assert.match(result.error, /引号/);
});
