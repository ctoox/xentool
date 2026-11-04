import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The palette must clear the WCAG AA contrast floor for text.
 *
 * The site is dark by design, which is exactly where faint greys slip
 * through. The tokens carrying body text were always fine, but the greys
 * that escaped the token system — placeholders and the empty-console hint —
 * measured 3.5:1 and 2.5:1. A placeholder is text the user has to read.
 *
 * The colours are read out of the stylesheet rather than duplicated here, so
 * this check cannot drift away from the palette the site actually ships.
 */

const FLOOR = 4.5;
const PAGE_BG = "#07080c";
const SURFACE_BG = "#101319";

const theme = readFileSync(new URL("../packages/ui/theme.js", import.meta.url), "utf8");

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((p) => parseInt(p, 16));
}

function luminance(rgb) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg, bg) {
  const a = luminance(hexToRgb(fg));
  const b = luminance(hexToRgb(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function token(name) {
  const match = theme.match(new RegExp("--" + name + ":([^;]+);"));
  return match ? match[1].trim() : null;
}

test("every text colour clears the AA contrast floor", () => {
  const failing = [];
  for (const name of ["ink", "ink-2", "dim", "hint", "cyan"]) {
    const hex = token(name);
    assert.ok(hex, `theme.js should define --${name}`);
    const ratio = contrast(hex, PAGE_BG);
    if (ratio < FLOOR) failing.push(`--${name} (${hex}) is ${ratio.toFixed(2)}:1 on the page background`);
  }
  assert.deepEqual(failing, [], failing.join("; "));
});

test("the faint greys are readable on a raised surface too", () => {
  // A card sits on a slightly lighter panel than the page. Text that clears
  // the floor on the page can still fall short there, because the surface
  // moves the whole contrast pair in the wrong direction.
  const failing = [];
  for (const name of ["dim", "hint"]) {
    const hex = token(name);
    const ratio = contrast(hex, SURFACE_BG);
    if (ratio < FLOOR) failing.push(`--${name} (${hex}) is ${ratio.toFixed(2)}:1 on a raised surface`);
  }
  assert.deepEqual(failing, [], failing.join("; "));
});

test("no hard-coded faint grey is left outside the token system", () => {
  // The greys that caused the problem were literals in the stylesheet. Catch
  // any new one so the palette stays the single source of truth.
  //
  // Only colour declarations count. A background on a decorative dot is not
  // text and has no contrast floor to clear.
  const faint = ["#5b6070", "#5f6678", "#4b5162"];
  const offenders = [];
  for (const file of ["packages/ui/theme.js", "src/portal-page.js", "src/tools-page.js"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const hex of faint) {
      const pattern = new RegExp("color\\s*:\\s*" + hex, "g");
      if (pattern.test(source)) offenders.push(`${file} still hard-codes the text colour ${hex}`);
    }
  }
  assert.deepEqual(offenders, []);
});
