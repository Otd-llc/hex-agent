// One run end to end: open the configurator, run the agent, verify in code,
// write the trace. Shared by the single-run CLI and the suite.
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { openHex, dismissCookies, hexUrl } from './bridge.mjs';
import { CONTRACT } from './contract.mjs';
import { installOverlay, pushLines, linesFor } from './overlay.mjs';
import { metaModel } from './model.mjs';
import { claudeModel } from './claude.mjs';
import { basetenModel } from './baseten.mjs';
import { openLedger } from './ledger.mjs';
import { runAgent, verify, ownChecks } from './agent.mjs';
import { checkBrief } from './checks.mjs';

// Reasoning effort when none is asked for. Muse Spark Open measured best at low
// (ablation 2026-10-27, EVALUATION.md); the others stay at medium until measured.
export const DEFAULT_EFFORT = { baseten: 'low', anthropic: 'medium', meta: 'medium' };

export function modelFor({ modelId, purpose, effort }) {
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
  return { model: metaModel({ model: modelId, reasoningEffort: effort ?? DEFAULT_EFFORT.meta }), ledger: openLedger() };
}

export async function runSession({ brief, briefId = null, expect = null, start = null, model, ledger, purpose, headless = true, overlay = !headless, holdMs = 0, strategy = 'interactive', features = {}, maxTurns = 30, maxUsd = 3, outRoot = 'runs', onEvent = () => {} }) {
  const headroom = ledger.headroom(purpose);
  if (headroom <= 0) throw new Error(`no ${purpose} budget left: ${JSON.stringify(ledger.summary())}`);
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
    let events = onEvent;
    if (overlay) {
      await dismissCookies(hex.page);
      await installOverlay(hex.page, { brief, provider: model.provider, model: model.model });
      events = (e) => {
        onEvent(e);
        pushLines(hex.page, linesFor(e), e.t / 1000);
      };
    }
    result = await runAgent({ hex, model, brief, ledger, purpose, runId, strategy, features, budget: { maxTurns, maxUsd: Math.min(maxUsd, headroom) }, onEvent: events });
    verdict = await verify({ hex, openFresh: () => hex.fresh(), finish: result.finish });
    state = await hex.call('getState');
    checks = expect ? checkBrief(expect, { state, verdict, finish: result.finish }) : null;
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
    writeFileSync(`${dir}/trace.json`, JSON.stringify({ runId, briefId, purpose, provider: model.provider, model: model.model, brief, harnessError, partial: result ?? null }, null, 2) + '\n');
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
    model: model.model,
    hexApiVersion: hex.version,
    origin: hexUrl(),
    // The contract the agent's op table came from; a run is only comparable with runs on the same one.
    contractHash: CONTRACT.hash,
    brief,
    ...(start ? { startSha256: createHash('sha256').update(JSON.stringify(start)).digest('hex') } : {}),
    briefSha256: createHash('sha256').update(brief).digest('hex'),
    stop: result.stop,
    elapsedMs: result.elapsedMs,
    usage: result.usage,
    costSource: model.provider === 'meta' ? 'https://dev.meta.ai/docs/pricing-rate-limits (Standard mode, 2026-10-27)' : 'Anthropic first-party rates (claude-api skill, cached 2026-10-06)',
    opsUsed: result.opsUsed,
    counters: result.counters,
    finish: result.finish,
    forcedFinish: result.forcedFinish,
    verdict: { ...verdict, shareUrl: `${hexUrl().split('#')[0]}#${verdict.fragment}` },
    briefChecks: checks,
    // A64/A63: the agent's own acceptance tests and roles, run on the final build.
    ...(result.features.acceptance ? { acceptance: { requirements: result.requirements ?? [], pushbacks: result.pushbacks, checks: ownChecks({ declared: result.requirements ?? [], roles: result.roles, finish: result.finish, state, verdict }) } } : {}),
    // The final nodes (no opaque detail), so checks can be re-run on the trace later.
    finalNodes: state.nodes.map((n) => ({ ref: n.ref, family: n.family, at: n.at, stem: n.stem })),
    finalStaging: state.staging ? { props: state.staging.props.map((p) => ({ ref: p.ref, id: p.id, posMm: p.posMm, yawDeg: p.yawDeg, pot: p.pot })), soil: state.staging.soil } : null,
    events: result.events,
  };
  writeFileSync(`${dir}/trace.json`, JSON.stringify(trace, null, 2) + '\n');
  return { trace, dir };
}
