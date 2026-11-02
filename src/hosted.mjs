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
import { timedPost, streamPost, requestParams, toolChoice } from './http.mjs';
import { createHash } from 'node:crypto';

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
    base: (m) => `https://${dedicatedHost(m)}/v1`,
    keyEnv: 'MODAL_PROXY_TOKEN',
    defaultModel: null,
    prices: { '*': MUSE_SPARK_OPEN },
    owns: (m) => m.startsWith('modal-dedicated:'),
    // The endpoint is its own host: the model field names the weights it serves.
    wire: (m, env = process.env) => (dedicatedHost(m) ? env.MODAL_DEDICATED_MODEL || DEDICATED_WEIGHTS : ''),
    tokenInfoOnly: true,
  },
};

export const DEDICATED_WEIGHTS = 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4';

// The endpoint host of a modal-dedicated id, as the dashboard gives it (a pasted
// scheme or trailing /v1 is dropped). A Dedicated Endpoint is served at its own
// <workspace>--ep-<name>-server.<region>.modal.direct (seen 2026-11-02) or a *.modal.run
// host. Any other *.modal.direct host (inference.<region>.modal.direct) is the
// card-billed Shared router, and anything else would carry the proxy token to a
// host that is not Modal's.
const DEDICATED_DIRECT = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?--ep-[a-z0-9]([a-z0-9-]*[a-z0-9])?-server[.][a-z0-9]([a-z0-9-]*[a-z0-9])?[.]modal[.]direct$/;
export function dedicatedHost(model) {
  const h = String(model).slice('modal-dedicated:'.length).trim().toLowerCase()
    .replace(/^https?:[/][/]/, '').replace(/[/](v1[/]?)?$/, '');
  if (!h) return '';
  if (DEDICATED_DIRECT.test(h)) return h;
  // Refusals name the host by its label only: the text reaches consoles and logs.
  if (/[.]modal[.]direct$/.test(h)) throw new Error(`${hostLabel(h)} is a Modal Shared Endpoint host (*.modal.direct, billed to the card, not the credit): refused`);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)*[.]modal[.]run$/.test(h)) {
    throw new Error(`${hostLabel(h)} is not a Modal Dedicated Endpoint host (*.modal.run): refused`);
  }
  return h;
}

// A host by a short hash, for anything printed or written: the same host, the same label.
export const hostLabel = (h) => `host#${createHash('sha256').update(String(h)).digest('hex').slice(0, 8)}`;

// Text with the endpoint host (and its URL) replaced by its label, in any letter case.
// Callers redact the whole text before cutting it short, so no part of the host survives a cut.
export function redactHost(text, host) {
  const t = String(text ?? '');
  if (!host) return t;
  const re = new RegExp(String(host).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return t.replace(re, hostLabel(String(host).toLowerCase()));
}

// A modal-dedicated id with its host hidden, for traces and anything published.
export function publicModelId(model) {
  return String(model).startsWith('modal-dedicated:') ? 'modal-dedicated:[endpoint host redacted]' : model;
}

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

export function hostedModel({ model, apiKey, effort = null, timeoutMs = 120_000, stallMs = 30_000, fetchImpl = fetch, env = process.env } = {}) {
  const provider = hostOf(model);
  if (!provider) throw new Error(`${model} is not a Fireworks (accounts/fireworks/...) or Modal (modal:<endpoint host>, modal-dedicated:<endpoint host>) model id`);
  const h = HOSTS[provider];
  // Modal's account-token names: a dedicated run takes the proxy token only, so an
  // account token in the environment is a mistake that must not reach any host.
  if (provider === 'modal-dedicated' && (env.MODAL_TOKEN_ID || env.MODAL_TOKEN_SECRET)) {
    throw new Error('MODAL_TOKEN_ID / MODAL_TOKEN_SECRET are set: unset them; a dedicated run uses MODAL_PROXY_TOKEN only');
  }
  const key = apiKey ?? env[h.keyEnv];
  if (!key) throw new Error(`${h.keyEnv} is not set (see .env.example)`);
  if (!hostedPrice(model)) throw new Error(`no price for ${model}`);
  const wire = h.wire(model, env);
  if (!wire) throw new Error(`${model}: name the Modal endpoint host, e.g. ${provider}:<name>.modal.run`);
  const base = typeof h.base === 'function' ? h.base(model) : h.base;
  const auth = { Authorization: `Bearer ${key}` };
  // A Dedicated Endpoint's host is the account's own: kept out of error text.
  const secretHost = provider === 'modal-dedicated' ? dedicatedHost(model) : null;
  // Only Fireworks streams: the Modal runs are done and stay as they were measured.
  const stream = provider === 'fireworks';
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
        tool_choice: toolChoice(env),
        // Sent only when asked for: neither host documents it for this model yet.
        ...(effort ? { reasoning_effort: effort } : {}),
        // Fireworks streams with a cap far above any answered call (F1: max 1173 output tokens),
        // so a runaway generation stops early and a silent request is dropped at stallMs.
        max_completion_tokens: stream ? 4000 : 16000,
        ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      };
      let got;
      try {
        const req = { headers: { ...auth, 'Content-Type': 'application/json' }, body, timeoutMs };
        got = stream
          ? await streamPost(fetchImpl, `${base}/chat/completions`, { ...req, stallMs })
          : await timedPost(fetchImpl, `${base}/chat/completions`, req);
      } catch (e) {
        // A network error names the host it could not reach.
        if (secretHost) e.message = redactHost(e.message, secretHost);
        throw e;
      }
      const { res, raw, http } = got;
      if (!res.ok) throw Object.assign(new Error(redactHost(`${provider} ${res.status}: ${raw}`, secretHost).slice(0, 520)), { status: res.status, http });
      return { ...parseChat(JSON.parse(raw)), http, params: requestParams(body) };
    },
    // One tiny request, for a warm-up probe: its status and time, no tools.
    async probe() {
      const body = { model: wire, messages: [{ role: 'user', content: 'Reply with OK.' }], max_completion_tokens: 4 };
      try {
        const { res, raw, http } = await timedPost(fetchImpl, `${base}/chat/completions`, { headers: { ...auth, 'Content-Type': 'application/json' }, body, timeoutMs });
        let servedBy = null;
        try { servedBy = JSON.parse(raw).model ?? null; } catch {}
        return { ...http, ok: res.ok, servedBy, body: res.ok ? undefined : redactHost(raw, secretHost).slice(0, 200) };
      } catch (e) {
        return { ...(e.http ?? {}), ok: false, error: redactHost(String(e.message ?? e), secretHost).slice(0, 200) };
      }
    },
  };
}
