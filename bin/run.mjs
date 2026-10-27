#!/usr/bin/env node
// Run one brief end to end:
//   node bin/run.mjs "a portable electronics organizer with removable bins and a carry handle"
// Flags: --headless, --model=muse-wonder-1.0, --effort=medium, --max-turns=30, --max-usd=2
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { openHex, HEX_ORIGIN } from '../src/bridge.mjs';
import { metaModel } from '../src/model.mjs';
import { runAgent, verify } from '../src/agent.mjs';
import { loadEnv } from '../src/env.mjs';

loadEnv();
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const brief = args.filter((a) => !a.startsWith('--')).join(' ').trim();
if (!brief) {
  console.error('usage: node bin/run.mjs "<design brief>" [--headless] [--model=muse-wonder-1.0]');
  process.exit(2);
}

const model = metaModel({ model: flag('model', 'muse-wonder-1.0'), reasoningEffort: flag('effort', 'medium') });
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const dir = `runs/${runId}`;
mkdirSync(dir, { recursive: true });

const hex = await openHex({ headless: !!flag('headless', false) });
console.log(`run ${runId}: ${model.provider}/${model.model} on ${HEX_ORIGIN} (hexAPI v${hex.version})`);

let result, verdict;
try {
  result = await runAgent({
    hex,
    model,
    brief,
    budget: { maxTurns: Number(flag('max-turns', 30)), maxUsd: Number(flag('max-usd', 2)) },
    onEvent: (e) => {
      if (e.type === 'model') console.log(`  [model] turn ${e.turn}: ${e.calls.map((c) => c.name).join(', ') || '(text)'}`);
      if (e.type === 'apply') console.log(`  [hex]   ${e.outcomes.map((o) => (o.ok ? `${o.op.op} ok` : `${o.op.op} ${o.code}`)).join('; ')}${e.rolledBack ? ' (rolled back)' : ''}`);
      if (e.type === 'model_error') console.log(`  [error] ${e.message}`);
    },
  });
  verdict = await verify({ hex, openFresh: () => openHex({ headless: true }), finish: result.finish });
  await hex.page.screenshot({ path: `${dir}/final.png` });
} finally {
  await hex.close();
}

const shareUrl = `${HEX_ORIGIN}/#${verdict.fragment}`;
const trace = {
  runId,
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
  costSource: 'https://dev.meta.ai/docs/pricing-rate-limits (Standard mode, 2026-10-27)',
  opsUsed: result.opsUsed,
  counters: result.counters,
  finish: result.finish,
  verdict: { ...verdict, shareUrl },
  events: result.events,
};
writeFileSync(`${dir}/trace.json`, JSON.stringify(trace, null, 2) + '\n');

console.log(`\n${verdict.success ? 'SUCCESS' : 'NOT VERIFIED'}: ${JSON.stringify(verdict.checks)}`);
console.log(`parts ${verdict.nodes}, printed ${verdict.bom.printedInstances}, refusals ${JSON.stringify(result.counters.refusalCodes)}`);
console.log(`model calls ${result.usage.calls}, tokens in/out ${result.usage.inputTokens}/${result.usage.outputTokens}, cost $${result.usage.costUsd?.toFixed(4) ?? '?'}`);
console.log(`share: ${shareUrl}`);
console.log(`pack:  ${verdict.bom.pack.url ?? `none (${verdict.bom.pack.why})`}`);
console.log(`trace: ${dir}/trace.json`);
process.exit(verdict.success ? 0 : 1);
