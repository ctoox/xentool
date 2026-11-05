/**
 * Tests for the ported toolkit core (src/toolkit-core).
 *
 * These functions are the reusable half of every browser tool: they must not
 * touch the DOM, and they must give the same answer in Node (where the tests
 * run) as in the browser (where they ship). Anything that only works in a
 * browser — formatXml, sanitizeMarkdownHtml, fileToBase64 — is deliberately
 * left out of this file and documented instead.
 */
import test from "node:test";
import assert from "node:assert/strict";

import * as encoding from "../src/toolkit-core/encoding.js";
import * as text from "../src/toolkit-core/text.js";
import * as number from "../src/toolkit-core/number.js";
import * as color from "../src/toolkit-core/color.js";
import * as datetime from "../src/toolkit-core/datetime.js";
import * as network from "../src/toolkit-core/network.js";
import * as generator from "../src/toolkit-core/generator.js";
import * as regex from "../src/toolkit-core/regex.js";
import * as crypto from "../src/toolkit-core/crypto.js";

const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.value;
};

test("base64 round-trips multi-byte text", () => {
  const encoded = ok(encoding.encodeBase64("边缘工具"));
  assert.equal(encoded, "6L6557yY5bel5YW3");
  assert.equal(ok(encoding.decodeBase64(encoded)), "边缘工具");
});

test("base64url output is URL-safe", () => {
  const value = ok(encoding.encodeBase64Url("a+b/c?d"));
  assert.doesNotMatch(value, /[+/=]/);
  assert.equal(ok(encoding.decodeBase64Url(value)), "a+b/c?d");
});

test("url encoding round-trips and keeps reserved characters when asked", () => {
  assert.equal(ok(encoding.encodeUrl("a b&c")), "a%20b%26c");
  assert.equal(ok(encoding.decodeUrl("a%20b%26c")), "a b&c");
  assert.equal(ok(encoding.encodeUrlFull("https://x.test/a b?c=d&e=f")), "https://x.test/a%20b?c=d&e=f");
});

test("hex, binary, morse and rot13 round-trip", () => {
  assert.equal(ok(encoding.encodeHex("Hi")), "4869");
  assert.equal(ok(encoding.decodeHex("48 69")), "Hi");
  assert.equal(ok(encoding.binaryToText(ok(encoding.textToBinary("Hi")))), "Hi");
  assert.equal(ok(encoding.morseToText(ok(encoding.textToMorse("SOS")))), "SOS");
  assert.equal(ok(encoding.rot13("Hello")), "Uryyb");
});

test("html entities cover the characters that break markup", () => {
  const encoded = ok(encoding.encodeHtmlEntities('<a href="x">&</a>'));
  assert.match(encoded, /&lt;a href=&quot;x&quot;&gt;&amp;&lt;\/a&gt;/);
  assert.equal(ok(encoding.decodeHtmlEntities(encoded)), '<a href="x">&</a>');
});

test("naming styles convert between conventions", () => {
  assert.equal(ok(text.convertCase("hello world", "camel")), "helloWorld");
  assert.equal(ok(text.convertCase("helloWorld", "snake")), "hello_world");
  assert.equal(ok(text.convertCase("hello-world", "pascal")), "HelloWorld");
  assert.equal(ok(text.convertCase("hello world", "constant")), "HELLO_WORLD");
});

test("text stats count the things a writer asks about", () => {
  const stats = text.countText("第一行 hello\n\n第二行 world");
  assert.equal(stats.lines, 3);
  assert.equal(stats.words, 4);
  assert.equal(stats.paragraphs, 2);
  assert.equal(stats.characters, "第一行 hello\n\n第二行 world".length);
});

test("escaping survives a round trip through a quoted literal", () => {
  const raw = 'he said "hi"\n\ttab';
  const escaped = ok(text.escapeString(raw, "javascript"));
  assert.equal(ok(text.unescapeString(escaped)), raw);
});

test("edit distance is symmetric and bounded", () => {
  assert.equal(text.levenshteinDistance("kitten", "sitting"), 3);
  assert.equal(text.levenshteinDistance("abc", "abc"), 0);
  const score = text.textSimilarity("hello world", "hello there");
  assert.ok(score > 0 && score < 1, `similarity out of range: ${score}`);
});

test("number bases and roman numerals", () => {
  assert.equal(ok(number.convertBase("255", 10, 16)), "FF");
  assert.equal(ok(number.convertBase("11111111", 2, 10)), "255");
  assert.equal(ok(number.toRoman(1994)), "MCMXCIV");
  assert.equal(ok(number.fromRoman("MCMXCIV")), 1994);
});

test("color conversion agrees across spaces", () => {
  assert.deepEqual(ok(color.parseHex("#22d3ee")), { r: 34, g: 211, b: 238 });
  const hsl = color.rgbToHsl({ r: 255, g: 0, b: 0 });
  assert.equal(hsl.h, 0);
  assert.equal(hsl.s, 100);
  assert.deepEqual(color.hslToRgb(hsl), { r: 255, g: 0, b: 0 });
  assert.equal(color.rgbToHex({ r: 34, g: 211, b: 238 }), "#22d3ee");
});

test("contrast ratio matches the WCAG reference points", () => {
  // The contrast helpers take hex strings, not parsed RGB objects — passing an
  // object silently yields "Invalid foreground color" rather than a number.
  assert.equal(ok(color.getContrastRatio("#000000", "#ffffff")), 21);
  assert.equal(ok(color.getContrastRatio("#ffffff", "#ffffff")), 1);
  const verdict = ok(color.checkContrast("#000000", "#ffffff"));
  assert.equal(verdict.ratio, 21);
  assert.equal(verdict.aaNormal, true);
  assert.equal(verdict.aaaLarge, true);
});

test("timestamps parse seconds and milliseconds without guessing wrong", () => {
  const seconds = ok(datetime.parseTimestamp("1700000000"));
  const millis = ok(datetime.parseTimestamp("1700000000000"));
  assert.equal(seconds.unix, 1700000000);
  assert.equal(millis.unix, 1700000000);
  assert.equal(seconds.iso, "2023-11-14T22:13:20.000Z");
});

test("duration formatting is human, not just arithmetic", () => {
  assert.equal(datetime.formatDuration(3661), "1:01:01");
  assert.equal(datetime.formatDuration(90), "1:30");
});

test("date math crosses month and year boundaries", () => {
  const start = new Date("2026-01-31T00:00:00Z");
  assert.equal(datetime.addMonths(start, 1).getUTCMonth(), 2); // 2026-02-28 → March? clamp
  assert.equal(datetime.addDays(start, 1).toISOString().slice(0, 10), "2026-02-01");
});

test("subnet math matches the address plan", () => {
  const subnet = ok(network.calculateSubnet("192.168.1.10", 24));
  assert.equal(subnet.networkAddress, "192.168.1.0");
  assert.equal(subnet.broadcastAddress, "192.168.1.255");
  assert.equal(subnet.usableHosts, 254);
  assert.equal(subnet.subnetMask, "255.255.255.0");
});

test("url parsing separates every part a debugger needs", () => {
  const parsed = ok(network.parseUrl("https://user:pw@x.test:8443/a/b?q=1&r=2#top"));
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.host, "x.test:8443");
  assert.equal(parsed.pathname, "/a/b");
  assert.equal(parsed.hash, "#top");
});

test("curl conversion produces runnable fetch code", () => {
  const result = ok(network.convertCurl("curl -X POST https://x.test/api -H 'content-type: application/json' -d '{\"a\":1}'"));
  assert.match(result.fetch, /fetch\(/);
  assert.match(result.fetch, /POST/);
  assert.match(result.fetch, /application\/json/);
});

test("regex tester reports positions and rejects invalid patterns", () => {
  // testRegex returns { matches, truncated } and signals failure with an
  // `error` field instead of the usual { ok } envelope.
  const { matches } = regex.testRegex("\\d+", "a1 b22 c333");
  assert.equal(matches.length, 3);
  assert.equal(matches[1].match, "22");
  assert.equal(matches[1].start, 4);
  assert.match(regex.testRegex("(", "x").error, /Invalid regular expression/);
});

test("generators produce correctly shaped identifiers", () => {
  assert.match(generator.generateUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(generator.generateNanoId(12).length, 12);
  assert.match(generator.generateNanoId(21), /^[A-Za-z0-9_-]{21}$/);
  const id = generator.generateUlid();
  assert.equal(id.length, 26);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.match(generator.generateObjectId(), /^[0-9a-f]{24}$/);
});

test("password generation respects the requested alphabet", () => {
  const options = { length: 24, uppercase: true, lowercase: false, numbers: false, symbols: false };
  const password = ok(generator.generatePassword(options));
  assert.equal(password.length, 24);
  assert.match(password, /^[A-Z]+$/);
  assert.equal(generator.generatePassword({ length: 8, uppercase: false, lowercase: false, numbers: false, symbols: false }).ok, false);
});

test("md5 matches the reference digest", async () => {
  assert.equal(ok(await crypto.md5("abc")), "900150983cd24fb0d6963f7d28e17f72");
});

test("jwt parsing splits header, payload and signature", () => {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9." +
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const parsed = ok(crypto.parseJwt(token));
  assert.equal(parsed.header.alg, "HS256");
  assert.equal(parsed.payload.name, "John");
  assert.ok(parsed.signature);
});

test("embedded sources are byte-identical to the files on disk", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { CORE_HASH, CORE_SOURCES } = await import("../src/toolkit-core-sources.js");

  const dir = path.join(import.meta.dirname, "..", "src", "toolkit-core");
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".js") && name !== "index.js")
    .sort();

  assert.deepEqual(Object.keys(CORE_SOURCES).sort(), files);
  for (const name of files) {
    // Same CRLF normalisation as scripts/embed-core.mjs: a Windows checkout
    // must not look stale against a copy embedded on Linux.
    const onDisk = fs
      .readFileSync(path.join(dir, name), "utf8")
      .replace(/\r\n/g, "\n");
    assert.equal(CORE_SOURCES[name], onDisk, `${name} is stale — run: npm run embed`);
  }

  const hash = (await import("node:crypto"))
    .createHash("sha256")
    .update(files.map((name) => `${name}\n${CORE_SOURCES[name]}`).join("\n"))
    .digest("hex")
    .slice(0, 16);
  assert.equal(hash, CORE_HASH);
});

test("/core serves each module as importable JavaScript", async () => {
  const { handleRequest } = await import("../src/index.js");

  const res = await handleRequest(new Request("https://tool.xen.autos/core/color.js"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/javascript/);
  const body = await res.text();
  assert.match(body, /function parseHex/);
  assert.match(body, /export \{/);

  // Prototype keys must not be reachable as module names.
  for (const name of ["constructor", "toString", "__proto__", "nope.js"]) {
    const missing = await handleRequest(new Request(`https://tool.xen.autos/core/${name}`));
    assert.equal(missing.status, 404, `${name} should 404`);
  }
});
