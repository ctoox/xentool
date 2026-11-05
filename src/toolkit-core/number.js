/*
 * Ported from it-toolbox packages/core/number.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
function convertNumberBase(input, fromBase) {
  try {
    const decimal = parseInt(input, fromBase);
    if (isNaN(decimal)) {
      return { ok: false, error: "Invalid number for the given base" };
    }
    return {
      ok: true,
      value: {
        binary: decimal.toString(2),
        octal: decimal.toString(8),
        decimal: decimal.toString(10),
        hexadecimal: decimal.toString(16).toUpperCase()
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function convertBase(input, fromBase, toBase) {
  try {
    const decimal = parseInt(input, fromBase);
    if (isNaN(decimal)) {
      return { ok: false, error: "Invalid number for the given base" };
    }
    return { ok: true, value: decimal.toString(toBase).toUpperCase() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
const ROMAN_TABLE = [
  ["M", 1e3],
  ["CM", 900],
  ["D", 500],
  ["CD", 400],
  ["C", 100],
  ["XC", 90],
  ["L", 50],
  ["XL", 40],
  ["X", 10],
  ["IX", 9],
  ["V", 5],
  ["IV", 4],
  ["I", 1]
];
function toRoman(num) {
  if (!Number.isInteger(num) || num < 1 || num > 3999999) {
    return { ok: false, error: "Number must be an integer between 1 and 3999999" };
  }
  let remaining = num;
  let result = "";
  for (const [symbol, value] of ROMAN_TABLE) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return { ok: true, value: result };
}
function fromRoman(roman) {
  const input = roman.toUpperCase().trim();
  if (!input) return { ok: false, error: "Roman numeral is empty" };
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1e3 };
  let result = 0;
  for (let i = 0; i < input.length; i++) {
    const current = values[input[i]];
    if (!current) return { ok: false, error: `Invalid Roman character: ${input[i]}` };
    const next = values[input[i + 1]];
    result += next && current < next ? -current : current;
  }
  if (result < 1 || result > 3999999) {
    return { ok: false, error: "Roman numeral out of range" };
  }
  const canonical = toRoman(result);
  if (!canonical.ok || canonical.value !== input) {
    return { ok: false, error: "Non-standard Roman numeral" };
  }
  return { ok: true, value: result };
}
export {
  convertBase,
  convertNumberBase,
  fromRoman,
  toRoman
};
