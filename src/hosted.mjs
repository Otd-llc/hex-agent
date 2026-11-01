// Muse Spark Open (Meta open weights) on two more hosts, both OpenAI Chat
// Completions shaped like Baseten: Fireworks serverless and a Modal Shared
// Endpoint, each billed per token. Same next() interface as the other adapters.
// Traces say provider "fireworks" or "modal": a Meta model, never the Meta Model
// API, and reported as such.
//
// Model ids name the host: accounts/fireworks/models/<id> for Fireworks, and
// modal:<endpoint host> for Modal, whose Shared Endpoints are routed by the
// endpoint's hostname in the model field (the dashboard gives it once the
// endpoint is made). A Modal Dedicated Endpoint bills GPU time, not tokens:
// this adapter refuses to price one, and making one needs the owner's OK.
import { parseChat, toChat } from './baseten.mjs';

// USD per 1M tokens, Standard/shared, checked 2026-10-31:
// https://fireworks.ai/models/fireworks/muse-spark-open ("no US-only premium") and
// https://modal.com/library/meta/muse-spark-open (prompt / cached prompt / completion).
const MUSE_SPARK_OPEN = { input: 1.25, cached: 0.15, output: 4.25 };

export const HOSTS = {
  fireworks: {
    base: 'https://api.fireworks.ai/inference/v1',
    keyEnv: 'FIREWORKS_API_KEY',
    defaultModel: 'accounts/fireworks/models/muse-spark-open',
    prices: { 'accounts/fireworks/models/muse-spark-open': MUSE_SPARK_OPEN },
    owns: (m) => m.startsWith('accounts/fireworks/'),
    wire: (m) => m,
  },
  modal: {
    // Shared Endpoints route through us-west and always take a proxy token
    // (`modal workspace proxy-tokens create`) as the bearer key.
    base: 'https://inference.us-west.modal.direct/v1',
    keyEnv: 'MODAL_PROXY_TOKEN',
    defaultModel: null,
    // Every Shared Endpoint of this model bills the same rates; the host name is the account's own.
    prices: { '*': MUSE_SPARK_OPEN },
    owns: (m) => m.startsWith('modal:'),
    wire: (m) => m.slice('modal:'.length),
  },
  // A Modal Dedicated Endpoint of Muse Spark Open (4x B300), named modal-dedicated:<host>.
  // It bills GPU seconds while it is up, idle or not, so the ledger counts uptime
  // (src/uptime.mjs, bin/modal-session.mjs); token prices here price the trace only.
  'modal-dedicated': {
    // The host as the dashboard gives it; a pasted scheme or trailing /v1 is dropped.
    base: (m) => `https://${m.slice('modal-dedicated:'.length).replace(/^https?:\/\//, '').replace(/\/(v1\/?)?$/, '')}/v1`,
    keyEnv: 'MODAL_PROXY_TOKEN',
    defaultModel: null,
    prices: { '*': MUSE_SPARK_OPEN },
    owns: (m) => m.startsWith('modal-dedicated:'),
    // The endpoint is its own host: the model field names the weights it serves.
    wire: (m, env = process.env) => (m.slice('modal-dedicated:'.length) ? env.MODAL_DEDICATED_MODEL || 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4' : ''),
    tokenInfoOnly: true,
  },
};

export const hostOf = (model) => Object.keys(HOSTS).find((h) => HOSTS[h].owns(model)) ?? null;

export function hostedPrice(model) {
  const h = HOSTS[hostOf(model)];
  return h ? h.prices[model] ?? h.prices['*'] ?? null : null;
}

export function hostedCostUsd(model, usage) {
  const p = hostedPrice(model);
  if (!p || !usage) return null;
  const cached = usage.cachedInputTokens ?? 0;
  return ((usage.inputTokens - cached) * p.input + cached * p.cached + usage.outputTokens * p.output) / 1e6;
}

export function hostedModel({ model, apiKey, effort = null, timeoutMs = 120_000, fetchImpl = fetch, env = process.env } = {}) {
  const provider = hostOf(model);
  if (!provider) throw new Error(`${model} is not a Fireworks (accounts/fireworks/...) or Modal (modal:<endpoint host>, modal-dedicated:<endpoint host>) model id`);
  const h = HOSTS[provider];
  const key = apiKey ?? env[h.keyEnv];
  if (!key && !(env.MODAL_TOKEN_ID && env.MODAL_TOKEN_SECRET && provider.startsWith('modal'))) throw new Error(`${h.keyEnv} is not set (see .env.example)`);
  if (!hostedPrice(model)) throw new Error(`no price for ${model}`);
  const wire = h.wire(model, env);
  if (!wire) throw new Error(`${model}: name the Modal endpoint host, e.g. ${provider}:<name>.modal.run`);
  const base = typeof h.base === 'function' ? h.base(model) : h.base;
  // A proxy token is a key and a secret: sent as Modal-Key / Modal-Secret when both are set,
  // else the one token as a bearer key.
  const auth = env.MODAL_TOKEN_ID && env.MODAL_TOKEN_SECRET && provider.startsWith('modal')
    ? { 'Modal-Key': env.MODAL_TOKEN_ID, 'Modal-Secret': env.MODAL_TOKEN_SECRET }
    : { Authorization: `Bearer ${key}` };
  return {
    kind: 'live',
    provider,
    model,
    effort,
    async next({ instructions, items, tools }) {
      const body = {
        model: wire,
        messages: [{ role: 'system', content: instructions }, ...toChat(items)],
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
        // Sent only when asked for: neither host documents it for this model yet.
        ...(effort ? { reasoning_effort: effort } : {}),
        max_completion_tokens: 16000,
      };
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      if (!res.ok) throw Object.assign(new Error(`${provider} ${res.status}: ${raw.slice(0, 500)}`), { status: res.status });
      return parseChat(JSON.parse(raw));
    },
  };
}
