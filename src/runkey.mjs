// What makes runs comparable: the same provider and model, effort, contract, page
// build and agent commit. Scores are grouped by this key and never pooled across it,
// and a run the budget refused or cut short is not a result at all.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const KEY_FIELDS = ['provider', 'model', 'effort', 'contractHash', 'pageBuild', 'agentCommit'];

export function runKey(trace, summary = {}) {
  const k = {
    provider: trace?.provider ?? summary.provider ?? null,
    model: trace?.model ?? summary.model ?? null,
    effort: trace?.effort ?? summary.effort ?? null,
    contractHash: trace?.contractHash ? String(trace.contractHash).slice(0, 8) : null,
    pageBuild: trace?.pageBuild ?? null,
    agentCommit: trace?.agent?.commit ? trace.agent.commit.slice(0, 7) + (trace.agent.dirty ? '+dirty' : '') : null,
  };
  return { key: KEY_FIELDS.map((f) => k[f] ?? '?').join(' | '), fields: k };
}

// A row the budget refused before it began, or stopped part-way (cost or credit).
export const budgetCut = (row, trace = null) => !!row.budget || /^(cost budget|\w+ credit budget)$/.test(String(row.stop ?? trace?.stop ?? ''));
// A row the model host cut short (no answer after the retries): not the model's result either.
export const infraCut = (row, trace = null) => !!row.infra || String(row.stop ?? trace?.stop ?? '') === 'model error';

// Every row of the given suite dirs with its trace (null when none was written), its key,
// and its pass as rescored (rescore.json) when there is one.
export function loadRuns(dirs) {
  const out = [];
  for (const dir of dirs) {
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const re = join(dir, 'rescore.json');
    const after = existsSync(re) ? new Map(JSON.parse(readFileSync(re, 'utf8')).rows.map((r) => [`${r.id}#${r.attempt}`, r.after])) : null;
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
