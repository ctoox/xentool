/*
 * Ported from it-toolbox packages/core/crypto.ts
 * Upstream: https://github.com/Zoroaaa/it-toolbox — MIT, Copyright (c) 2026 An
 * See ./LICENSE for the full notice.
 *
 * Changes from upstream: TypeScript types stripped, npm dependencies replaced
 * with local implementations, so the module runs unbundled in the browser and
 * in plain Node.
 */
async function hashText(algorithm, input) {
  try {
    const bytes = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest(algorithm, bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return { ok: true, value: hex };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function sha1(input) {
  return hashText("SHA-1", input);
}
async function sha256(input) {
  return hashText("SHA-256", input);
}
async function sha384(input) {
  return hashText("SHA-384", input);
}
async function sha512(input) {
  return hashText("SHA-512", input);
}
async function hashFile(algorithm, file) {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return { ok: true, value: hex };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function md5(input) {
  try {
    const bytes = new TextEncoder().encode(input);
    const result = md5Bytes(bytes);
    return { ok: true, value: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function md5Bytes(bytes) {
  const K = new Uint32Array([
    3614090360,
    3905402710,
    606105819,
    3250441966,
    4118548399,
    1200080426,
    2821735955,
    4249261313,
    1770035416,
    2336552879,
    4294925233,
    2304563134,
    1804603682,
    4254626195,
    2792965006,
    1236535329,
    4129170786,
    3225465664,
    643717713,
    3921069994,
    3593408605,
    38016083,
    3634488961,
    3889429448,
    568446438,
    3275163606,
    4107603335,
    1163531501,
    2850285829,
    4243563512,
    1735328473,
    2368359562,
    4294588738,
    2272392833,
    1839030562,
    4259657740,
    2763975236,
    1272893353,
    4139469664,
    3200236656,
    681279174,
    3936430074,
    3572445317,
    76029189,
    3654602809,
    3873151461,
    530742520,
    3299628645,
    4096336452,
    1126891415,
    2878612391,
    4237533241,
    1700485571,
    2399980690,
    4293915773,
    2240044497,
    1873313359,
    4264355552,
    2734768916,
    1309151649,
    4149444226,
    3174756917,
    718787259,
    3951481745
  ]);
  const S = new Uint8Array([
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ]);
  const totalLen = (bytes.length + 8 >> 6 << 6) + 64;
  const data = new Uint8Array(totalLen);
  data.set(bytes);
  data[bytes.length] = 128;
  const view = new DataView(data.buffer);
  view.setUint32(totalLen - 8, bytes.length * 8, true);
  let a0 = 1732584193;
  let b0 = 4023233417;
  let c0 = 2562383102;
  let d0 = 271733878;
  for (let offset = 0; offset < totalLen; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      M[i] = view.getUint32(offset + i * 4, true);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = B & C | ~B & D;
        g = i;
      } else if (i < 32) {
        F = D & B | ~D & C;
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = 7 * i % 16;
      }
      F = F + A + K[i] + M[g] >>> 0;
      A = D;
      D = C;
      C = B;
      B = B + leftRotate(F, S[i]) >>> 0;
    }
    a0 = a0 + A >>> 0;
    b0 = b0 + B >>> 0;
    c0 = c0 + C >>> 0;
    d0 = d0 + D >>> 0;
  }
  const result = new Uint8Array(16);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, a0, true);
  resultView.setUint32(4, b0, true);
  resultView.setUint32(8, c0, true);
  resultView.setUint32(12, d0, true);
  return Array.from(result).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function leftRotate(x, c) {
  return (x << c | x >>> 32 - c) >>> 0;
}
function parseJwt(token) {
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      return { ok: false, error: "Invalid JWT format: must have 3 parts" };
    }
    const decode = (str) => {
      const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + (4 - str.length % 4) % 4, "=");
      return JSON.parse(atob(padded));
    };
    const header = decode(parts[0]);
    const payload = decode(parts[1]);
    let isExpired = false;
    let expiresAt;
    let issuedAt;
    if (payload.exp) {
      expiresAt = new Date(payload.exp * 1e3);
      isExpired = expiresAt < /* @__PURE__ */ new Date();
    }
    if (payload.iat) {
      issuedAt = new Date(payload.iat * 1e3);
    }
    return {
      ok: true,
      value: {
        header,
        payload,
        signature: parts[2],
        raw: {
          header: parts[0],
          payload: parts[1],
          signature: parts[2]
        },
        isExpired,
        expiresAt,
        issuedAt
      }
    };
  } catch (e) {
    return { ok: false, error: "Failed to parse JWT: " + e.message };
  }
}
async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 1e5,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function aesEncrypt(plaintext, password) {
  try {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plaintext)
    );
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);
    const base64 = bytesToBase64(combined);
    return { ok: true, value: base64 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function aesDecrypt(ciphertext, password) {
  try {
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const data = combined.slice(28);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    return { ok: true, value: new TextDecoder().decode(decrypted) };
  } catch (e) {
    return { ok: false, error: "Decryption failed: " + e.message };
  }
}
async function generateRsaKeyPair(modulusLength = 2048) {
  try {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["encrypt", "decrypt"]
    );
    const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const publicKey = `-----BEGIN PUBLIC KEY-----
${btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))).match(/.{1,64}/g).join("\n")}
-----END PUBLIC KEY-----`;
    const privateKey = `-----BEGIN PRIVATE KEY-----
${btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer))).match(/.{1,64}/g).join("\n")}
-----END PRIVATE KEY-----`;
    const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    return {
      ok: true,
      value: { publicKey, privateKey, publicKeyJwk, privateKeyJwk }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function hmacSha256(message, secret) {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return { ok: true, value: hex };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
async function hmacSha512(message, secret) {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
    const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return { ok: true, value: hex };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
function sshWriteUint32(n) {
  return new Uint8Array([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]);
}
function sshWriteString(s) {
  const bytes = new TextEncoder().encode(s);
  const len = sshWriteUint32(bytes.length);
  const out = new Uint8Array(len.length + bytes.length);
  out.set(len, 0);
  out.set(bytes, len.length);
  return out;
}
function sshWriteBytes(bytes) {
  const len = sshWriteUint32(bytes.length);
  const out = new Uint8Array(len.length + bytes.length);
  out.set(len, 0);
  out.set(bytes, len.length);
  return out;
}
function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}
/*
 * btoa(String.fromCharCode(...bytes)) overflows the call stack somewhere around
 * 100 KB, which turned "encrypt a long note" into "Maximum call stack size
 * exceeded". Chunking keeps the argument list small and the error message gone.
 */
function bytesToBase64(bytes) {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function encodeBase64(bytes) {
  return bytesToBase64(bytes);
}
async function buildEd25519Keys(keyPair) {
  const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const seed = pkcs8.slice(pkcs8.length - 32);
  const pubWire = concat(sshWriteString("ssh-ed25519"), sshWriteBytes(rawPub));
  const publicKey = `ssh-ed25519 ${encodeBase64(pubWire)} generated@it-toolbox`;
  const fpBuf = await crypto.subtle.digest("SHA-256", new Uint8Array(pubWire));
  const fingerprint = `SHA256:${encodeBase64(new Uint8Array(fpBuf))}`;
  const keyType = sshWriteString("ssh-ed25519");
  const pubSection = sshWriteBytes(rawPub);
  const privSection = sshWriteBytes(concat(seed, rawPub));
  const comment = sshWriteString("generated@it-toolbox");
  const checkInt = crypto.getRandomValues(new Uint8Array(4));
  const checkIntU32 = new DataView(checkInt.buffer).getUint32(0);
  const checkBytes = sshWriteUint32(checkIntU32);
  const privateBlock = concat(
    checkBytes,
    checkBytes,
    // check ints (same value repeated)
    keyType,
    pubSection,
    privSection,
    comment
  );
  const padded = new Uint8Array(Math.ceil(privateBlock.length / 8) * 8);
  padded.set(privateBlock);
  for (let i = privateBlock.length; i < padded.length; i++) padded[i] = i - privateBlock.length + 1 & 255;
  const header = new TextEncoder().encode("openssh-key-v1\0");
  const cipherNone = sshWriteString("none");
  const kdfNone = sshWriteString("none");
  const kdfOptions = sshWriteBytes(new Uint8Array(0));
  const numKeys = sshWriteUint32(1);
  const pubKeyBlob = sshWriteBytes(pubWire);
  const privatePayload = concat(header, cipherNone, kdfNone, kdfOptions, numKeys, pubKeyBlob, sshWriteBytes(padded));
  const privateKeyB64 = encodeBase64(privatePayload).match(/.{1,70}/g).join("\n");
  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----
${privateKeyB64}
-----END OPENSSH PRIVATE KEY-----`;
  return { publicKey, privateKey, fingerprint };
}
async function buildRsaKeys(modulusLength) {
  const keyPair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const spkiBuf = new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey));
  const pkcs8Buf = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  function parseDerLen(data, offset) {
    const b = data[offset];
    if (!(b & 128)) return { len: b, next: offset + 1 };
    const nb = b & 127;
    let len = 0;
    for (let i = 0; i < nb; i++) len = len << 8 | data[offset + 1 + i];
    return { len, next: offset + 1 + nb };
  }
  let pos = 1;
  const { len: outerLen, next: afterOuterLen } = parseDerLen(spkiBuf, pos);
  pos = afterOuterLen;
  pos++;
  const { len: algLen, next: afterAlgLen } = parseDerLen(spkiBuf, pos);
  pos = afterAlgLen + algLen;
  pos++;
  const { next: afterBsLen } = parseDerLen(spkiBuf, pos);
  pos = afterBsLen;
  pos++;
  pos++;
  const { next: afterRsaSeqLen } = parseDerLen(spkiBuf, pos);
  pos = afterRsaSeqLen;
  pos++;
  const { len: nLen, next: afterNLen } = parseDerLen(spkiBuf, pos);
  const n = spkiBuf.slice(afterNLen, afterNLen + nLen);
  pos = afterNLen + nLen;
  pos++;
  const { len: eLen, next: afterELen } = parseDerLen(spkiBuf, pos);
  const e = spkiBuf.slice(afterELen, afterELen + eLen);
  function mpint(bytes) {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const needPad = trimmed[0] & 128;
    const b = needPad ? concat(new Uint8Array([0]), trimmed) : trimmed;
    return sshWriteBytes(b);
  }
  const pubWire = concat(sshWriteString("ssh-rsa"), mpint(e), mpint(n));
  const publicKey = `ssh-rsa ${encodeBase64(pubWire)} generated@it-toolbox`;
  const fpBuf = await crypto.subtle.digest("SHA-256", new Uint8Array(pubWire));
  const fingerprint = `SHA256:${encodeBase64(new Uint8Array(fpBuf))}`;
  const privB64 = encodeBase64(pkcs8Buf).match(/.{1,64}/g).join("\n");
  const privateKey = `-----BEGIN PRIVATE KEY-----
${privB64}
-----END PRIVATE KEY-----`;
  return { publicKey, privateKey, fingerprint };
}
async function generateSshKeyPair(type = "ed25519") {
  try {
    if (type === "ed25519") {
      if (!crypto.subtle.generateKey.toString().includes("native")) {
      }
      const keyPair = await crypto.subtle.generateKey(
        { name: "Ed25519" },
        true,
        ["sign", "verify"]
      );
      const keys = await buildEd25519Keys(keyPair);
      return { ok: true, value: keys };
    } else {
      const keys = await buildRsaKeys(4096);
      return { ok: true, value: keys };
    }
  } catch (e) {
    const msg = e.message;
    if (msg.includes("Ed25519") || msg.includes("algorithm")) {
      return { ok: false, error: "Ed25519 \u9700\u8981 Chrome 113+\u3001Firefox 119+ \u6216 Safari 17+\uFF0C\u8BF7\u5347\u7EA7\u6D4F\u89C8\u5668\u6216\u6539\u7528 RSA \u5BC6\u94A5\u3002" };
    }
    return { ok: false, error: msg };
  }
}
export {
  aesDecrypt,
  aesEncrypt,
  deriveKey,
  generateRsaKeyPair,
  generateSshKeyPair,
  hashFile,
  hmacSha256,
  hmacSha512,
  md5,
  parseJwt,
  sha1,
  sha256,
  sha384,
  sha512
};
