/**
 * Storage adapter shared by tool Workers.
 *
 * Each tool passes its own prefix so tools may share one KV namespace without
 * key collisions. With no XENTOOL_KV binding it falls back to an in-memory
 * map, so tools remain runnable and testable in plain Node (no wrangler, no
 * credentials). The fallback is per-isolate and NOT durable.
 */

const memory = new Map();

export function createStore(env, prefix) {
  const kv = env?.XENTOOL_KV ?? null;
  const scoped = (id) => `${prefix}:${id}`;

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
  };
}
