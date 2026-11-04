/**
 * D1 adapter.
 *
 * Thin wrapper so tools do not repeat the prepare/bind/all dance and so a
 * missing database produces a clear "not configured" state instead of a
 * TypeError deep inside a handler.
 *
 * `readOnly` is enforced by the caller (see tools/sql): D1 cannot switch a
 * connection to read-only mode, so the guard has to be lexical.
 */

export function createDb(env = {}) {
  const d1 = env?.DB && typeof env.DB.prepare === "function" ? env.DB : null;

  /** Rows for a SELECT-shaped statement. */
  async function all(sql, params = []) {
    if (!d1) throw new Error("D1 binding is not configured");
    const statement = d1.prepare(sql);
    const bound = params.length ? statement.bind(...params) : statement;
    const result = await bound.all();
    return {
      rows: result?.results ?? [],
      meta: result?.meta ?? null,
    };
  }

  /** Execution result (changes, last row id) for a write statement. */
  async function run(sql, params = []) {
    if (!d1) throw new Error("D1 binding is not configured");
    const statement = d1.prepare(sql);
    const bound = params.length ? statement.bind(...params) : statement;
    const result = await bound.run();
    return { meta: result?.meta ?? null };
  }

  return { available: Boolean(d1), all, run };
}

/**
 * Statements that cannot mutate the database. Anything else is rejected by
 * the SQL console: the console exists for inspection, and a typo in a DELETE
 * against production data is not a recoverable mistake.
 */
const READ_ONLY = /^\s*(select|with|explain|pragma)\b/i;

export function isReadOnly(sql) {
  const stripped = String(sql)
    .replace(/^\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)+/g, "")
    .trim();
  if (!READ_ONLY.test(stripped)) return false;
  // A SELECT can still write through a CTE or a pragma assignment.
  return !/\b(insert|update|delete|drop|alter|create|replace|attach|detach)\b/i.test(stripped);
}
