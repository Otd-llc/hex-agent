#!/usr/bin/env node
// Addendum data: Meta Model API spend after the paper gate, from the Meta token ledger
// (.spend/meta.jsonl, not published). The ledger is append-only, so the rows D4's
// reconcile counted are its first PRE_ROWS rows; their sum is checked against D4.
//   node bin/addendum-spend.mjs [--write]   (--write: docs/data/addendum/spend.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson } from './addendum-lib.mjs';

const PRE_ROWS = 8184;
const rowsAll = readFileSync(join(root, '.spend/meta.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sum = (rs) => +rs.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(2);
const pre = rowsAll.slice(0, PRE_ROWS), post = rowsAll.slice(PRE_ROWS);
const group = (rs, f) => { const m = {}; for (const r of rs) { const k = f(r); m[k] = +((m[k] ?? 0) + (r.costUsd ?? 0)).toFixed(4); } return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(2)])); };
const d4 = readJson(join(root, 'docs/data/suite-index.json'));
const out = {
  generatedBy: 'bin/addendum-spend.mjs',
  addendum: 'after the paper gate; not part of the submitted numbers',
  ledger: '.spend/meta.jsonl (not published)',
  creditUsd: 150,
  preGate: { rows: pre.length, usd: sum(pre), lastAt: pre.at(-1)?.at ?? null, d4Reconcile: d4.reconcile?.meta ?? d4.reconcile ?? null },
  postGate: { rows: post.length, usd: sum(post), firstAt: post[0]?.at ?? null, lastAt: post.at(-1)?.at ?? null,
    byPurpose: group(post, (r) => r.purpose ?? 'none'), byModel: group(post, (r) => r.model ?? 'none'), byKind: group(post, (r) => r.what ?? 'agent run') },
  totalUsd: sum(rowsAll),
};
out.leftUsd = +(out.creditUsd - out.totalUsd).toFixed(2);
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/addendum/spend.json'), JSON.stringify(out, null, 2) + '\n');
