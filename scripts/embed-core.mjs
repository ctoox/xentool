/**
 * Embeds src/toolkit-core/*.js into a single module the Worker can serve.
 *
 * Why this exists: the toolkit core is plain ESM, but the browser tools ship
 * as an inline script with no bundler, so the Worker has to hand the browser
 * the source text. Workers cannot read files at runtime, so the text has to be
 * in the bundle — and it must be the *same* text the tests import, or the two
 * copies drift apart silently.
 *
 * Committed output + a freshness test (test/toolkit-core.test.mjs) is the
 * trade-off: a generated file in git, but no build step at deploy time and no
 * chance of shipping code the tests never saw.
 *
 *   node scripts/embed-core.mjs          # regenerate
 *   node scripts/embed-core.mjs --check  # exit 1 when stale
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.join(import.meta.dirname, "..", "src", "toolkit-core");
const outFile = path.join(import.meta.dirname, "..", "src", "toolkit-core-sources.js");

// index.js is a barrel of re-exports; browser code imports the modules it needs
// directly, so the barrel has nothing to serve. LICENSE-NOTICE is not code.
const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".js") && name !== "index.js")
  .sort();

const sources = {};
for (const name of files) sources[name] = fs.readFileSync(path.join(dir, name), "utf8");

const hash = crypto
  .createHash("sha256")
  .update(files.map((name) => `${name}\n${sources[name]}`).join("\n"))
  .digest("hex")
  .slice(0, 16);

const body = `/**
 * GENERATED FILE — do not edit.
 * Source: src/toolkit-core/*.js via \`node scripts/embed-core.mjs\`.
 * Hash: ${hash}
 */
export const CORE_HASH = ${JSON.stringify(hash)};

export const CORE_SOURCES = ${JSON.stringify(sources, null, 2)};
`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "";
  if (current !== body) {
    console.error("src/toolkit-core-sources.js is stale — run: npm run embed");
    process.exit(1);
  }
  console.log(`toolkit-core sources up to date (${files.length} modules, ${hash})`);
} else {
  fs.writeFileSync(outFile, body);
  console.log(`embedded ${files.length} modules → src/toolkit-core-sources.js (${hash})`);
}
