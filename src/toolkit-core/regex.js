/*
 * Ported from it-toolbox packages/core/regex.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
const MAX_REGEX_MATCHES = 2e3;
function testRegex(pattern, input, flags = "g") {
  try {
    const regex = new RegExp(pattern, flags);
    const matches = [];
    let truncated = false;
    if (flags.includes("g")) {
      let match;
      while ((match = regex.exec(input)) !== null) {
        matches.push({
          match: match[0],
          start: match.index,
          end: match.index + match[0].length,
          groups: match.groups || null
        });
        if (matches.length >= MAX_REGEX_MATCHES) {
          truncated = true;
          break;
        }
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } else {
      const match = regex.exec(input);
      if (match) {
        matches.push({
          match: match[0],
          start: match.index,
          end: match.index + match[0].length,
          groups: match.groups || null
        });
      }
    }
    return { matches, truncated };
  } catch (e) {
    return { matches: [], error: e.message };
  }
}
export {
  testRegex
};
