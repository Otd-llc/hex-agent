// What makes runs comparable: the same provider and model, effort, contract, page
// build and agent commit. Scores are grouped by this key and never pooled across it,
// and a run the budget refused or cut short is not a result at all.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const KEY_FIELDS = ['provider', 'model', 'effort', 'contractHash', 'pageBuild', 'agentCommit', 'prompt', 'arm'];

// Arm: what a suite turned on or off against the default strategy (interactive) and features.
// Read from the summary: the trace carries only some of the flags. '' is the default arm.
const OPT_IN = ['acceptance', 'rolegraph', 'cites'];
export function armOf(summary = {}) {
  const f = summary.features ?? {};
  return [summary.strategy === 'plan' ? 'plan' : null,
    ...OPT_IN.filter((k) => f[k]).map((k) => '+' + k),
    ...Object.keys(f).filter((k) => !OPT_IN.includes(k) && f[k] === false).sort().map((k) => '-' + k)].filter(Boolean).join(' ');
}

export function runKey(trace, summary = {}) {
  const k = {
    provider: trace?.provider ?? summary.provider ?? null,
    model: trace?.model ?? summary.model ?? null,
    effort: trace?.effort ?? summary.effort ?? null,
    contractHash: trace?.contractHash ? String(trace.contractHash).slice(0, 8) : null,
    pageBuild: trace?.pageBuild ?? null,
    agentCommit: trace?.agent?.commit ? trace.agent.commit.slice(0, 7) + (trace.agent.dirty ? '+dirty' : '') : null,
    prompt: trace?.agent?.promptSha256 ? trace.agent.promptSha256.slice(0, 8) : null,
    arm: armOf(summary) || 'default',
  };
  return { key: KEY_FIELDS.map((f) => k[f] ?? '?').join(' | '), fields: k };
}

// A row the budget refused before it began, or stopped part-way (cost or credit).
export const budgetCut = (row, trace = null) => !!row.budget || /^(cost budget|\w+ credit budget)$/.test(String(row.stop ?? trace?.stop ?? ''));
// A row the model host cut short (no answer after the retries): not the model's result either.
export const infraCut = (row, trace = null) => !!row.infra || String(row.stop ?? trace?.stop ?? '') === 'model error';

// A suite's rescores, newest first by rescoredAt: rescore-<grader>.json (one per grader
// commit, never overwritten) and the older single rescore.json, kept as an earlier vintage.
export function rescoreFiles(dir) {
  return readdirSync(dir).filter((f) => /^rescore(-[\w-]+)?\.json$/.test(f))
    .map((file) => ({ file, ...JSON.parse(readFileSync(join(dir, file), 'utf8')) }))
    .sort((a, b) => String(b.rescoredAt).localeCompare(String(a.rescoredAt)));
}

// Every row of the given suite dirs with its trace (null when none was written), its key,
// and its pass as rescored (the newest rescore) when there is one.
export function loadRuns(dirs) {
  const out = [];
  for (const dir of dirs) {
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const re = rescoreFiles(dir)[0];
    const after = re ? new Map(re.rows.map((r) => [`${r.id}#${r.attempt}`, r.after])) : null;
    for (const row of s.rows) {
      const p = row.trace ? join(dir, row.trace) : null;
      const t = p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
      // A trace that is not what its summary says is refused, not counted under it.
      if (t && (t.provider !== s.provider || (t.model && s.model && t.model !== s.model))) throw new Error(`${p}: trace is ${t.provider}/${t.model}, summary says ${s.provider}/${s.model}`);
      const pass = after?.has(`${row.id}#${row.attempt}`) ? after.get(`${row.id}#${row.attempt}`) : row.pass;
      out.push({ dir, row: { ...row, pass }, t, ...runKey(t, s), cut: budgetCut(row, t) || infraCut(row, t), infra: infraCut(row, t) });
    }
  }
  return out;
}
