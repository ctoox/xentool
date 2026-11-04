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

    async put(id, value, { expirationTtl } = {}) {
      if (kv) {
        return kv.put(scoped(id), value, expirationTtl ? { expirationTtl } : {});
      }
      memory.set(scoped(id), {
        value,
        expiresAt: expirationTtl ? Date.now() + expirationTtl * 1000 : null,
      });
    },

    async delete(id) {
      if (kv) return kv.delete(scoped(id));
      memory.delete(scoped(id));
    },

    /** Ids owned by this prefix, newest-first is the caller's job. */
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
