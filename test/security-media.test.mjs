import test from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";

import { encodeQr } from "../src/toolkit-core/qrcode.js";
import { aesEncrypt, aesDecrypt, hmacSha256, hmacSha512, generateSshKeyPair } from "../src/toolkit-core/crypto.js";
import { generatePasswords, checkPasswordStrength } from "../src/toolkit-core/generator.js";

/*
 * Rasterises the QR matrix the way a camera would see it, then hands it to a
 * real decoder. Asserting on "the SVG string contains a path" would pass even
 * if the error-correction blocks or the mask were wrong; decoding does not.
 */
function rasterize(matrix, scale = 6, quiet = 4) {
  const count = matrix.length;
  const size = (count + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!matrix[row][col]) continue;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const offset = (((row + quiet) * scale + y) * size + (col + quiet) * scale + x) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }

  return { data, size };
}

test("qr codes scan back to the exact input at every error-correction level", () => {
  const cases = [
    ["hello world", "L"],
    ["https://tool.xen.autos/tools", "M"],
    ["边缘工具库 · xentool", "Q"],
    ["a".repeat(120), "H"],
  ];

  for (const [text, level] of cases) {
    const result = encodeQr(text, { level });
    assert.equal(result.ok, true, result.ok ? "" : result.error);

    const { data, size } = rasterize(result.value.matrix);
    const decoded = jsQR(data, size, size);
    assert.ok(decoded, `${level} level failed to decode`);
    assert.equal(decoded.data, text);
  }
});

test("qr picks the smallest version that fits and reports it", () => {
  const short = encodeQr("hi", { level: "L" });
  const long = encodeQr("x".repeat(200), { level: "L" });
  assert.equal(short.ok, true);
  assert.equal(long.ok, true);
  assert.ok(long.value.version > short.value.version);
  assert.equal(short.value.moduleCount, short.value.version * 4 + 17);
});

test("qr svg leaves a quiet zone and draws with one path", () => {
  const svg = encodeQr("xentool", { level: "M", margin: 4, scale: 8 }).value.svg;
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  // "xentool" fits version 1: 21 modules + a 4-module quiet zone on each side.
  assert.match(svg, /viewBox="0 0 29 29"/);
  assert.match(svg, /<rect width="29" height="29" fill="#ffffff"\/>/);
  assert.equal(svg.match(/<path /g).length, 1);
});

test("qr refuses empty content instead of drawing a blank code", () => {
  const result = encodeQr("   ");
  assert.equal(result.ok, false);
  assert.match(result.error, /内容/);
});

test("qr reports over-capacity content as a readable message", () => {
  const result = encodeQr("x".repeat(5000), { level: "H" });
  assert.equal(result.ok, false);
  assert.match(result.error, /太长/);
});

test("aes round-trips text and survives a payload past the spread-argument limit", async () => {
  const text = "这是一段会在浏览器里加密的文字 with ascii too.";
  const encrypted = await aesEncrypt(text, "correct horse");
  assert.equal(encrypted.ok, true);
  assert.notEqual(encrypted.value, text);

  const decrypted = await aesDecrypt(encrypted.value, "correct horse");
  assert.equal(decrypted.ok, true);
  assert.equal(decrypted.value, text);

  // 200 KB used to die with "Maximum call stack size exceeded" because the
  // byte array was spread into String.fromCharCode.
  const big = "x".repeat(200 * 1024);
  const bigEncrypted = await aesEncrypt(big, "pw");
  assert.equal(bigEncrypted.ok, true, bigEncrypted.ok ? "" : bigEncrypted.error);
  const bigDecrypted = await aesDecrypt(bigEncrypted.value, "pw");
  assert.equal(bigDecrypted.ok, true);
  assert.equal(bigDecrypted.value.length, big.length);
});

test("aes fails loudly on the wrong password", async () => {
  const encrypted = await aesEncrypt("secret", "right");
  const wrong = await aesDecrypt(encrypted.value, "wrong");
  assert.equal(wrong.ok, false);
});

test("hmac matches the reference vectors", async () => {
  const sha256 = await hmacSha256("hello", "secret");
  assert.equal(sha256.value, "88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b");

  const sha512 = await hmacSha512("hello", "secret");
  assert.equal(
    sha512.value,
    "db1595ae88a62fd151ec1cba81b98c39df82daae7b4cb9820f446d5bf02f1dcfca6683d88cab3e273f5963ab8ec469a746b5b19086371239f67d1e5f99a79440",
  );
});

test("password generator honours length and the selected character classes", () => {
  const result = generatePasswords(5, {
    length: 24,
    uppercase: true,
    lowercase: false,
    numbers: true,
    symbols: false,
    excludeSimilar: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.length, 5);
  for (const password of result.value) {
    assert.equal(password.length, 24);
    assert.doesNotMatch(password, /[a-z]/);
    assert.doesNotMatch(password, /[OI01]/);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[0-9]/);
  }
});

test("password generator refuses an empty alphabet", () => {
  const result = generatePasswords(1, {
    length: 12,
    uppercase: false,
    lowercase: false,
    numbers: false,
    symbols: false,
    excludeSimilar: false,
  });
  assert.equal(result.ok, false);
});

test("password strength separates a short password from a long one", () => {
  const weak = checkPasswordStrength("abc123");
  const strong = checkPasswordStrength("K7#vq2!mZr9@Tp4x");
  assert.ok(strong.score > weak.score);
  assert.equal(typeof strong.crackTime, "string");
});

test("ssh key generation produces a usable public and private key", async () => {
  const result = await generateSshKeyPair("ed25519");
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  assert.match(result.value.publicKey, /^ssh-ed25519 AAAA/);
  assert.match(result.value.privateKey, /^-----BEGIN OPENSSH PRIVATE KEY-----/);
  assert.match(result.value.privateKey.trim().split("\n").pop(), /^-----END OPENSSH PRIVATE KEY-----$/);
  assert.match(result.value.fingerprint, /^SHA256:/);
});
