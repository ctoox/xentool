import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Guard against backticks inside String.raw template blocks.
 *
 * The design system ships its CSS as String.raw`...`, and the tool pages embed
 * their client scripts the same way. A backtick anywhere in one of those
 * blocks — including inside a comment — closes the template early and the rest
 * of the stylesheet is parsed as JavaScript. The build then fails with
 * something like `Expected ";" but found "pointer"`, which points at the CSS
 * rather than at the stray backtick that caused it. That cost two debugging
 * cycles, so it is now checked mechanically.
 *
 * The check is a syntax parse, not a text scan. A scanner has to guess where
 * a template ends, and these templates contain `${...}` interpolation, so it
 * guesses wrong: the first version of this test passed while the bug was
 * still in the tree.
 */

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const BACKTICK = String.fromCharCode(96);

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...jsFiles(path));
    else if (entry.endsWith(".js") || entry.endsWith(".mjs")) out.push(path);
  }
  return out;
}

const TARGETS = [
  ...jsFiles(join(ROOT, "packages", "ui")),
  ...jsFiles(join(ROOT, "src")),
  ...jsFiles(join(ROOT, "tools")),
  // The probes embed whole page scripts in String.raw blocks too, and they
  // were outside this guard: a backtick in one of their comments broke the
  // template while this test stayed green, because .mjs was never collected.
  ...jsFiles(join(ROOT, "test")),
];

/** Does this file parse? Returns the parser's first complaint, or null. */
function parseError(path) {
  try {
    execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
    return null;
  } catch (error) {
    return String(error.stderr || error.stdout || error.message);
  }
}

/** Offsets of backticks that sit inside a `//` comment. */
function backticksInLineComments(source) {
  const hits = [];
  source.split("\n").forEach((text, offset) => {
    const marker = text.indexOf("//");
    if (marker === -1) return;
    const comment = text.slice(marker);
    let index = comment.indexOf(BACKTICK);
    while (index !== -1) {
      hits.push({ line: offset + 1, column: marker + index, text: comment.trim().slice(0, 70) });
      index = comment.indexOf(BACKTICK, index + 1);
    }
  });
  return hits;
}

test("every source file parses as valid JavaScript", () => {
  const broken = [];
  for (const path of TARGETS) {
    const error = parseError(path);
    if (!error) continue;
    const detail = error
      .split("\n")
      .filter((line) => line.includes("Error") || line.includes("^"))
      .slice(0, 2)
      .join(" | ")
      .trim();
    broken.push(`${path.replace(ROOT, "")}: ${detail}`);
  }
  assert.deepEqual(broken, [], "a stray backtick inside a String.raw block truncates the template");
});

test("no comment backtick is what breaks the build", () => {
  // The parse check above catches the damage but only says the file is broken.
  // This names the cause: for each file that fails to parse, try replacing
  // each backtick found in a line comment and see which one makes it parse
  // again. The parser is the judge, so interpolation cannot mislead us.
  const culprits = [];
  const scratch = mkdtempSync(join(tmpdir(), "xentool-raw-"));
  try {
    for (const path of TARGETS) {
      if (!parseError(path)) continue;
      const source = readFileSync(path, "utf8");
      const lines = source.split("\n");
      for (const hit of backticksInLineComments(source)) {
        const patched = lines.slice();
        patched[hit.line - 1] = patched[hit.line - 1].replace(BACKTICK, "'");
        const candidate = join(scratch, "candidate.js");
        writeFileSync(candidate, patched.join("\n"), "utf8");
        if (!parseError(candidate)) {
          culprits.push(`${path.replace(ROOT, "")}:${hit.line} — ${hit.text}`);
        }
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  assert.deepEqual(culprits, [], "a backtick in a comment closes the String.raw block around it");
});

test("the design system actually ships its stylesheet through String.raw", () => {
  // Without this, the checks above would pass vacuously if the stylesheet ever
  // moved out of a raw template — and then the trap would be unguarded.
  const theme = readFileSync(join(ROOT, "packages", "ui", "theme.js"), "utf8");
  assert.ok(theme.includes("String.raw"), "theme.js should define its CSS in a String.raw block");
  assert.ok(theme.includes(".x-tool-card"), "theme.js should define the tool card component");
});
