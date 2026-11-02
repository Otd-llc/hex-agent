// One row per runs/suite-* folder, from its summary.json, its traces and its rescore.json:
// when, which provider/model/effort, which contract, page build and agent commit the runs
// actually saw (from the traces, not the summary), which brief sets, and the counts.
// Classes (dev / eval / smoke / dead end) are not guessed here: they come from
// docs/data/suite-classes.json, written by hand against EVALUATION.md.
// Also reconciles every suite run against the spend ledgers (.spend/<provider>.jsonl), by runId.
// Reads runIds and costs only; nothing in a ledger is printed.
// node bin/index-suites.mjs [--json] [--write]   (--write: docs/data/suite-index.{json,md})
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { budgetCut, infraCut } from '../src/runkey.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = join(root, 'runs');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readJsonl = (p) => existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

// briefId -> brief file. The held-out set is read for its ids only, to prove no suite used it.
const briefFile = new Map();
const heldout = new Set();
for (const f of readdirSync(join(root, 'evals')).filter((f) => /^briefs.*\.json$/.test(f))) {
  const j = readJson(join(root, 'evals', f));
  const list = Array.isArray(j) ? j : j.briefs ?? [];
  for (const b of list) {
    if (f === 'briefs-heldout.json') heldout.add(b.id);
    else if (!briefFile.has(b.id)) briefFile.set(b.id, f.replace(/^briefs-?|\.json$/g, '') || 'core');
  }
}

// Agent commit by time, for suites whose traces predate agent.commit: the main commit
// that was HEAD when the suite started (uncommitted work not seen). Shown as ~abc1234.
const mainLog = execSync('git log --first-parent main --format=%h,%cI', { cwd: root, encoding: 'utf8' })
  .trim().split('\n').map((l) => l.split(',')).map(([h, at]) => ({ h, at: Date.parse(at) }));
const headAt = (ms) => mainLog.find((c) => c.at <= ms)?.h ?? null;
const suiteMs = (dir) => Date.parse(dir.slice(6).replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z/, 'T$1:$2:$3.$4Z'));
// Arm: anything that differs from the default strategy (interactive) and features.
const arm = (s) => [s.strategy === 'plan' ? 'plan' : null,
  ...['acceptance', 'rolegraph', 'cites'].filter((f) => s.features?.[f]).map((f) => '+' + f),
  s.features && s.features.abstain === false ? '-abstain' : null].filter(Boolean).join(' ');

const classFile = existsSync(join(root, 'docs/data/suite-classes.json')) ? readJson(join(root, 'docs/data/suite-classes.json')) : { suites: {}, contractEras: [] };
const classes = classFile.suites;
// Contract for suites whose traces predate contractHash: the era it ran in, per EVALUATION.md.
const eraContract = (ms) => classFile.contractEras.find((e) => ms >= Date.parse(e.from) && ms < Date.parse(e.until))?.contract ?? null;
const short = (s, n = 8) => (s ? String(s).slice(0, n) : null);
const uniq = (xs) => [...new Set(xs.filter((x) => x != null))];

const rows = [];
const problems = [];
for (const dir of readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('suite-')).map((d) => d.name).sort()) {
  const p = join(runsDir, dir);
  const sp = join(p, 'summary.json');
  if (!existsSync(sp)) {
    // A folder with run folders but no summary: a suite killed before it wrote one.
    // Its provider comes from the ledger that holds its runIds (below).
    const ids = readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    if (ids.length) problems.push(`${dir}: no summary.json (${ids.length} run folders)`);
    rows.push({ suite: dir, date: dir.slice(6, 22).replace(/T(\d\d)-(\d\d)/, ' $1:$2'), noSummary: true, provider: null, runs: ids.length, passed: 0, costUsd: 0, class: classes[dir]?.class ?? null, classWhy: classes[dir]?.why ?? null, runIds: ids });
    continue;
  }
  const s = readJson(sp);
  const re = join(p, 'rescore.json');
  const resc = existsSync(re) ? new Map(readJson(re).rows.map((r) => [`${r.id}#${r.attempt}`, r])) : null;
  const t = [];
  let passed = 0, rescored = 0, strict = 0, strictKnown = 0, over = 0, infra = 0, budget = 0, errors = 0, cost = 0, calls = 0;
  const runIds = [];
  for (const row of s.rows) {
    const tp = row.trace ? join(p, row.trace) : null;
    const tr = tp && existsSync(tp) ? readJson(tp) : null;
    if (tr) t.push(tr);
    if (tr?.runId) runIds.push(tr.runId);
    else if (row.trace) runIds.push(row.trace.split('/')[0]);
    if (budgetCut(row, tr)) { budget++; continue; }
    if (infraCut(row, tr)) infra++;
    if (row.error) errors++;
    if (row.pass) passed++;
    const r = resc?.get(`${row.id}#${row.attempt}`);
    if ((r ? r.after : row.pass)) rescored++;
    const st = r ? r.strict : row.strict;
    if (st !== undefined) { strictKnown++; if (st) strict++; }
    if (row.overclaimed) over++;
    cost += row.costUsd ?? 0;
    calls += row.calls ?? 0;
  }
  const briefIds = uniq(s.rows.map((r) => r.id));
  const usedHeldout = briefIds.filter((b) => heldout.has(b) && !briefFile.has(b));
  if (usedHeldout.length) problems.push(`${dir}: HELD-OUT briefs ${usedHeldout.join(',')}`);
  const sets = s.briefSets ? s.briefSets.map((b) => b.replace(/^evals\/briefs-?|\.json$/g, '') || 'core') : uniq(briefIds.map((b) => briefFile.get(b) ?? '?'));
  let commits = uniq(t.map((x) => x.agent?.commit ? short(x.agent.commit, 7) + (x.agent.dirty ? '+dirty' : '') : null));
  if (!commits.length) commits = ['~' + headAt(suiteMs(dir))];
  let contract = uniq(t.map((x) => short(x.contractHash)));
  if (!contract.length && eraContract(suiteMs(dir))) contract = ['~' + eraContract(suiteMs(dir))];
  rows.push({
    suite: dir,
    date: dir.slice(6, 22).replace(/T(\d\d)-(\d\d)/, ' $1:$2'),
    provider: s.provider,
    model: String(s.model).replace(/^accounts\/fireworks\/models\/|^meta-models\//, '').replace(/^modal-dedicated:.*/, 'modal-dedicated'),
    purpose: s.purpose,
    effort: s.effort ?? uniq(t.map((x) => x.effort))[0] ?? null,
    strategy: s.strategy ?? uniq(t.map((x) => x.strategy))[0] ?? null,
    origin: uniq(t.map((x) => x.origin ? (/127\.0\.0\.1|localhost/.test(x.origin) ? 'local:' + (x.origin.match(/:(\d+)/)?.[1] ?? '') : 'live') : null)),
    arm: arm(s),
    contract,
    pageBuild: uniq(t.map((x) => x.pageBuild ? x.pageBuild.replace(/^\/assets\/hex-|\.js$/g, '') : null)),
    agentCommit: commits,
    briefSets: sets,
    briefs: briefIds.length,
    runs: s.rows.length,
    passed,
    rescored: resc ? rescored : null,
    strict: strictKnown ? strict : null,
    strictOf: strictKnown,
    overclaimed: over,
    infraCut: infra,
    budgetCut: budget,
    errors,
    calls,
    costUsd: +cost.toFixed(4),
    class: classes[dir]?.class ?? null,
    classWhy: classes[dir]?.why ?? null,
    runIds,
  });
}

// Ledger reconciliation: distinct runIds per provider ledger, and how many sit in a suite.
const ledgers = { anthropic: 'anthropic.jsonl', baseten: 'baseten.jsonl', modal: 'modal-dedicated.jsonl', fireworks: 'fireworks.jsonl' };
const provOf = (p) => (p === 'modal-dedicated' || p === 'modal' ? 'modal' : p);
const recon = {};
const ledgerLines = Object.fromEntries(Object.entries(ledgers).map(([prov, f]) =>
  [prov, readJsonl(join(root, '.spend', f)).filter((l) => l.runId && (prov !== 'modal' || (l.kind ?? 'call') === 'call'))]));
for (const r of rows.filter((x) => x.noSummary)) {
  const hit = Object.entries(ledgerLines).filter(([, ls]) => ls.some((l) => r.runIds.includes(l.runId))).map(([p]) => p);
  r.provider = hit.length === 1 ? hit[0] : null;
  r.costUsd = +(ledgerLines[r.provider] ?? []).filter((l) => r.runIds.includes(l.runId)).reduce((a, l) => a + (l.costUsd ?? 0), 0).toFixed(4);
}
for (const prov of Object.keys(ledgers)) {
  const lines = ledgerLines[prov];
  const ids = new Set(lines.map((l) => l.runId));
  const usd = lines.reduce((a, l) => a + (l.costUsd ?? 0), 0);
  const inSuite = new Set(rows.filter((r) => provOf(r.provider) === prov).flatMap((r) => r.runIds));
  const both = [...ids].filter((id) => inSuite.has(id));
  const suiteOnly = [...inSuite].filter((id) => !ids.has(id));
  const ledgerOnly = [...ids].filter((id) => !inSuite.has(id));
  recon[prov] = { ledgerRuns: ids.size, ledgerCalls: lines.length, ledgerUsd: +usd.toFixed(4), suiteRows: rows.filter((r) => provOf(r.provider) === prov).reduce((a, r) => a + r.runs, 0), suiteRuns: inSuite.size, inBoth: both.length, suiteNoLedger: suiteOnly, ledgerNoSuite: ledgerOnly };
}

const out = { generatedAt: new Date().toISOString(), suites: rows.map(({ runIds, ...r }) => r), reconcile: recon, problems };
const fmt = (a) => (Array.isArray(a) ? a.join(' ') : a ?? '');
const md = [
  '| suite | date (UTC) | provider | model | effort | arm | contract | page | agent | sets | runs | passed | rescored | strict | over | infra | $ | class |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...out.suites.map((r) => r.noSummary ? `| ${r.suite.slice(6)} | ${r.date} | ${r.provider ?? '?'} | (no summary.json) | | | | | | | ${r.runs} | | | | | | ${r.costUsd.toFixed(2)} | ${r.class ?? ''} |`
    : `| ${r.suite.slice(6)} | ${r.date} | ${r.provider} | ${r.model} | ${r.effort ?? ''} | ${r.arm} | ${fmt(r.contract)} | ${fmt(r.pageBuild)} | ${fmt(r.agentCommit)} | ${fmt(r.briefSets)} | ${r.runs} | ${r.passed} | ${r.rescored ?? ''} | ${r.strict ?? ''} | ${r.overclaimed} | ${r.infraCut} | ${r.costUsd.toFixed(2)} | ${r.class ?? ''} |`),
].join('\n');

if (process.argv.includes('--write')) {
  mkdirSync(join(root, 'docs/data'), { recursive: true });
  writeFileSync(join(root, 'docs/data/suite-index.json'), JSON.stringify(out, null, 2) + '\n');
  writeFileSync(join(root, 'docs/data/suite-index.md'), `# Suite index\n\nGenerated by \`node bin/index-suites.mjs --write\`. One row per \`runs/suite-*\` folder. passed = as first scored; rescored = current grader (\`rescore.json\`); strict = the model's own finish reports every requirement met. Budget-cut runs are left out of passed.\n\n${md}\n`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  console.log(md);
  console.log('\nreconcile', JSON.stringify(recon, null, 1));
  if (problems.length) console.log('\nproblems:\n' + problems.join('\n'));
}
