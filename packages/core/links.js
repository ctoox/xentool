/**
 * Shared machinery for "paste something, get a short link".
 *
 * Two tools use it — /paste (plain text) and /md (rendered markdown) — and
 * they differ only in how they present a record, not in how one is stored,
 * validated, expired or revoked. Keeping that half in one place is what makes
 * the second tool cheap; duplicating it is how the two drift until one of them
 * forgets to check a TTL bound.
 *
 * Storage layout, unchanged since v1 so old records keep working:
 *   key   paste:<id> | md:<id>
 *   value { v: 1, content, createdAt, burn? }
 *   metadata { createdAt, size, burn, preview, title? }
 *
 * The metadata exists so the admin list never has to read a value — reading a
 * burn-after-reading record is what destroys it, and a listing must not.
 */
import { timingSafeEqual } from "./auth.js";

export const NO_STORE = { "Cache-Control": "no-store" };

export const MAX_BYTES = 64 * 1024;
export const MIN_TTL = 60;
export const DEFAULT_TTL = 7 * 24 * 3600;
export const MAX_TTL = 30 * 24 * 3600;

export const ID_PATTERN = /^[a-z0-9]{6,16}$/;

export const TTL_OPTIONS = [
  { label: "1 小时", value: 3600 },
  { label: "1 天", value: 86400 },
  { label: "7 天", value: DEFAULT_TTL },
  { label: "30 天", value: MAX_TTL },
];

/** 10 lowercase hex-ish characters: short enough to read aloud, long enough. */
export function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** One line of context for the admin list; never the whole payload. */
export function previewOf(content) {
  return String(content).replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * Read a record without destroying it. Returns null when the key is gone or
 * expired — KV handles expiry, so "null" covers both.
 */
export async function peekRecord(store, id) {
  const raw = await store.get(id);
  if (raw === null || raw === undefined) return null;

  let record = null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.content === "string") {
      record = parsed;
    }
  } catch {
    // Legacy record: written before values were JSON, so the raw string is
    // the content. Still readable, which is the point of keeping this branch.
  }
  if (!record) record = { v: 0, content: raw, createdAt: null, burn: false };
  return record;
}

/** Read a record and honour burn-after-reading. */
export async function readRecord(store, id) {
  const record = await peekRecord(store, id);
  if (record && record.burn) await store.delete(id);
  return record;
}

/** Bearer-token check against the ADMIN secret, in constant time. */
export function isAdmin(request, env) {
  const expected = env?.ADMIN;
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  return timingSafeEqual(header.slice(7).trim(), expected);
}

/**
 * Parse a create request. Plain text bodies are accepted as the content
 * itself; JSON bodies carry `content`, and optionally `ttl` / `burn`.
 *
 * Returns `{ ok: true, content, ttl, burn, size }` or `{ ok: false, status,
 * message }` so callers can map straight onto `fail()`.
 */
export async function parseCreate(request, { allowBurn = true } = {}) {
  const raw = await request.text();
  // Cheap guard on the wire size first; the authoritative check happens below,
  // on the decoded content (JSON escaping can inflate the body by ~2x).
  if (!raw || raw.length > MAX_BYTES * 2) {
    return {
      ok: false,
      status: raw.length > MAX_BYTES * 2 ? 413 : 400,
      message: `content must be 1-${MAX_BYTES} bytes`,
    };
  }

  let content = raw;
  let ttl = DEFAULT_TTL;
  let burn = false;

  if ((request.headers.get("content-type") || "").includes("application/json")) {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, status: 400, message: "invalid JSON" };
    }
    if (typeof payload?.content !== "string" || !payload.content) {
      return { ok: false, status: 400, message: "content must be a non-empty string" };
    }
    content = payload.content;
    if (payload.ttl !== undefined) {
      if (!Number.isInteger(payload.ttl) || payload.ttl < MIN_TTL || payload.ttl > MAX_TTL) {
        return {
          ok: false,
          status: 400,
          message: `ttl must be an integer between ${MIN_TTL} and ${MAX_TTL}`,
        };
      }
      ttl = payload.ttl;
    }
    burn = allowBurn && payload.burn === true;
  }

  const size = new TextEncoder().encode(content).length;
  if (!content || size > MAX_BYTES) {
    return {
      ok: false,
      status: size > MAX_BYTES ? 413 : 400,
      message: `content must be 1-${MAX_BYTES} bytes`,
    };
  }

  return { ok: true, content, ttl, burn, size };
}

/** Write a record with the metadata the admin list needs. */
export async function saveRecord(store, { content, ttl, burn = false, size, title }) {
  const id = newId();
  const createdAt = Date.now();
  const metadata = { createdAt, size, burn, preview: previewOf(content) };
  if (title) metadata.title = String(title).slice(0, 80);

  await store.put(id, JSON.stringify({ v: 1, content, createdAt, burn }), {
    expirationTtl: ttl,
    metadata,
  });

  return { id, createdAt };
}

/** Shape the admin list the same way for every link kind. */
export async function listRecords(store, kind) {
  const entries = await store.entries({ limit: 200 });
  const items = entries.map((entry) => {
    const meta = entry.metadata || {};
    return {
      id: entry.id,
      kind,
      title: meta.title || "",
      createdAt: meta.createdAt || null,
      expiresAt: entry.expiresAt || null,
      size: typeof meta.size === "number" ? meta.size : null,
      burn: meta.burn === true,
      preview: meta.preview || "",
      legacy: !entry.metadata,
    };
  });
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return items;
}

/** Absolute share URL for a freshly created record. */
export function shareUrl({ host, basePath = "", id }) {
  return `https://${host}${basePath}/${id}`;
}
