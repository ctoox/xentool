/*
 * Ported from it-toolbox packages/core/encoding.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
function encodeBase64(input) {
  try {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return { ok: true, value: btoa(binary) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function decodeBase64(input) {
  try {
    const binary = atob(input.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch {
    return { ok: false, error: "Invalid Base64 string" };
  }
}
function encodeBase64Url(input) {
  const result = encodeBase64(input);
  if (!result.ok) return result;
  return { ok: true, value: result.value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") };
}
function decodeBase64Url(input) {
  try {
    let str = input.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    return decodeBase64(str);
  } catch {
    return { ok: false, error: "Invalid Base64URL string" };
  }
}
function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(",")[1];
      resolve({ ok: true, value: base64 });
    };
    reader.onerror = () => resolve({ ok: false, error: "Failed to read file" });
    reader.readAsDataURL(file);
  });
}
function encodeUrl(input) {
  try {
    return { ok: true, value: encodeURIComponent(input) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function decodeUrl(input) {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return { ok: false, error: "Invalid URL encoded string" };
  }
}
function encodeUrlFull(input) {
  try {
    return { ok: true, value: encodeURI(input) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function decodeUrlFull(input) {
  try {
    return { ok: true, value: decodeURI(input) };
  } catch {
    return { ok: false, error: "Invalid URL encoded string" };
  }
}
const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "\xA9": "&copy;",
  "\xAE": "&reg;",
  "\u2122": "&trade;",
  "\u20AC": "&euro;",
  "\xA3": "&pound;",
  "\xA5": "&yen;",
  "\xA2": "&cent;",
  "\xA7": "&sect;",
  "\xB6": "&para;",
  "\xB0": "&deg;",
  "\xB1": "&plusmn;",
  "\xD7": "&times;",
  "\xF7": "&divide;",
  "\xBD": "&frac12;",
  "\xBC": "&frac14;",
  "\xBE": "&frac34;",
  "\u2190": "&larr;",
  "\u2192": "&rarr;",
  "\u2191": "&uarr;",
  "\u2193": "&darr;",
  "\u2194": "&harr;",
  "\u21D0": "&lArr;",
  "\u21D2": "&rArr;",
  "\u21D1": "&uArr;",
  "\u21D3": "&dArr;",
  "\u21D4": "&hArr;",
  "\u2660": "&spades;",
  "\u2663": "&clubs;",
  "\u2665": "&hearts;",
  "\u2666": "&diams;",
  "\u03B1": "&alpha;",
  "\u03B2": "&beta;",
  "\u03B3": "&gamma;",
  "\u03B4": "&delta;",
  "\u03B5": "&epsilon;",
  "\u03C0": "&pi;",
  "\u03C3": "&sigma;",
  "\u03C9": "&omega;",
  "\u221E": "&infin;",
  "\u221A": "&radic;",
  "\u2211": "&sum;",
  "\u220F": "&prod;",
  "\u222B": "&int;",
  "\u2248": "&asymp;",
  "\u2260": "&ne;",
  "\u2264": "&le;",
  "\u2265": "&ge;"
};
const HTML_ENTITIES_REVERSE = Object.fromEntries(
  Object.entries(HTML_ENTITIES).map(([k, v]) => [v, k])
);
function encodeHtmlEntities(input) {
  try {
    let result = input.replace(/&/g, "&amp;");
    const rest = Object.entries(HTML_ENTITIES).filter(([char]) => char !== "&");
    for (const [char, entity] of rest) {
      result = result.split(char).join(entity);
    }
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function decodeHtmlEntities(input) {
  try {
    let result = input;
    for (const [entity, char] of Object.entries(HTML_ENTITIES_REVERSE)) {
      result = result.split(entity).join(char);
    }
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function encodeHex(input, separator = "") {
  try {
    const bytes = new TextEncoder().encode(input);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
    return { ok: true, value: hex.join(separator) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function decodeHex(input) {
  try {
    const clean = input.replace(/[\s:,-]/g, "");
    if (clean.length % 2 !== 0) {
      return { ok: false, error: "Hex string must have even length" };
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function textToUnicode(input) {
  try {
    const codePoints = [];
    const uEscapes = [];
    const uBraces = [];
    const htmlEntities = [];
    const cssEscapes = [];
    for (const char of input) {
      const code = char.codePointAt(0);
      codePoints.push({
        char,
        code: `U+${code.toString(16).toUpperCase().padStart(4, "0")}`,
        name: getUnicodeName(code)
      });
      uEscapes.push(`\\u${code.toString(16).padStart(4, "0")}`);
      uBraces.push(`\\u{${code.toString(16)}}`);
      htmlEntities.push(`&#${code};`);
      cssEscapes.push(`\\${code.toString(16)}`);
    }
    return {
      ok: true,
      value: {
        codePoints,
        formats: {
          uEscape: uEscapes.join(""),
          uBrace: uBraces.join(""),
          htmlEntity: htmlEntities.join(""),
          cssEscape: cssEscapes.join("")
        }
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function unicodeToText(input) {
  try {
    let result = input;
    result = result.replace(
      /\\u\{([0-9a-fA-F]+)\}/g,
      (_, code) => String.fromCodePoint(parseInt(code, 16))
    );
    result = result.replace(
      /\\u([0-9a-fA-F]{4})/g,
      (_, code) => String.fromCharCode(parseInt(code, 16))
    );
    result = result.replace(
      /&#x([0-9a-fA-F]+);/gi,
      (_, code) => String.fromCodePoint(parseInt(code, 16))
    );
    result = result.replace(
      /&#(\d+);/g,
      (_, code) => String.fromCodePoint(parseInt(code, 10))
    );
    result = result.replace(
      /U\+([0-9a-fA-F]+)/gi,
      (_, code) => String.fromCodePoint(parseInt(code, 16))
    );
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function getUnicodeName(code) {
  const names = {
    32: "SPACE",
    33: "EXCLAMATION MARK",
    34: "QUOTATION MARK",
    35: "NUMBER SIGN",
    36: "DOLLAR SIGN",
    37: "PERCENT SIGN",
    38: "AMPERSAND",
    39: "APOSTROPHE",
    40: "LEFT PARENTHESIS",
    41: "RIGHT PARENTHESIS",
    42: "ASTERISK",
    43: "PLUS SIGN",
    44: "COMMA",
    45: "HYPHEN-MINUS",
    46: "FULL STOP",
    47: "SOLIDUS",
    48: "DIGIT ZERO",
    49: "DIGIT ONE",
    50: "DIGIT TWO",
    65: "LATIN CAPITAL LETTER A",
    66: "LATIN CAPITAL LETTER B",
    67: "LATIN CAPITAL LETTER C",
    97: "LATIN SMALL LETTER A",
    98: "LATIN SMALL LETTER B",
    99: "LATIN SMALL LETTER C",
    19968: "CJK UNIFIED IDEOGRAPH-4E00",
    20013: "CJK UNIFIED IDEOGRAPH-4E2D",
    22269: "CJK UNIFIED IDEOGRAPH-56FD"
  };
  return names[code] || `CODE POINT ${code}`;
}
const MORSE_CODE = {
  "A": ".-",
  "B": "-...",
  "C": "-.-.",
  "D": "-..",
  "E": ".",
  "F": "..-.",
  "G": "--.",
  "H": "....",
  "I": "..",
  "J": ".---",
  "K": "-.-",
  "L": ".-..",
  "M": "--",
  "N": "-.",
  "O": "---",
  "P": ".--.",
  "Q": "--.-",
  "R": ".-.",
  "S": "...",
  "T": "-",
  "U": "..-",
  "V": "...-",
  "W": ".--",
  "X": "-..-",
  "Y": "-.--",
  "Z": "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "'": ".----.",
  "!": "-.-.--",
  "/": "-..-.",
  "(": "-.--.",
  ")": "-.--.-",
  "&": ".-...",
  ":": "---...",
  ";": "-.-.-.",
  "=": "-...-",
  "+": ".-.-.",
  "-": "-....-",
  "_": "..--.-",
  '"': ".-..-.",
  "$": "...-..-",
  "@": ".--.-."
};
const MORSE_CODE_REVERSE = Object.fromEntries(
  Object.entries(MORSE_CODE).map(([k, v]) => [v, k])
);
function textToMorse(input) {
  try {
    const chars = input.toUpperCase().split("");
    const result = chars.map((char) => {
      if (char === " ") return "/";
      return MORSE_CODE[char] || char;
    });
    return { ok: true, value: result.join(" ") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function morseToText(input) {
  try {
    const words = input.split(" / ");
    const result = words.map((word) => {
      const letters = word.split(" ");
      return letters.map((code) => MORSE_CODE_REVERSE[code] || code).join("");
    });
    return { ok: true, value: result.join(" ") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function textToBinary(input, separator = " ") {
  try {
    const bytes = new TextEncoder().encode(input);
    const binary = Array.from(bytes).map((b) => b.toString(2).padStart(8, "0"));
    return { ok: true, value: binary.join(separator) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function binaryToText(input) {
  try {
    const clean = input.replace(/[^01]/g, "");
    if (clean.length % 8 !== 0) {
      return { ok: false, error: "Binary string length must be multiple of 8" };
    }
    const bytes = new Uint8Array(clean.length / 8);
    for (let i = 0; i < clean.length; i += 8) {
      bytes[i / 8] = parseInt(clean.slice(i, i + 8), 2);
    }
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function rot13(input) {
  return caesarCipher(input, 13);
}
function caesarCipher(input, shift) {
  try {
    const result = input.split("").map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        return String.fromCharCode((code - 65 + shift + 26) % 26 + 65);
      }
      if (code >= 97 && code <= 122) {
        return String.fromCharCode((code - 97 + shift + 26) % 26 + 97);
      }
      return char;
    });
    return { ok: true, value: result.join("") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function getAsciiTable() {
  const table = [];
  const descriptions = {
    0: "NULL",
    1: "SOH",
    2: "STX",
    3: "ETX",
    4: "EOT",
    5: "ENQ",
    6: "ACK",
    7: "BEL",
    8: "BS",
    9: "HT",
    10: "LF",
    11: "VT",
    12: "FF",
    13: "CR",
    14: "SO",
    15: "SI",
    16: "DLE",
    17: "DC1",
    18: "DC2",
    19: "DC3",
    20: "DC4",
    21: "NAK",
    22: "SYN",
    23: "ETB",
    24: "CAN",
    25: "EM",
    26: "SUB",
    27: "ESC",
    28: "FS",
    29: "GS",
    30: "RS",
    31: "US",
    32: "Space",
    127: "DEL"
  };
  for (let i = 0; i <= 127; i++) {
    const char = i >= 32 && i !== 127 ? String.fromCharCode(i) : "";
    table.push({
      code: i,
      char,
      description: descriptions[i] || "",
      htmlEntity: i < 32 ? "" : `&#${i};`,
      hex: `0x${i.toString(16).toUpperCase().padStart(2, "0")}`
    });
  }
  return table;
}
function searchAscii(query) {
  const table = getAsciiTable();
  const q = query.toLowerCase();
  return table.filter(
    (entry) => entry.char.includes(query) || entry.description.toLowerCase().includes(q) || entry.code.toString() === query || entry.hex.toLowerCase() === q
  );
}
export {
  binaryToText,
  caesarCipher,
  decodeBase64,
  decodeBase64Url,
  decodeHex,
  decodeHtmlEntities,
  decodeUrl,
  decodeUrlFull,
  encodeBase64,
  encodeBase64Url,
  encodeHex,
  encodeHtmlEntities,
  encodeUrl,
  encodeUrlFull,
  fileToBase64,
  getAsciiTable,
  morseToText,
  rot13,
  searchAscii,
  textToBinary,
  textToMorse,
  textToUnicode,
  unicodeToText
};
