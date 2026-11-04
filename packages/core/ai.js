/**
 * Workers AI adapter.
 *
 * Wraps `env.AI.run` so tools never talk to a possibly-absent binding, and so
 * model ids live in one place. Every helper returns a plain value (string or
 * number[]), never a raw model envelope — callers should not need to know that
 * Llama returns `{response}` while BGE returns `{data:[[...]]}`.
 *
 * When the binding is missing each helper throws `AIUnavailable`, which tools
 * translate into a 503 instead of a 500.
 */

export const MODELS = {
  chat: "@cf/meta/llama-3.1-8b-instruct",
  translate: "@cf/meta/m2m100-1.2b",
  embed: "@cf/baai/bge-m3",
};

export class AIUnavailable extends Error {
  constructor() {
    super("Workers AI binding is not configured");
    this.name = "AIUnavailable";
  }
}

export function createAI(env = {}) {
  const binding = env?.AI && typeof env.AI.run === "function" ? env.AI : null;

  async function run(model, inputs) {
    if (!binding) throw new AIUnavailable();
    return binding.run(model, inputs);
  }

  return {
    available: Boolean(binding),
    models: MODELS,

    /**
     * Summarise or answer over a block of text. `lang` only shapes the
     * instruction, it is not a translation guarantee.
     */
    async chat({ prompt, system, maxTokens = 512 }) {
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });

      const result = await run(MODELS.chat, {
        messages,
        max_tokens: maxTokens,
      });

      const text = result?.response ?? result?.result?.response ?? "";
      return String(text).trim();
    },

    /** Machine translation between the languages m2m100 supports. */
    async translate({ text, source = "zh", target = "en" }) {
      const result = await run(MODELS.translate, {
        text,
        source_lang: source,
        target_lang: target,
      });
      const out = result?.translated_text ?? result?.result?.translated_text ?? "";
      return String(out).trim();
    },

    /** Dense vector for semantic search. Returns number[]. */
    async embed(text) {
      const result = await run(MODELS.embed, { text: [text] });
      const vector = result?.data?.[0] ?? result?.result?.data?.[0] ?? null;
      if (!Array.isArray(vector)) throw new Error("unexpected embedding response");
      return vector;
    },
  };
}

/** Cosine similarity; vectors from one model are already normalised. */
export function cosine(a, b) {
  if (!a?.length || !b?.length) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
