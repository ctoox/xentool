/*
 * Ported from it-toolbox packages/core/generator.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
/*
 * Local NanoID/ULID instead of the upstream npm packages.
 *
 * The upstream module pulls `nanoid` and `ulid` as runtime dependencies; this
 * project ships a zero-build Worker with no bundler, so both are inlined here.
 * Both use crypto.getRandomValues, so they keep the "nothing leaves the device"
 * guarantee. NanoID's 64-character alphabet is a power of two, which makes the
 * mask step a plain `& 63` with no rejection sampling.
 */
const NANOID_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function nanoid(size = 21) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = "";
  for (let i = 0; i < size; i++) id += NANOID_ALPHABET[bytes[i] & 63];
  return id;
}

/*
 * ULID = 10 chars of millisecond timestamp + 16 chars of randomness, both in
 * Crockford base32. 10 random bytes are exactly 80 bits, so the 16 trailing
 * characters never need padding. Not monotonic within a single millisecond —
 * enough for ID generation, not for ordering.
 */
function ulid(now = Date.now()) {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ULID_ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let buffer = 0;
  let bits = 0;
  let rand = "";
  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      rand += ULID_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return time + rand;
}

function generateUUID() {
  return crypto.randomUUID();
}
function generateUUIDs(count, options) {
  const max = Math.min(count, 1e3);
  return Array.from({ length: max }, () => {
    let uuid = crypto.randomUUID();
    if (options?.noHyphens) uuid = uuid.replace(/-/g, "");
    if (options?.uppercase) uuid = uuid.toUpperCase();
    return uuid;
  });
}
function generateNanoId(size = 21) {
  return nanoid(size);
}
function generateNanoIds(count, size = 21) {
  return Array.from({ length: count }, () => nanoid(size));
}
function generateUlid() {
  return ulid();
}
function generateUlids(count) {
  return Array.from({ length: count }, () => ulid());
}
function generateObjectId() {
  const timestamp = Math.floor(Date.now() / 1e3).toString(16).padStart(8, "0");
  const machineId = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  const processId = Math.floor(Math.random() * 65535).toString(16).padStart(4, "0");
  const counter = Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
  return timestamp + machineId + processId + counter;
}
function parseObjectId(id) {
  try {
    if (id.length !== 24 || !/^[0-9a-fA-F]+$/.test(id)) {
      return { ok: false, error: "Invalid ObjectId format" };
    }
    const timestamp = parseInt(id.slice(0, 8), 16);
    return {
      ok: true,
      value: {
        id,
        timestamp: new Date(timestamp * 1e3),
        machineId: id.slice(8, 14),
        processId: id.slice(14, 18),
        counter: parseInt(id.slice(18, 24), 16)
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function generatePassword(opts) {
  let upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let lower = "abcdefghijklmnopqrstuvwxyz";
  let numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  if (opts.excludeSimilar) {
    upper = upper.replace(/[OI]/g, "");
    lower = lower.replace(/[il]/g, "");
    numbers = numbers.replace(/[01]/g, "");
  }
  const chars = [
    opts.uppercase ? upper : "",
    opts.lowercase ? lower : "",
    opts.numbers ? numbers : "",
    opts.symbols ? symbols : ""
  ].join("");
  if (!chars) return { ok: false, error: "Select at least one character type" };
  const array = new Uint32Array(opts.length);
  crypto.getRandomValues(array);
  const password = Array.from(array, (n) => chars[n % chars.length]).join("");
  return { ok: true, value: password };
}
function generatePasswords(count, opts) {
  const max = Math.min(count, 100);
  const passwords = [];
  for (let i = 0; i < max; i++) {
    const result = generatePassword(opts);
    if (!result.ok) return result;
    passwords.push(result.value);
  }
  return { ok: true, value: passwords };
}
function checkPasswordStrength(password) {
  let score = 0;
  const len = password.length;
  if (len >= 8) score += 1;
  if (len >= 12) score += 1;
  if (len >= 16) score += 1;
  if (len >= 20) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  const combinations = Math.pow(
    (/[a-z]/.test(password) ? 26 : 0) + (/[A-Z]/.test(password) ? 26 : 0) + (/[0-9]/.test(password) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(password) ? 32 : 0),
    len
  );
  const guessesPerSecond = 1e10;
  const seconds = combinations / guessesPerSecond;
  let crackTime;
  if (seconds < 1) crackTime = "\u77AC\u95F4";
  else if (seconds < 60) crackTime = `${Math.round(seconds)} \u79D2`;
  else if (seconds < 3600) crackTime = `${Math.round(seconds / 60)} \u5206\u949F`;
  else if (seconds < 86400) crackTime = `${Math.round(seconds / 3600)} \u5C0F\u65F6`;
  else if (seconds < 2592e3) crackTime = `${Math.round(seconds / 86400)} \u5929`;
  else if (seconds < 31536e3) crackTime = `${Math.round(seconds / 2592e3)} \u6708`;
  else if (seconds < 31536e5) crackTime = `${Math.round(seconds / 31536e3)} \u5E74`;
  else crackTime = "\u6570\u767E\u5E74+";
  const levels = [
    { min: 0, label: "\u975E\u5E38\u5F31", color: "#ef4444" },
    { min: 3, label: "\u5F31", color: "#f97316" },
    { min: 5, label: "\u4E00\u822C", color: "#eab308" },
    { min: 7, label: "\u5F3A", color: "#22c55e" },
    { min: 9, label: "\u975E\u5E38\u5F3A", color: "#10b981" }
  ];
  const level = levels.reverse().find((l) => score >= l.min) || levels[levels.length - 1];
  return { score, label: level.label, color: level.color, crackTime };
}
const LOREM_WORDS = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
  "enim",
  "ad",
  "minim",
  "veniam",
  "quis",
  "nostrud",
  "exercitation",
  "ullamco",
  "laboris",
  "nisi",
  "aliquip",
  "ex",
  "ea",
  "commodo",
  "consequat",
  "duis",
  "aute",
  "irure",
  "in",
  "reprehenderit",
  "voluptate",
  "velit",
  "esse",
  "cillum",
  "fugiat",
  "nulla",
  "pariatur",
  "excepteur",
  "sint",
  "occaecat",
  "cupidatat",
  "non",
  "proident",
  "sunt",
  "culpa",
  "qui",
  "officia",
  "deserunt",
  "mollit",
  "anim",
  "id",
  "est",
  "laborum"
];
const CHINESE_WORDS = [
  "\u7684",
  "\u4E00",
  "\u662F",
  "\u5728",
  "\u4E0D",
  "\u4E86",
  "\u6709",
  "\u548C",
  "\u4EBA",
  "\u8FD9",
  "\u4E2D",
  "\u5927",
  "\u4E3A",
  "\u4E0A",
  "\u4E2A",
  "\u56FD",
  "\u6211",
  "\u4EE5",
  "\u8981",
  "\u4ED6",
  "\u65F6",
  "\u6765",
  "\u7528",
  "\u4EEC",
  "\u751F",
  "\u5230",
  "\u4F5C",
  "\u5730",
  "\u4E8E",
  "\u51FA",
  "\u5C31",
  "\u5206",
  "\u5BF9",
  "\u6210",
  "\u4F1A",
  "\u53EF",
  "\u4E3B",
  "\u53D1",
  "\u5E74",
  "\u52A8",
  "\u540C",
  "\u5DE5",
  "\u4E5F",
  "\u80FD",
  "\u4E0B",
  "\u8FC7",
  "\u5B50",
  "\u8BF4",
  "\u4EA7",
  "\u79CD",
  "\u9762",
  "\u800C",
  "\u65B9",
  "\u540E",
  "\u591A",
  "\u5B9A",
  "\u884C",
  "\u5B66",
  "\u6CD5",
  "\u6240",
  "\u6C11",
  "\u5F97",
  "\u7ECF",
  "\u5341\u4E09",
  "\u8FDB",
  "\u7740",
  "\u7B49",
  "\u90E8",
  "\u5EA6",
  "\u5BB6",
  "\u7535",
  "\u529B",
  "\u91CC",
  "\u5982",
  "\u6C34",
  "\u5316",
  "\u9AD8",
  "\u81EA",
  "\u4E8C",
  "\u7406",
  "\u8D77",
  "\u5C0F",
  "\u7269",
  "\u73B0",
  "\u5B9E",
  "\u52A0",
  "\u91CF",
  "\u90FD",
  "\u4E24",
  "\u4F53",
  "\u5236",
  "\u673A",
  "\u5F53",
  "\u4F7F",
  "\u70B9",
  "\u4ECE",
  "\u4E1A",
  "\u672C",
  "\u53BB",
  "\u628A",
  "\u6027",
  "\u597D",
  "\u5E94",
  "\u5F00",
  "\u5B83",
  "\u5408",
  "\u8FD8",
  "\u56E0",
  "\u7531",
  "\u5176",
  "\u4E9B",
  "\u7136",
  "\u524D",
  "\u5916",
  "\u5929",
  "\u653F",
  "\u56DB",
  "\u65E5",
  "\u90A3",
  "\u793E",
  "\u4E49",
  "\u4E8B",
  "\u5E73",
  "\u5F62",
  "\u76F8",
  "\u5168",
  "\u8868",
  "\u95F4",
  "\u6837",
  "\u4E0E"
];
function randomWords(words, count) {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(words[Math.floor(Math.random() * words.length)]);
  }
  return result;
}
function generateLoremIpsum(options) {
  const { type, count, language } = options;
  const words = language === "zh" ? CHINESE_WORDS : LOREM_WORDS;
  try {
    if (type === "words") {
      return { ok: true, value: randomWords(words, count).join(" ") };
    }
    if (type === "sentences") {
      const sentences = [];
      for (let i = 0; i < count; i++) {
        const sentenceWords = randomWords(words, 8 + Math.floor(Math.random() * 10));
        if (language === "en") {
          sentenceWords[0] = sentenceWords[0][0].toUpperCase() + sentenceWords[0].slice(1);
        }
        sentences.push(sentenceWords.join("") + (language === "zh" ? "\u3002" : ". "));
      }
      return { ok: true, value: sentences.join("") };
    }
    const paragraphs = [];
    for (let i = 0; i < count; i++) {
      const sentenceCount = 3 + Math.floor(Math.random() * 3);
      const sentences = [];
      for (let j = 0; j < sentenceCount; j++) {
        const sentenceWords = randomWords(words, 10 + Math.floor(Math.random() * 15));
        if (language === "en") {
          sentenceWords[0] = sentenceWords[0][0].toUpperCase() + sentenceWords[0].slice(1);
        }
        sentences.push(sentenceWords.join(" ") + (language === "zh" ? "\u3002" : "."));
      }
      paragraphs.push(sentences.join(" "));
    }
    return { ok: true, value: paragraphs.join("\n\n") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function generatePlaceholderSvg(options) {
  const { width, height, bgColor, textColor, text } = options;
  const displayText = text || `${width} \xD7 ${height}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${Math.min(width, height) / 8}" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${displayText}</text>
</svg>`;
}
export {
  checkPasswordStrength,
  generateLoremIpsum,
  generateNanoId,
  generateNanoIds,
  generateObjectId,
  generatePassword,
  generatePasswords,
  generatePlaceholderSvg,
  generateUUID,
  generateUUIDs,
  generateUlid,
  generateUlids,
  parseObjectId
};
