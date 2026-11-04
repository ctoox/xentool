/**
 * Binary blob storage: R2 in production, a module-level Map in tests.
 *
 * R2 has no TTL of its own, so expiry is stored in `customMetadata.expiresAt`
 * and enforced in two places: on read (an expired object is deleted and
 * reported as missing) and in the cron sweep (`sweepExpired`). That keeps the
 * Worker honest even if the cron never runs.
 *
 * The fallback exists for the same reason as createStore's: `npm test` runs in
 * plain Node with no bindings, and tools must still be exercisable.
 */

const memory = new Map();

const now = () => Date.now();

export function createBlobs(env, prefix) {
  const bucket = env?.R2 && typeof env.R2.put === "function" ? env.R2 : null;
  const keyPrefix = `${prefix}/`;
  const scoped = (id) => `${keyPrefix}${id}`;

  async function readMemory(key) {
    const record = memory.get(key);
    if (!record) return null;
    if (record.expiresAt && record.expiresAt <= now()) {
      memory.delete(key);
      return null;
    }
    return record;
  }

  return {
    backend: bucket ? "r2" : "memory",

    async put(id, value, { contentType = "application/octet-stream", expiresIn, name = "" } = {}) {
      const expiresAt = expiresIn ? now() + expiresIn * 1000 : 0;
      const bytes = toUint8(value);

      if (bucket) {
        await bucket.put(scoped(id), bytes, {
          httpMetadata: { contentType },
          customMetadata: {
            expiresAt: String(expiresAt),
            name: name || id,
            size: String(bytes.byteLength),
          },
        });
        return { id, size: bytes.byteLength, expiresAt: expiresAt || null };
      }

      memory.set(scoped(id), { bytes, contentType, expiresAt, name: name || id });
      return { id, size: bytes.byteLength, expiresAt: expiresAt || null };
    },

    async get(id) {
      const key = scoped(id);

      if (bucket) {
        const object = await bucket.get(key);
        if (!object) return null;
        const expiresAt = Number(object.customMetadata?.expiresAt || 0);
        if (expiresAt && expiresAt <= now()) {
          await bucket.delete(key);
          return null;
        }
        return {
          body: object.body,
          size: object.size,
          contentType: object.httpMetadata?.contentType || "application/octet-stream",
          name: object.customMetadata?.name || id,
          expiresAt: expiresAt || null,
        };
      }

      const record = await readMemory(key);
      if (!record) return null;
      return {
        body: record.bytes,
        size: record.bytes.byteLength,
        contentType: record.contentType,
        name: record.name,
        expiresAt: record.expiresAt || null,
      };
    },

    async delete(id) {
      const key = scoped(id);
      if (bucket) return bucket.delete(key);
      memory.delete(key);
    },

    async list({ limit = 100 } = {}) {
      if (bucket) {
        const listed = await bucket.list({ prefix: keyPrefix, limit });
        return (listed.objects || []).map((object) => ({
          id: object.key.slice(keyPrefix.length),
          size: object.size,
          uploaded: object.uploaded ? new Date(object.uploaded).getTime() : null,
          expiresAt: Number(object.customMetadata?.expiresAt || 0) || null,
          name: object.customMetadata?.name || "",
        }));
      }
      const out = [];
      for (const key of memory.keys()) {
        if (!key.startsWith(keyPrefix)) continue;
        const record = await readMemory(key);
        if (record) {
          out.push({
            id: key.slice(keyPrefix.length),
            size: record.bytes.byteLength,
            uploaded: null,
            expiresAt: record.expiresAt || null,
            name: record.name,
          });
        }
        if (out.length >= limit) break;
      }
      return out;
    },

    /** Cron entry point: drop everything whose expiresAt has passed. */
    async sweepExpired({ limit = 200 } = {}) {
      const objects = await this.list({ limit });
      const dead = objects.filter((object) => object.expiresAt && object.expiresAt <= now());
      for (const object of dead) await this.delete(object.id);
      return dead.length;
    },
  };
}

function toUint8(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array(0);
}
