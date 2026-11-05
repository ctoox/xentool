/**
 * Toolkit core — pure functions shared by the browser tools.
 *
 * Ported from it-toolbox (MIT, see ./LICENSE-NOTICE). Every module here runs
 * unchanged in three places: the browser (where the tools ship), the Worker
 * (for anything that needs the same logic server-side), and `node --test`.
 * That only holds as long as these rules are kept:
 *
 *   1. No DOM, no `window`, no imports outside this directory.
 *   2. No npm packages — nipping a dependency here means loosening rule 1.
 *   3. No `node:` builtins. `crypto`, `TextEncoder`, `atob`/`btoa` are globals
 *      in both runtimes and are safe; `Buffer` and `fs` are not.
 *
 * Two exceptions are browser-only and therefore untested in Node:
 *   - `format.js`: formatXml / sanitizeMarkdownHtml need DOMParser
 *   - `encoding.js`: fileToBase64 needs FileReader
 * Everything else is covered by test/toolkit-core.test.mjs.
 *
 * Return convention, inherited from upstream: functions that can fail return
 * `{ ok: true, value }` or `{ ok: false, error }`; everything else returns the
 * value directly. `testRegex` is the one holdout — it returns
 * `{ matches, truncated }` and puts failures in `error`. Check the signature
 * before assuming an envelope.
 */
export * from "./encoding.js";
export * from "./crypto.js";
export * from "./text.js";
export * from "./number.js";
export * from "./format.js";
export * from "./color.js";
export * from "./network.js";
export * from "./datetime.js";
export * from "./generator.js";
export * from "./regex.js";
