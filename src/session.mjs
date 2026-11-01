// One run end to end: open the configurator, run the agent, verify in code,
// write the trace. Shared by the single-run CLI and the suite.
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { openHex, dismissCookies, hexUrl } from './bridge.mjs';
import { CONTRACT } from './contract.mjs';
import { installOverlay, pushLines, linesFor } from './overlay.mjs';
import { metaModel, PRICES } from './model.mjs';
import { claudeModel } from './claude.mjs';
import { basetenModel } from './baseten.mjs';
import { hostedModel, hostOf, dedicatedHost, publicModelId } from './hosted.mjs';
import { heldFromEnvFile } from './env.mjs';
import { agentCommit, vizCommit } from './provenance.mjs';
import { openLedger } from './ledger.mjs';
import { openUptimeLedger, CREDIT_CEILING_USD, RESERVE_FLOOR_USD } from './uptime.mjs';
import { runAgent, verify, ownChecks } from './agent.mjs';
import { checkBrief } from './checks.mjs';

// Reasoning effort when none is asked for. Muse Spark Open measured best at low
// (ablation 2026-10-27, EVALUATION.md); the others stay at medium until measured.
// Fireworks and Modal send none until a smoke shows the host takes the parameter.
// Modal Dedicated serves the same NVFP4 weights as Baseten, so it runs at Baseten's low.
export const DEFAULT_EFFORT = { baseten: 'low', anthropic: 'medium', meta: 'medium', fireworks: null, modal: null, 'modal-dedicated': 'low' };

// Muse Spark Open's weights on each host that serves it, as the host is configured
// (Baseten's [HACKATHON] model, the Modal endpoint the owner made): the same NVFP4 build.
const WEIGHTS = {
  baseten: { name: 'Muse-Spark-Open-816B-A42B-NVFP4', precision: 'NVFP4' },
  'modal-dedicated': { name: 'Muse-Spark-Open-816B-A42B-NVFP4', precision: 'NVFP4' },
};

// Where each provider's per-token prices come from (the trace says which priced the run).
const COST_SOURCES = {
  meta: 'https://dev.meta.ai/docs/pricing-rate-limits (Standard mode, 2026-10-27)',
  anthropic: 'Anthropic first-party rates (claude-api skill, cached 2026-10-06)',
  baseten: 'https://www.baseten.co/library/muse-spark-open/',
  fireworks: 'https://fireworks.ai/models/fireworks/muse-spark-open (checked 2026-10-31)',
  modal: 'https://modal.com/library/meta/muse-spark-open (Shared Endpoint, checked 2026-10-31)',
  'modal-dedicated': 'token-equivalent at Muse Spark Open shared rates, info only: the Dedicated Endpoint bills GPU seconds while up (.spend/modal-dedicated.jsonl)',
};

// Per-token hosts with a fixed credit: Fireworks' $100 hackathon credit, stop at $5 left.
export const HOSTED_LIMITS = { fireworks: { ceilingUsd: 100, floorUsd: 5 } };

// A Dedicated Endpoint bills GPU seconds while it is up. Its switch is taken from the
// command line only: a .env cannot turn it on (src/env.mjs holds the key back).
export function dedicatedGate(modelId) {
  if (heldFromEnvFile.has('MODAL_DEDICATED_ALLOWED')) throw new Error('MODAL_DEDICATED_ALLOWED is in .env: remove it; it is set on the command line only, with the owner\'s OK');
  if (process.env.MODAL_DEDICATED_ALLOWED !== '1') throw new Error(`${modelId}: Modal Dedicated runs are off (set MODAL_DEDICATED_ALLOWED=1 on the command line only with the owner's OK)`);
  dedicatedHost(modelId);
}

// The Meta Model API is kept for the demo and judging: its switch, too, is taken from
// the command line only, and only the Meta ids this code prices go to it.
export function metaGate(modelId) {
  if (heldFromEnvFile.has('META_API_ALLOWED')) throw new Error('META_API_ALLOWED is in .env: remove it; it is set on the command line only, with the owner\'s OK');
  if (!(modelId in PRICES)) throw new Error(`${modelId} is not a known model id: refused (Muse Spark Open runs: meta-models/... (Baseten), accounts/fireworks/models/muse-spark-open, modal-dedicated:<endpoint host>.modal.run; claude-*; Meta Model API: ${Object.keys(PRICES).join(', ')})`);
  if (process.env.META_API_ALLOWED !== '1') throw new Error(`${modelId}: the Meta Model API is off (set META_API_ALLOWED=1 on the command line only with the owner's OK)`);
}

// segment + spec: a Modal Dedicated run's segment and exact spec, checked against the ledger.
export function modelFor({ modelId, purpose, effort, segment = process.env.MODAL_SEGMENT ?? null, spec = null }) {
  if (!modelId) throw new Error('name the model: --model=<id>');
  // Each provider has its own credit, so its own ledger.
  if (modelId.startsWith('claude-')) {
    if (purpose === 'demo') throw new Error('Claude runs are development and baseline only: never --purpose=demo');
    // Claude credit expires unused: no reserve.
    const credit = Number(process.env.CLAUDE_CREDIT_USD ?? 100);
    return {
      model: claudeModel({ model: modelId, effort: effort ?? DEFAULT_EFFORT.anthropic }),
      ledger: openLedger({ path: '.spend/anthropic.jsonl', creditUsd: credit, reserveUsd: 0, caps: { dev: credit, eval: credit } }),
    };
  }
  if (modelId.startsWith('meta-models/')) {
    // Baseten: a Meta open-weights model, spent on development (Meta's own credit covers the demo).
    const credit = Number(process.env.BASETEN_CREDIT_USD ?? 100);
    const reserve = Number(process.env.BASETEN_RESERVE_USD ?? 0);
    return {
      model: basetenModel({ model: modelId, effort: effort ?? DEFAULT_EFFORT.baseten }),
      ledger: openLedger({ path: '.spend/baseten.jsonl', creditUsd: credit, reserveUsd: reserve, caps: { dev: credit - reserve, eval: credit - reserve } }),
    };
  }
  const host = hostOf(modelId);
  if (host) {
    // Fireworks or Modal: Muse Spark Open per token, each on its own credit and ledger.
    // No default credit: a run without the balance set does not start.
    // Modal Shared Endpoints bill the owner's card, never the plan credit (owner, 2026-11-01:
    // spend no own money): refused outright, whatever is set.
    if (host === 'modal') throw new Error('Modal Shared Endpoints bill the card, not the credit: refused (a Dedicated Endpoint is modal-dedicated:<host>.modal.run)');
    if (host === 'modal-dedicated') {
      dedicatedGate(modelId);
      // The Modal plan credit: the ledger holds its ceiling and the reserve floor, and refuses
      // a setting that would loosen them (or is not a number).
      const ledger = openUptimeLedger({ creditUsd: process.env.MODAL_CREDIT_USD ?? CREDIT_CEILING_USD, reserveUsd: process.env.MODAL_RESERVE_USD ?? RESERVE_FLOOR_USD });
      // E14: Baseten's slowest Muse call was 11 s; 30 s (MODAL_CALL_TIMEOUT_MS) keeps one hung call from eating the reserve.
      const m = hostedModel({ model: modelId, effort: effort ?? DEFAULT_EFFORT['modal-dedicated'], timeoutMs: Number(process.env.MODAL_CALL_TIMEOUT_MS ?? 30_000) });
      // The token goes only to the host pinned when the up window was recorded, and only for
      // the validation or a segment approved with this exact spec after it passed.
      ledger.authorize({ host: dedicatedHost(modelId), segment, spec: spec ?? {} });
      return { model: m, ledger };
    }
    const name = host.toUpperCase();
    // The hackathon credit and the floor kept unspent are fixed here; a setting may only tighten
    // them, and one that is not a number refuses (as for Modal).
    const limits = HOSTED_LIMITS[host];
    const credit = Number(process.env[`${name}_CREDIT_USD`] ?? limits?.ceilingUsd);
    if (!(Number.isFinite(credit) && credit > 0)) throw new Error(`set ${name}_CREDIT_USD (the ${host} credit in USD) before a ${host} run`);
    const reserve = Number(process.env[`${name}_RESERVE_USD`] ?? limits?.floorUsd ?? 0);
    if (!Number.isFinite(reserve)) throw new Error(`${name}_RESERVE_USD must be a number`);
    if (limits && credit > limits.ceilingUsd) throw new Error(`${name}_CREDIT_USD ${credit} is above the ${host} credit ($${limits.ceilingUsd}): refused`);
    if (limits && reserve < limits.floorUsd) throw new Error(`${name}_RESERVE_USD ${reserve} is below the floor ($${limits.floorUsd}): refused`);
    if (reserve >= credit) throw new Error(`${name}_RESERVE_USD must be below ${name}_CREDIT_USD`);
    return {
      model: hostedModel({ model: modelId, effort: effort ?? DEFAULT_EFFORT[host] }),
      ledger: openLedger({ path: `.spend/${host}.jsonl`, creditUsd: credit, reserveUsd: reserve, caps: { dev: credit - reserve, eval: credit - reserve } }),
    };
  }
  // The Meta Model API credit is kept for the demo and judging (owner, 2026-10-31): only a
  // known Meta id with the command-line switch reaches it; a mistyped id is refused.
  metaGate(modelId);
  return { model: metaModel({ model: modelId, reasoningEffort: effort ?? DEFAULT_EFFORT.meta }), ledger: openLedger() };
}

export async function runSession({ brief, briefId = null, expect = null, start = null, model, ledger, purpose, headless = true, overlay = !headless, holdMs = 0, strategy = 'interactive', features = {}, maxTurns = 30, maxUsd = 3, outRoot = 'runs', onEvent = () => {} }) {
  const headroom = ledger.headroom(purpose);
  // Written so a NaN (a bad setting) refuses too.
  if (!(headroom > 0)) throw new Error(`no ${purpose} budget left: ${JSON.stringify(ledger.summary())}`);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const dir = `${outRoot}/${runId}`;
  mkdirSync(dir, { recursive: true });

  const hex = await openHex({ headless });
  let result, verdict, state, checks, harnessError = null;
  try {
    // A brief may start from a saved build (a state object or a share fragment) instead of the starter.
    if (start) {
      const loaded = await hex.call('load', start);
      if (!loaded.ok) throw new Error(`start state did not load: ${loaded.code} ${loaded.message}`);
      await hex.call('settle');
    }
    // look stills: one PNG file each beside the trace (still-<n>.png), the trace keeps the index.
    const saveStill = (e) => {
      if (e.png) writeFileSync(`${dir}/still-${e.stillIndex}.png`, Buffer.from(e.png.replace(/^data:image[/]png;base64,/, ''), 'base64'));
    };
    let events = (e) => {
      saveStill(e);
      onEvent(e);
    };
    if (overlay) {
      await dismissCookies(hex.page);
      await installOverlay(hex.page, { brief, provider: model.provider, model: publicModelId(model.model) });
      events = (e) => {
        saveStill(e);
        onEvent(e);
        pushLines(hex.page, linesFor(e), e.t / 1000);
      };
    }
    result = await runAgent({ hex, model, brief, ledger, purpose, runId, strategy, features, budget: { maxTurns, maxUsd: Math.min(maxUsd, headroom), ...(ledger.runMaxS ? { maxMs: ledger.runMaxS * 1000 } : {}) }, onEvent: events });
    verdict = await verify({ hex, openFresh: () => hex.fresh(), finish: result.finish });
    state = await hex.call('getState');
    checks = expect ? checkBrief(expect, { state, verdict, finish: result.finish, events: result.events }) : null;
    if (overlay) {
      const c = verdict.checks;
      await pushLines(hex.page, [
        ...Object.entries(c).map(([k, v]) => ({ layer: 'code', text: `${k}: ${v}` })),
        { layer: 'code', text: verdict.success ? 'VERIFIED' : 'NOT VERIFIED' },
      ], result.elapsedMs / 1000);
      if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
    }
    await hex.page.screenshot({ path: `${dir}/final.png` });
  } catch (e) {
    // Our own failure, not the model's: keep whatever the run produced.
    harnessError = String(e.stack ?? e).slice(0, 1000);
  } finally {
    await hex.close();
  }
  if (harnessError) {
    writeFileSync(`${dir}/trace.json`, JSON.stringify({ runId, briefId, purpose, provider: model.provider, model: publicModelId(model.model), brief, harnessError, partial: result ?? null }, null, 2) + '\n');
    throw new Error(`harness error (trace kept at ${dir}/trace.json): ${harnessError.split('\n')[0]}`);
  }

  const trace = {
    runId,
    briefId,
    purpose,
    strategy,
    features: result.features,
    effort: model.effort,
    inference: model.kind,
    provider: model.provider,
    // A Dedicated Endpoint's host is kept out of traces (they may be published): only its hash.
    model: publicModelId(model.model),
    ...(model.provider === 'modal-dedicated' ? { endpointHostSha256: createHash('sha256').update(dedicatedHost(model.model)).digest('hex').slice(0, 16) } : {}),
    // The weights as configured on the host (not something the host reports).
    ...(WEIGHTS[model.provider] ? { weights: { ...WEIGHTS[model.provider], basis: 'as configured' } } : {}),
    agent: { ...agentCommit(), promptSha256: result.promptSha256 },
    hexApiVersion: hex.version,
    pageBuild: hex.build ?? null,
    vizCommit: vizCommit(hex.build ?? null),
    origin: hexUrl(),
    // The contract the agent's op table came from; a run is only comparable with runs on the same one.
    contractHash: CONTRACT.hash,
    brief,
    ...(start ? { startSha256: createHash('sha256').update(JSON.stringify(start)).digest('hex') } : {}),
    briefSha256: createHash('sha256').update(brief).digest('hex'),
    stop: result.stop,
    elapsedMs: result.elapsedMs,
    usage: result.usage,
    costSource: COST_SOURCES[model.provider] ?? COST_SOURCES.anthropic,
    opsUsed: result.opsUsed,
    counters: result.counters,
    finish: result.finish,
    forcedFinish: result.forcedFinish,
    verdict: { ...verdict, shareUrl: `${hexUrl().split('#')[0]}#${verdict.fragment}` },
    briefChecks: checks,
    // A64/A63: the agent's own acceptance tests and roles, run on the final build.
    ...(result.features.acceptance ? { acceptance: { requirements: result.requirements ?? [], pushbacks: result.pushbacks, checks: ownChecks({ declared: result.requirements ?? [], roles: result.roles, finish: result.finish, state, verdict }) } } : {}),
    // The final nodes (no opaque detail), so checks can be re-run on the trace later.
    // detail.entry carries what the ref does not: a spike's variant, accessory and facing, a drawer open (E8).
    finalNodes: state.nodes.map((n) => ({ ref: n.ref, family: n.family, at: n.at, stem: n.stem, ...(n.detail ? { detail: n.detail } : {}) })),
    finalStaging: state.staging ? { props: state.staging.props.map((p) => ({ ref: p.ref, id: p.id, posMm: p.posMm, yawDeg: p.yawDeg, pot: p.pot })), soil: state.staging.soil } : null,
    events: result.events,
  };
  writeFileSync(`${dir}/trace.json`, JSON.stringify(trace, null, 2) + '\n');
  return { trace, dir };
}
