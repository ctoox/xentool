import { readFileSync } from "node:fs";

/**
 * Check the text colours against the WCAG AA floor.
 *
 * The site is dark by design, and dim greys hide on a dark background. The
 * tokens that carry body text all clear 4.5:1 comfortably, but the greys that
 * escaped the token system — placeholders and the empty-console hint — were
 * below it. A placeholder is text the user has to read; it is not decoration.
 *
 * Run with `npm run contrast`. Exits non-zero when a colour is too faint.
 */

const BASE = "#07080c";
const SURFACE = "#101319"; // rgba(255,255,255,.028) over the page background

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

const FLOOR = 4.5;

// Read the palette straight out of the stylesheet so the check cannot drift
// away from the colours the site actually uses.
const theme = readFileSync(new URL("../packages/ui/theme.js", import.meta.url), "utf8");
const token = (name) => {
  const match = theme.match(new RegExp("--" + name + ":([^;]+);"));
  return match ? match[1].trim() : null;
};

const TEXT = [
  ["ink", token("ink"), "正文"],
  ["ink-2", token("ink-2"), "次级正文"],
  ["dim", token("dim"), "弱化文字"],
  ["hint", token("hint"), "占位符/提示"],
  ["cyan", token("cyan"), "强调色"],
];

console.log("颜色        页面背景    表面背景    判定");
const failures = [];
for (const [name, hex, role] of TEXT) {
  if (!hex) {
    console.log(`${name.padEnd(12)} 未在 theme.js 中定义令牌`);
    failures.push(`${name}: 令牌缺失`);
    continue;
  }
  const onPage = contrast(hex, BASE);
  const onSurface = contrast(hex, SURFACE);
  const ok = onPage >= FLOOR;
  console.log(
    `${name.padEnd(12)} ${onPage.toFixed(2).padStart(6)}:1  ${onSurface.toFixed(2).padStart(6)}:1  ${ok ? "✓" : "✗"} ${role}`,
  );
  if (!ok) failures.push(`${name} ${hex} 在页面背景上只有 ${onPage.toFixed(2)}:1（需要 ${FLOOR}:1）`);
}

console.log("");
if (failures.length) {
  console.log("不达标：");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exitCode = 1;
} else {
  console.log(`全部达标（阈值 ${FLOOR}:1）`);
}
