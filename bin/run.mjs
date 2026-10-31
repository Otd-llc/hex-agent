#!/usr/bin/env node
// Run one brief end to end:
//   node bin/run.mjs "a portable electronics organizer with removable bins and a carry handle"
// Flags: --purpose=dev|eval|demo, --model=<id> (muse-spark-1.3 for dev, muse-wonder-1.0
// otherwise; claude-* for development only), --effort=medium, --max-turns=30, --max-usd=3, --headless
import { loadEnv } from '../src/env.mjs';
import { PURPOSES } from '../src/ledger.mjs';
import { modelFor, runSession } from '../src/session.mjs';

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
  console.error('usage: node bin/run.mjs "<design brief>" [--purpose=dev] [--model=...] [--headless]');
  process.exit(2);
}
const purpose = flag('purpose', 'dev');
if (!PURPOSES.includes(purpose)) {
  console.error(`--purpose must be one of ${PURPOSES.join(', ')}`);
  process.exit(2);
}
const modelId = flag('model', purpose === 'dev' ? 'muse-spark-1.3' : 'muse-wonder-1.0');

let model, ledger;
try {
  ({ model, ledger } = modelFor({ modelId, purpose, effort: flag('effort', undefined) }));
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
console.log(`${model.provider}/${model.model}, ${purpose}, $${ledger.headroom(purpose).toFixed(2)} headroom`);

const { trace, dir } = await runSession({
  brief,
  model,
  ledger,
  purpose,
  headless: !!flag('headless', false),
  // Panel on by default in a visible browser; --overlay=false hides it, --overlay shows it headless (for screenshots).
  overlay: String(flag('overlay', !flag('headless', false))) !== 'false',
  holdMs: Number(flag('hold-ms', flag('headless', false) ? 0 : 10_000)),
  maxTurns: Number(flag('max-turns', 30)),
  maxUsd: Number(flag('max-usd', 3)),
  // --features=acceptance,abstain (A64/A63, A58)
  features: Object.fromEntries(String(flag('features', '') || '').split(',').filter(Boolean).map((f) => [f, true])),
  onEvent: (e) => {
    if (e.type === 'model') console.log(`  [model] turn ${e.turn}: ${e.calls.map((c) => c.name).join(', ') || '(text)'}`);
    if (e.type === 'apply') console.log(`  [hex]   ${e.outcomes.map((o) => (o.ok ? `${o.op.op} ok` : `${o.op.op} ${o.code}`)).join('; ')}${e.rolledBack ? ' (rolled back)' : ''}`);
    if (e.type === 'model_error') console.log(`  [error] ${e.message}`);
  },
});

const v = trace.verdict;
console.log(`\n${v.success ? 'SUCCESS' : 'NOT VERIFIED'}: ${JSON.stringify(v.checks)}`);
console.log(`parts ${v.nodes}, printed ${v.bom.printedInstances}, refusals ${JSON.stringify(trace.counters.refusalCodes)}`);
console.log(`model calls ${trace.usage.calls}, tokens in/out ${trace.usage.inputTokens}/${trace.usage.outputTokens}, cost $${trace.usage.costUsd?.toFixed(4) ?? '?'}`);
console.log(`share: ${v.shareUrl}`);
console.log(`pack:  ${v.bom.pack.url ?? `none (${v.bom.pack.why})`}`);
console.log(`trace: ${dir}/trace.json`);
console.log(`spend: ${JSON.stringify(ledger.summary())}`);
process.exit(v.success ? 0 : 1);
