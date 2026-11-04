/**
 * Runtime capability probe.
 *
 * Single place that knows which Cloudflare bindings this deployment actually
 * has. Tools ask here instead of sniffing `env` themselves, so:
 *   - `wrangler.toml` stays the only place bindings are declared;
 *   - a tool can degrade instead of throwing when a binding is absent;
 *   - `/status` can report the whole picture from one source.
 *
 * Every probe checks the shape of the binding, not just its presence: a
 * placeholder object in a test fixture must not look like a real R2 bucket.
 */

const isFn = (value) => typeof value === "function";

export function capabilities(env = {}) {
  const ai = env?.AI;
  const r2 = env?.R2;
  const db = env?.DB;
  const queue = env?.TASKS;
  const vectorize = env?.VECTORIZE;

  return {
    kv: Boolean(env?.KV ?? env?.XENTOOL_KV),
    ai: Boolean(ai) && isFn(ai.run),
    r2: Boolean(r2) && isFn(r2.put) && isFn(r2.get),
    d1: Boolean(db) && isFn(db.prepare),
    counter: Boolean(env?.COUNTER),
    room: Boolean(env?.ROOM),
    queue: Boolean(queue) && isFn(queue.send),
    vectorize: Boolean(vectorize) && isFn(vectorize.query),
    cache: typeof caches !== "undefined",
  };
}

/** Bindings a tool needs, minus the ones that are present. */
export function missing(env, names) {
  const caps = capabilities(env);
  return names.filter((name) => !caps[name]);
}

/** Uniform 503 body for tools whose binding is not provisioned yet. */
export function unavailable(name, hint) {
  return {
    error: `${name} binding is not configured`,
    hint: hint || `Add the ${name} binding in wrangler.toml, then redeploy.`,
    capabilities: null,
  };
}
