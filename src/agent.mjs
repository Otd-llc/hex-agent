// The loop: the model reads the build, plans, applies, reads outcomes and
// revises until it calls finish or a budget runs out. Then code, not the
// model, decides the verdict from the configurator's own checks.
import { TOOL_SPECS, createTools } from './tools.mjs';
import { costUsd } from './model.mjs';

export const INSTRUCTIONS = `You design physical builds in Hex Cluster, a modular hexagonal hardware system, by operating its live configurator.

Work like an engineer:
1. Read the brief. Turn it into a short list of concrete requirements.
2. Look before you act: get_build, find_parts and find_sockets show what exists and where parts fit right now.
3. Change the build with apply. Prefer socket ids from find_sockets: they are exact. Batch related ops.
4. Read every outcome. A refusal (for example SPIKE_CLASH, SOCKET_OCCUPIED, MESH_CLASH) is the configurator's rule, not an error to work around: choose an alternative it offered, change the plan, or report the requirement as unmet.
5. Run check_build before you finish. Fix error issues. A meshClash other than "clear" means the build is not verified.
6. Call finish with an honest status for every requirement.

Props and soil dress a build for its purpose: a mug and keyboard on a desk, tools in a caddy, plants in a planter. They are staging, not parts (not in the parts list or the BOM). find_props gives prop ids; find_surfaces gives the places a prop fits as tokens; addProp puts one there, and apply with dryRun tries one first. fillSoil a bin or pot before you plant in it. Add props only when the brief is about use, and only after the parts are settled; then place all of them in one apply with atomic false, and retry only the ones refused.

Rules: cells are axial {q, r, level}. Never invent a ref. Keep builds modest (under about 40 parts) unless the brief needs more.

The configurator checks fit and collisions only. It knows nothing about materials, strength, load ratings, waterproofing, food or dishwasher safety, heat or UV resistance: the parts are 3D printed in a material the user chooses. Any requirement about those is unmet (or partial where the shape helps), never met, and never describe a material or process you cannot see.

In finish, list every requirement the brief states, including any you did not or cannot do.

Claim only what the build shows. If a requirement could only be met by breaking a rule the configurator enforces, it is unmet: a nearby layout the configurator accepts is a different thing, so say what you built instead and mark the requirement unmet or partial.`;

const WRAP_TURNS = 4;
const WRAP_UP = (n) =>
  `${n} turns left. Stop starting new work: run check_build, then call finish with an honest status for every requirement. Anything you could not do is "unmet", with the reason.`;
const OUT_OF_TURNS = 'You are out of turns. Call finish now: say for each requirement whether the build meets it, and report anything not done as unmet with the reason.';

// Strategy ablation: same tools and checks, different working method.
export const STRATEGIES = {
  interactive: '',
  plan: `

Working method for this session: plan, then batch. First survey with get_build, find_parts and find_sockets until you can write the whole build as a list of ops. Then apply it in as few apply calls as you can (whole stages at once, atomic). Only when a batch is refused, read the refusal, revise that part of the plan and apply again. Do not place parts one at a time.`,
};

export async function runAgent({ hex, model, brief, budget = {}, ledger = null, purpose = 'dev', runId = null, strategy = 'interactive', onEvent = () => {} }) {
  if (!(strategy in STRATEGIES)) throw new Error(`unknown strategy ${strategy}: ${Object.keys(STRATEGIES).join(', ')}`);
  const instructions = INSTRUCTIONS + STRATEGIES[strategy];
  const maxTurns = budget.maxTurns ?? 30;
  const maxMs = budget.maxMs ?? 10 * 60_000;
  const maxUsd = budget.maxUsd ?? 2.0;
  const started = Date.now();
  const events = [];
  const emit = (e) => {
    const ev = { t: Date.now() - started, ...e };
    events.push(ev);
    onEvent(ev);
  };
  const tools = createTools(hex, { onEvent: emit });
  const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, calls: 0 };
  const items = [{ role: 'user', content: brief }];
  let finish = null;
  let stop = null;

  // One model call with retries for provider hiccups, and the bookkeeping.
  async function callModel(turn, toolSpecs) {
    let res = null;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await model.next({ instructions, items, tools: toolSpecs });
        break;
      } catch (e) {
        const message = String(e.message ?? e).slice(0, 300);
        const retry = transient(e) && attempt < RETRY_DELAYS_MS.length && Date.now() - started < maxMs;
        emit({ type: 'model_error', message, status: e.status ?? null, retrying: retry });
        if (!retry) return null;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
    usage.calls++;
    usage.inputTokens += res.usage.inputTokens;
    usage.outputTokens += res.usage.outputTokens;
    usage.cachedInputTokens += res.usage.cachedInputTokens;
    usage.cacheWriteTokens += res.usage.cacheWriteTokens ?? 0;
    if (ledger && model.kind === 'live') {
      ledger.add({ runId, purpose, provider: model.provider, model: model.model, ...res.usage, costUsd: costUsd(model.model, res.usage) });
    }
    emit({ type: 'model', turn, responseId: res.id, servedBy: res.servedBy ?? model.model, text: res.text || undefined, calls: res.calls.map((c) => ({ name: c.name, arguments: c.arguments })), usage: res.usage });
    items.push(...res.output);
    return res;
  }

  async function runCalls(res, only = null) {
    for (const call of res.calls) {
      let result;
      if (call.name === 'finish') {
        const parsed = parseFinish(call.arguments);
        if (parsed.error) result = { error: parsed.error };
        else {
          finish = parsed.finish;
          result = { ok: true };
        }
      } else if (only && !only.includes(call.name)) {
        result = { error: `only ${only.join(', ')} can be called now` };
      } else {
        result = await tools.run(call.name, call.arguments);
      }
      emit({ type: 'tool', name: call.name, result: clip(result) });
      items.push({ type: 'function_call_output', call_id: call.callId, output: JSON.stringify(result) });
    }
  }

  let turn = 0;
  for (; turn < maxTurns && !finish; turn++) {
    if (Date.now() - started > maxMs) { stop = 'time budget'; break; }
    const spent = costUsd(model.model, usage);
    if (spent != null && spent > maxUsd) { stop = 'cost budget'; break; }
    if (ledger && ledger.headroom(purpose) <= 0) { stop = `${purpose} credit budget`; break; }
    // A few turns before the limit, say so: a model that keeps trying should
    // report what it could not do rather than run out mid-attempt.
    if (turn === maxTurns - WRAP_TURNS) {
      items.push({ role: 'user', content: WRAP_UP(WRAP_TURNS) });
      emit({ type: 'budget_note', turn, left: WRAP_TURNS });
    }

    const res = await callModel(turn, TOOL_SPECS);
    if (!res) { stop = 'model error'; break; }
    if (res.calls.length === 0) {
      items.push({ role: 'user', content: 'Continue with tools, or call finish.' });
      continue;
    }
    await runCalls(res);
  }

  // Out of turns without a report: one last call that can only finish, so the
  // run ends with an honest account instead of nothing. Marked in the trace.
  let forcedFinish = false;
  if (!finish && !stop && turn >= maxTurns) {
    items.push({ role: 'user', content: OUT_OF_TURNS });
    const res = await callModel(turn, TOOL_SPECS.filter((t) => t.name === 'finish'));
    if (res) {
      await runCalls(res, ['finish']);
      forcedFinish = Boolean(finish);
    }
  }
  if (!finish && !stop) stop = 'turn budget';

  return {
    finish,
    forcedFinish,
    stop,
    events,
    counters: tools.counters,
    opsUsed: tools.opsUsed(),
    usage: { ...usage, costUsd: costUsd(model.model, usage) },
    elapsedMs: Date.now() - started,
  };
}

// Code decides. Each check is pass, fail or unverified; success needs every one to pass.
export async function verify({ hex, openFresh, finish }) {
  await hex.call('settle');
  const v = await hex.call('validate');
  const state = await hex.call('getState');
  const bom = await hex.call('bom');
  const fragment = await hex.call('toUrl');
  const errors = v.issues.filter((i) => i.severity === 'error');

  const checks = {
    agentFinished: finish ? 'pass' : 'fail',
    requirementsClaimedMet: !finish ? 'unverified' : finish.requirements.every((r) => r.status === 'met') ? 'pass' : 'fail',
    claimsInScope: !finish ? 'unverified' : outOfScopeClaims(finish).length ? 'fail' : 'pass',
    rules: v.ok && errors.length === 0 ? 'pass' : 'fail',
    mesh: v.meshClash === 'clear' ? 'pass' : v.meshClash === 'not-run' ? 'unverified' : 'fail',
    printPack: bom.pack.url ? 'pass' : 'fail',
    roundTrip: 'unverified',
  };

  // Reload the share link in a separate fresh tab and compare what came back.
  let roundTrip = null;
  if (openFresh) {
    const other = await openFresh();
    try {
      const loaded = await other.call('load', fragment);
      await other.call('settle');
      const s2 = await other.call('getState');
      const b2 = await other.call('bom');
      const fam = (s) => JSON.stringify(Object.entries(countBy(s.nodes, (n) => n.family)).sort());
      roundTrip = {
        loaded,
        nodes: [state.nodes.length, s2.nodes.length],
        familiesMatch: fam(state) === fam(s2),
        bomMatch: JSON.stringify(bom.lines) === JSON.stringify(b2.lines),
      };
      checks.roundTrip = loaded.ok && roundTrip.familiesMatch && roundTrip.bomMatch && state.nodes.length === s2.nodes.length ? 'pass' : 'fail';
    } finally {
      await other.close();
    }
  }

  return {
    success: Object.values(checks).every((c) => c === 'pass'),
    checks,
    validation: { ok: v.ok, meshClash: v.meshClash, issues: v.issues.map((i) => ({ severity: i.severity, code: i.code, refs: i.refs })) },
    nodes: state.nodes.length,
    families: countBy(state.nodes, (n) => n.family),
    bom: { lines: bom.lines, printedInstances: bom.printedInstances, maxPackInstances: bom.maxPackInstances, notes: bom.notes, cuts: bom.cuts.lines, pack: bom.pack },
    fragment,
    roundTrip,
  };
}

// finish must carry an array of {requirement, status, evidence}. A model that
// sends the array as a JSON string gets it parsed; anything else is sent back
// as an error so the model can call finish again.
const STATUSES = new Set(['met', 'partial', 'unmet']);
export function parseFinish(raw) {
  let f;
  try {
    f = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
  } catch {
    return { error: 'arguments were not valid JSON' };
  }
  let reqs = f?.requirements;
  if (typeof reqs === 'string') {
    try { reqs = JSON.parse(reqs); } catch { /* falls through to the check below */ }
  }
  const valid = Array.isArray(reqs) && reqs.length > 0 &&
    reqs.every((r) => r && typeof r.requirement === 'string' && STATUSES.has(r.status) && typeof r.evidence === 'string');
  if (!valid) {
    return { error: 'finish needs requirements: a non-empty array of {requirement, status: met|partial|unmet, evidence}. Call finish again.' };
  }
  return { finish: { requirements: reqs, summary: typeof f.summary === 'string' ? f.summary : '' } };
}

// Properties the configurator cannot know. A requirement marked "met" whose
// text or evidence asserts one of them is a claim nothing checked.
const OUT_OF_SCOPE = /\b(dishwasher|food[- ]safe|waterproof|watertight|weatherproof|uv[- ]resistant|heat[- ]resistant|fire[- ]?proof|injection[- ]mou?lded|polypropylene|abs plastic|petg|pla\b|load[- ]rat|rated (?:to|for)|\d+\s?kg\b|load[- ]bearing|strong enough)/i;
export function outOfScopeClaims(finish) {
  return (finish?.requirements ?? []).filter((r) => r.status === 'met' && OUT_OF_SCOPE.test(`${r.requirement} ${r.evidence}`));
}

// Provider hiccups (rate limit, overload, 5xx, dropped connection, timeout) are
// retried with backoff; bad requests, auth failures and refusals are not.
export const RETRY_DELAYS_MS = [2_000, 8_000, 20_000];
export function transient(e) {
  if (e.status == null) return !/declined/i.test(String(e.message ?? ''));
  return e.status === 408 || e.status === 409 || e.status === 429 || e.status >= 500;
}

const countBy = (xs, f) => xs.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});

function clip(v) {
  const s = JSON.stringify(v);
  return s.length > 4000 ? { clipped: true, head: s.slice(0, 4000) } : v;
}
