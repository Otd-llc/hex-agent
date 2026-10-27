// One run end to end: open the configurator, run the agent, verify in code,
// write the trace. Shared by the single-run CLI and the suite.
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { openHex, HEX_ORIGIN } from './bridge.mjs';
import { metaModel } from './model.mjs';
import { claudeModel } from './claude.mjs';
import { openLedger } from './ledger.mjs';
import { runAgent, verify } from './agent.mjs';
import { checkBrief } from './checks.mjs';

export function modelFor({ modelId, purpose, effort = 'medium' }) {
  const isClaude = modelId.startsWith('claude-');
  if (isClaude && purpose === 'demo') throw new Error('Claude runs are development and baseline only: never --purpose=demo');
  // Each provider has its own credit, so its own ledger. Claude credit expires unused: no reserve.
  const claudeCredit = Number(process.env.CLAUDE_CREDIT_USD ?? 100);
  const ledger = isClaude
    ? openLedger({ path: '.spend/anthropic.jsonl', creditUsd: claudeCredit, reserveUsd: 0, caps: { dev: claudeCredit, eval: claudeCredit } })
    : openLedger();
  const model = isClaude ? claudeModel({ model: modelId, effort }) : metaModel({ model: modelId, reasoningEffort: effort });
  return { model, ledger };
}

export async function runSession({ brief, briefId = null, expect = null, model, ledger, purpose, headless = true, maxTurns = 30, maxUsd = 3, outRoot = 'runs', onEvent = () => {} }) {
  const headroom = ledger.headroom(purpose);
  if (headroom <= 0) throw new Error(`no ${purpose} budget left: ${JSON.stringify(ledger.summary())}`);
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const dir = `${outRoot}/${runId}`;
  mkdirSync(dir, { recursive: true });

  const hex = await openHex({ headless });
  let result, verdict, state, checks;
  try {
    result = await runAgent({ hex, model, brief, ledger, purpose, runId, budget: { maxTurns, maxUsd: Math.min(maxUsd, headroom) }, onEvent });
    verdict = await verify({ hex, openFresh: () => openHex({ headless: true }), finish: result.finish });
    state = await hex.call('getState');
    checks = expect ? checkBrief(expect, { state, verdict, finish: result.finish }) : null;
    await hex.page.screenshot({ path: `${dir}/final.png` });
  } finally {
    await hex.close();
  }

  const trace = {
    runId,
    briefId,
    purpose,
    inference: model.kind,
    provider: model.provider,
    model: model.model,
    hexApiVersion: hex.version,
    origin: HEX_ORIGIN,
    brief,
    briefSha256: createHash('sha256').update(brief).digest('hex'),
    stop: result.stop,
    elapsedMs: result.elapsedMs,
    usage: result.usage,
    costSource: model.provider === 'meta' ? 'https://dev.meta.ai/docs/pricing-rate-limits (Standard mode, 2026-10-27)' : 'Anthropic first-party rates (claude-api skill, cached 2026-10-06)',
    opsUsed: result.opsUsed,
    counters: result.counters,
    finish: result.finish,
    verdict: { ...verdict, shareUrl: `${HEX_ORIGIN}/#${verdict.fragment}` },
    briefChecks: checks,
    events: result.events,
  };
  writeFileSync(`${dir}/trace.json`, JSON.stringify(trace, null, 2) + '\n');
  return { trace, dir };
}
