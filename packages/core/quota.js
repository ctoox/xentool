/**
 * Free-tier quota guard for D1 and R2.
 *
 * Why this exists: D1 and R2 fail in different ways when you run out.
 *
 *   - D1 on the free plan stops answering queries until 00:00 UTC. No bill,
 *     but the site is down — and a full table scan counts every row it reads,
 *     not every row it returns, so the ceiling arrives sooner than expected.
 *   - R2 has no hard stop. Past 10 GB / 1M Class A / 10M Class B it starts
 *     billing. That is the one that costs money, so it is the one that needs
 *     a hard cut-off rather than a warning.
 *
 * Policy: stop at 60% of the free allowance. The remaining 40% is headroom for
 * counters that are approximate (KV is eventually consistent, and isolates are
 * short-lived), for traffic arriving between check and write, and for the
 * cleanup that has to run *after* the limit is reached.
 *
 * Counters are deliberately cheap: values accumulate in memory and are flushed
 * to KV at most once a minute. KV writes are capped at 1,000/day on the free
 * plan, so writing on every request would spend the quota we are trying to
 * protect. An occasional lost delta is acceptable because the 60% cut-off
 * leaves room for it.
 */

import { createStore } from "./store.js";

/** Free-plan ceilings. Keep in sync with Cloudflare's pricing page. */
export const FREE_LIMITS = Object.freeze({
  d1: Object.freeze({
    period: "day",
    rowsRead: 5_000_000,
    rowsWritten: 100_000,
    storageBytes: 5 * 1024 ** 3,
  }),
  r2: Object.freeze({
    period: "month",
    storageBytes: 10 * 1024 ** 3,
    classA: 1_000_000,
    classB: 10_000_000,
  }),
});

/** Cut off here. 0.6 leaves 40% headroom for approximation and cleanup. */
export const SAFETY_RATIO = 0.6;

/** Flush accumulated deltas at most this often (ms). */
const FLUSH_INTERVAL = 60_000;

const FIELDS = {
  d1: ["rowsRead", "rowsWritten", "storageBytes"],
  r2: ["storageBytes", "classA", "classB"],
};

function emptyValue(kind) {
  const out = {};
  for (const field of FIELDS[kind]) out[field] = 0;
  return out;
}

function add(into, delta) {
  const out = { ...into };
  for (const [key, value] of Object.entries(delta || {})) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = (out[key] || 0) + value;
  }
  return out;
}

export function periodKey(kind, now = new Date()) {
  const stamp = now.toISOString();
  return FREE_LIMITS[kind]?.period === "month" ? stamp.slice(0, 7) : stamp.slice(0, 10);
}

/** Classify usage against its ceiling. `warn` starts at 75% of the cut-off. */
export function level(used, limit) {
  const ratio = limit > 0 ? Math.min(used / limit, 9.99) : 0;
  const state = ratio >= SAFETY_RATIO ? "blocked" : ratio >= SAFETY_RATIO * 0.75 ? "warn" : "ok";
  return { used, limit, ratio, state };
}

export function fmtBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes) || 0;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/**
 * Quota facade bound to one env.
 *
 * `guard()` is the only thing tools need to call before doing work; `bump()`
 * records what the work cost. Both are safe to call when KV is absent — the
 * counters then live in memory only, which is what the test suite does.
 */
export function createQuota(env = {}) {
  const store = createStore(env, "quota");
  const pending = new Map();
  const lastFlush = new Map();

  async function load(kind) {
    const key = `${kind}:${periodKey(kind)}`;
    let stored = {};
    try {
      stored = JSON.parse((await store.get(key)) || "{}") || {};
    } catch {
      stored = {};
    }
    const local = pending.get(key) || {};
    const merged = add(add(emptyValue(kind), stored), local);
    return { key, value: merged };
  }

  return {
    /** Full snapshot: per-field levels plus an overall verdict. */
    async snapshot(kind) {
      const { value } = await load(kind);
      const limits = FREE_LIMITS[kind] || {};
      const fields = {};
      let worst = { state: "ok", ratio: 0 };
      for (const field of FIELDS[kind]) {
        const l = level(value[field] || 0, limits[field] || 0);
        fields[field] = l;
        if (l.ratio > worst.ratio) worst = l;
      }
      return {
        kind,
        period: limits.period,
        periodKey: periodKey(kind),
        fields,
        state: worst.state,
        ratio: worst.ratio,
        used: value,
        limits,
      };
    },

    /**
     * Check whether `need` more of each field fits under the cut-off.
     * Returns { ok, state, reason } — never throws.
     */
    async guard(kind, need = {}) {
      const snap = await this.snapshot(kind);
      // Already past the cut-off: refuse even if this call asks for nothing,
      // because "how much will this cost" is unknowable for a SQL statement.
      if (snap.state === "blocked") {
        const worst = Object.entries(snap.fields).sort((a, b) => b[1].ratio - a[1].ratio)[0];
        return {
          ok: false,
          state: "blocked",
          field: worst?.[0],
          used: worst?.[1]?.used || 0,
          need: 0,
          limit: worst?.[1]?.limit || 0,
          threshold: Math.floor((worst?.[1]?.limit || 0) * SAFETY_RATIO),
          reason: `${kind}.${worst?.[0] || "usage"} is already at ${Math.round((worst?.[1]?.ratio || 0) * 100)}% of the free allowance`,
        };
      }
      for (const [field, amount] of Object.entries(need)) {
        const limit = snap.limits[field];
        if (!limit) continue;
        const projected = (snap.fields[field]?.used || 0) + (Number(amount) || 0);
        if (projected > limit * SAFETY_RATIO) {
          return {
            ok: false,
            state: "blocked",
            field,
            used: snap.fields[field]?.used || 0,
            need: amount,
            limit,
            threshold: Math.floor(limit * SAFETY_RATIO),
            reason: `${kind}.${field} would reach ${projected} of ${limit}, past the ${Math.round(SAFETY_RATIO * 100)}% cut-off`,
          };
        }
      }
      return { ok: true, state: snap.state, snapshot: snap };
    },

    /** Record what the operation actually cost. Cheap; may be coalesced. */
    bump(kind, delta = {}) {
      const key = `${kind}:${periodKey(kind)}`;
      pending.set(key, add(pending.get(key) || emptyValue(kind), delta));
    },

    /** Push accumulated deltas to KV if the interval has elapsed. */
    async flush(force = false) {
      const now = Date.now();
      for (const [key, value] of [...pending.entries()]) {
        const last = lastFlush.get(key) || 0;
        if (!force && now - last < FLUSH_INTERVAL) continue;
        try {
          await store.put(key, JSON.stringify(value), { expirationTtl: 172_800 });
          pending.delete(key);
          lastFlush.set(key, now);
        } catch {
          // Keep the delta in memory; the next flush retries.
        }
      }
    },

    /** Snapshot both resources. Used by /status. */
    async report() {
      const [d1, r2] = await Promise.all([this.snapshot("d1"), this.snapshot("r2")]);
      return { d1, r2, safetyRatio: SAFETY_RATIO, backend: store.backend };
    },
  };
}

/** Shape a blocked guard() result into the JSON body tools return. */
export function quotaError(result) {
  return {
    error: "quota_guard",
    message: `Free-tier quota cut-off reached (${Math.round(SAFETY_RATIO * 100)}%): ${result.reason}`,
    field: result.field,
    used: result.used,
    limit: result.limit,
    threshold: result.threshold,
    reset: "D1 daily limits reset at 00:00 UTC; R2 monthly limits reset with the billing period.",
  };
}
