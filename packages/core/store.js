/**
 * Storage adapter shared by tool Workers.
 *
 * Each tool passes its own prefix so tools may share one KV namespace without
 * key collisions. In production the binding is `KV` (created in the CF
 * dashboard, namespace "tool"); `XENTOOL_KV` is accepted as a fallback name.
 * Without a binding it falls back to an in-memory map so tools stay runnable
 * and testable in plain Node. That fallback is per-isolate and NOT durable.
 */

const memory = new Map();

export function createStore(env, prefix) {
  const kv = env?.KV ?? env?.XENTOOL_KV ?? null;
  const keyPrefix = `${prefix}:`;
  const scoped = (id) => `${keyPrefix}${id}`;

  return {
    backend: kv ? "kv" : "memory",

    async get(id) {
      if (kv) return kv.get(scoped(id));

      const record = memory.get(scoped(id));
      if (!record) return null;
      if (record.expiresAt && record.expiresAt <= Date.now()) {
        memory.delete(scoped(id));
        return null;
      }
      return record.value;
    },

    /*
     * `metadata` rides along with the key so an admin listing can show when a
     * record was written without reading every value back. KV returns it from
     * list(), which is a single call regardless of how many keys there are.
     */
    async put(id, value, { expirationTtl, metadata } = {}) {
      if (kv) {
        const options = {};
        if (expirationTtl) options.expirationTtl = expirationTtl;
        if (metadata) options.metadata = metadata;
        return kv.put(scoped(id), value, options);
      }
      memory.set(scoped(id), {
        value,
        expiresAt: expirationTtl ? Date.now() + expirationTtl * 1000 : null,
        metadata: metadata || null,
      });
    },

    async delete(id) {
      if (kv) return kv.delete(scoped(id));
      memory.delete(scoped(id));
    },

    /** Ids owned by this prefix, newest-first is the caller's job. */
    /**
     * Like list(), but with expiry and metadata — what an admin screen needs.
     * Deleting is still the caller's job: listing must never destroy anything.
     */
    async entries({ limit = 200 } = {}) {
      if (kv) {
        const result = await kv.list({ prefix: keyPrefix, limit });
        return result.keys.map((key) => ({
          id: key.name.slice(keyPrefix.length),
          expiresAt: key.expiration ? key.expiration * 1000 : null,
          metadata: key.metadata || null,
        }));
      }
      const entries = [];
      for (const [key, record] of memory) {
        if (!key.startsWith(keyPrefix)) continue;
        if (record.expiresAt && record.expiresAt <= Date.now()) continue;
        entries.push({
          id: key.slice(keyPrefix.length),
          expiresAt: record.expiresAt,
          metadata: record.metadata || null,
        });
        if (entries.length >= limit) break;
      }
      return entries;
    },

    async list({ limit = 200 } = {}) {
      if (kv) {
        const result = await kv.list({ prefix: keyPrefix, limit });
        return result.keys.map((key) => key.name.slice(keyPrefix.length));
      }
      const ids = [];
      for (const key of memory.keys()) {
        if (key.startsWith(keyPrefix)) ids.push(key.slice(keyPrefix.length));
        if (ids.length >= limit) break;
      }
      return ids;
    },
  };
}
