/**
 * Minimal admin auth for tool Workers.
 *
 * One secret, bound as a Worker secret (default name `ADMIN`). Two ways in:
 *   - Authorization: Bearer <secret>   (curl, scripts)
 *   - a signed cookie                  (browser console)
 *
 * The cookie is `<exp>.<hmac-sha256(secret, exp)>`, so it is stateless: no
 * session store, no KV round-trip, and rotating the secret invalidates every
 * existing session. HMAC-SHA256 is used rather than a plain hash so a leaked
 * cookie cannot be extended without the secret.
 *
 * Fails closed: with no secret configured every request is unauthenticated and
 * the caller is expected to render a setup message instead of a login form.
 */

const encoder = new TextEncoder();

export const DEFAULT_SECRET_NAME = "ADMIN";
export const DEFAULT_COOKIE = "xt_admin";
export const DEFAULT_TTL = 7 * 24 * 3600;
const MIN_SECRET_LENGTH = 8;

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string compare, so a wrong secret leaks no timing signal. */
export function timingSafeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function sign(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64url(new Uint8Array(signature));
}

export function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/**
 * @param {Request} request  used for the cookie header and to decide `Secure`
 * @param {object}  env      Worker bindings; the secret is read from `secretName`
 */
export function createAuth(
  request,
  env,
  { secretName = DEFAULT_SECRET_NAME, cookieName = DEFAULT_COOKIE, ttl = DEFAULT_TTL } = {},
) {
  const raw = env?.[secretName];
  const secret = typeof raw === "string" && raw.length >= MIN_SECRET_LENGTH ? raw : null;
  const secure = new URL(request.url).protocol === "https:";
  const attributes = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

  async function token() {
    const exp = Date.now() + ttl * 1000;
    return `${exp}.${await sign(secret, String(exp))}`;
  }

  async function verifyCookie(candidate) {
    if (!secret || !candidate) return false;
    const dot = candidate.indexOf(".");
    if (dot === -1) return false;
    const exp = candidate.slice(0, dot);
    if (!/^\d+$/.test(exp) || Number(exp) <= Date.now()) return false;
    return timingSafeEqual(candidate.slice(dot + 1), await sign(secret, exp));
  }

  return {
    configured: Boolean(secret),
    cookieName,

    async authorized() {
      if (!secret) return false;
      const bearer = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
      if (bearer && timingSafeEqual(bearer[1].trim(), secret)) return true;
      return verifyCookie(readCookie(request, cookieName));
    },

    checkPassword(password) {
      return Boolean(secret) && timingSafeEqual(password, secret);
    },

    async sessionCookie() {
      return `${cookieName}=${await token()}; ${attributes}; Max-Age=${ttl}`;
    },

    clearedCookie() {
      return `${cookieName}=; ${attributes}; Max-Age=0`;
    },
  };
}
