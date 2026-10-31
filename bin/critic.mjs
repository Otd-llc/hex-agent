#!/usr/bin/env node
// A56 offline critic over still sheets on disk. Without --judge it calls no
// model: it lists which builds have a full sheet and which the owner judged.
//   node bin/critic.mjs --dir=C:/zzz/_premades/run1031/png [--views=threeQuarter,opposite]
//   node bin/critic.mjs --results=runs/critic-<ts>.json        calibrate saved answers against the owner
//   node bin/critic.mjs --dir=... --judge=claude-haiku-5-5 [--only=a,b]   ask the questions (spends; ledgered)
// Owner verdicts: --round1 (markdown) and --round2 (picks JSON), defaulting to C:/zzz/_premades.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sheetFor, critique, ownerVerdicts, calibrate, claudeJudge, VIEWS } from '../src/critic.mjs';
import { ROOT, openLedger } from '../src/ledger.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const round1 = flag('round1', 'C:/zzz/_premades/picks-round1.md');
const round2 = flag('round2', 'C:/zzz/_premades/picks-round2.json');
const owner = ownerVerdicts({
  round1: existsSync(round1) ? readFileSync(round1, 'utf8') : null,
  round2: existsSync(round2) ? JSON.parse(readFileSync(round2, 'utf8')) : null,
});
const views = String(flag('views', Object.keys(VIEWS).join(','))).split(',');

const report = (results) => {
  for (const [round, verdicts] of Object.entries(owner)) {
    const c = calibrate(results, verdicts);
    console.log(`${round}: ${c.n} judged builds, agreement ${c.agreement == null ? '-' : (c.agreement * 100).toFixed(0) + '%'}, ` +
      `fix flagged ${c.fixFlagged} / missed ${c.fixMissed}, keep flagged ${c.keepFlagged} / passed ${c.keepPassed}, incomplete ${c.incomplete}`);
    for (const [q, p] of Object.entries(c.perQuestion)) console.log(`  ${q}: owner notes ${p.implicated}, caught ${p.caught}, no on a keep ${p.noOnKeep}`);
  }
};

const resultsPath = flag('results', null);
if (resultsPath) {
  report(JSON.parse(readFileSync(resultsPath, 'utf8')).results);
  process.exit(0);
}

const dir = flag('dir', null);
if (!dir) {
  console.error('usage: node bin/critic.mjs --dir=<stills> [--views=...] [--judge=<claude model>] | --results=<file>');
  process.exit(2);
}
const only = flag('only', null)?.split(',');
const names = [...new Set(readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/(-back|-top)?\.png$/, '')))]
  .filter((n) => !only || only.includes(n))
  .sort();
const sheets = names.map((n) => sheetFor(n, dir, { views }));
const complete = sheets.filter((s) => s.complete);
const missing = {};
for (const s of sheets) for (const v of s.missing) missing[v] = (missing[v] ?? 0) + 1;
console.log(`${dir}: ${sheets.length} builds, ${complete.length} with a full sheet (${views.join(', ')})${Object.keys(missing).length ? `; missing ${JSON.stringify(missing)}` : ''}`);
for (const [round, v] of Object.entries(owner)) {
  const judged = names.filter((n) => v.has(n));
  console.log(`${round}: ${v.size} owner verdicts, ${judged.length} on these builds (${judged.filter((n) => v.get(n).verdict !== 'keep').length} fix or drop)`);
}

const judgeModel = flag('judge', null);
if (!judgeModel) process.exit(0);
if (!String(judgeModel).startsWith('claude-')) {
  console.error('--judge takes a claude-* model (the critic is offline evaluation, never the demo)');
  process.exit(2);
}
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { loadEnv } = await import('../src/env.mjs');
const { claudeCostUsd } = await import('../src/claude.mjs');
loadEnv();
const credit = Number(process.env.CLAUDE_CREDIT_USD ?? 100);
const ledger = openLedger({ path: '.spend/anthropic.jsonl', creditUsd: credit, reserveUsd: 0, caps: { dev: credit, eval: credit } });
const maxUsd = Number(flag('max-usd', 2));
let spent = 0;
const judge = claudeJudge({
  client: new Anthropic(),
  model: judgeModel,
  onUsage: (u) => {
    const usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cachedInputTokens: u.cache_read_input_tokens ?? 0, cacheWriteTokens: u.cache_creation_input_tokens ?? 0 };
    const costUsd = claudeCostUsd(judgeModel, usage) ?? 0;
    spent += costUsd;
    ledger.add({ purpose: 'eval', model: judgeModel, provider: 'anthropic', what: 'critic', costUsd, usage });
  },
});
const results = [];
for (const s of complete) {
  if (spent >= maxUsd || ledger.headroom('eval') <= 0) {
    console.log(`stopping: $${spent.toFixed(2)} spent of --max-usd=${maxUsd}`);
    break;
  }
  const r = await critique(s, judge);
  results.push(r);
  console.log(`${s.name}: ${Object.entries(r.answers).map(([q, a]) => `${q} ${a.answer ?? '?'}`).join(', ')}`);
}
mkdirSync(join(ROOT, 'runs'), { recursive: true });
const out = join(ROOT, 'runs', `critic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify({ dir, views, model: judgeModel, spentUsd: spent, results }, null, 2) + '\n');
console.log(`wrote ${out}`);
report(results);
