#!/usr/bin/env node
// A Meta Muse model as the demo-run reviewer: the same 41 runs the Claude reviewer
// agents judged in D8 (docs/data/demo-review.json; host cuts have no build), each
// sent as its brief, the agent's own requirement report and its three stills.
// The answer is a verdict on D8's scale and the claims the images contradict.
// Offline evaluation only (purpose eval, Meta ledger); never part of a run.
//   META_API_ALLOWED=1 node bin/meta-review.mjs --model=muse-wonder-1.0 [--effort=medium] [--concurrency=4] [--max-usd=10] [--only=id,id]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, openLedger } from '../src/ledger.mjs';
import { loadEnv } from '../src/env.mjs';
import { metaGate } from '../src/session.mjs';
import { META_BASE, costUsd, parseResponse } from '../src/model.mjs';
import { timedPost } from '../src/http.mjs';

const flag = (name, dflt) => {
  const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const model = flag('model', 'muse-wonder-1.0');
const effort = flag('effort', 'medium');
const maxUsd = Number(flag('max-usd', 10));
const workers = Math.max(1, Number(flag('concurrency', 4)));
const only = flag('only', null)?.split(',');
loadEnv();
metaGate(model);
const apiKey = process.env.MODEL_API_KEY;
if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
const ledger = openLedger();

const d8 = JSON.parse(readFileSync(join(ROOT, 'docs/data/demo-review.json'), 'utf8'));
const ids = Object.keys(d8).filter((k) => k !== 'summary' && d8[k].verdict !== 'HOST CUT' && (!only || only.includes(k)));
// Every run folder is runs/suite-*/<ts>-<id>.
const runDirs = new Map();
for (const s of readdirSync(join(ROOT, 'runs'), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('suite-'))) {
  const sd = join(ROOT, 'runs', s.name);
  for (const r of readdirSync(sd, { withFileTypes: true })) if (r.isDirectory()) runDirs.set(r.name.slice(-8), join(sd, r.name));
}

export const SCALE = ['KEEP', 'KEEP WITH NOTE', 'DROP'];
const ASK = `You review a build an AI agent made in a modular 3D-printed parts configurator, for a demo video.
Above: the brief it was given, the report it gave (each requirement with its status and evidence), and still views of the finished build.
Judge from the images. Look for any requirement the report calls met that the images contradict or do not show, anything placed somewhere the report does not say (an object on a drawer rim instead of inside, an item turned the wrong way, a row or drawers facing away from the viewer), and anything floating or unexplained.
Reply with JSON only: {"verdict": "KEEP" | "KEEP WITH NOTE" | "DROP", "contradicted": [requirement text the images contradict], "notes": "one or two sentences"}.
KEEP: the build and its report match and it reads well on camera. KEEP WITH NOTE: usable, with a flaw worth saying. DROP: a claim the images contradict, or the build reads wrong on camera.`;

const img = (p) => ({ type: 'input_image', image_url: `data:image/png;base64,${readFileSync(p).toString('base64')}` });
let spent = 0;
async function review(id) {
  const dir = runDirs.get(id);
  if (!dir) return { id, error: 'run folder not found' };
  const t = JSON.parse(readFileSync(join(dir, 'trace.json'), 'utf8'));
  const stills = ['final.png', 'still-0.png', 'still-1.png'].map((f) => join(dir, f)).filter(existsSync);
  const report = (t.finish?.requirements ?? []).map((r) => `- [${r.status}] ${r.requirement}${r.evidence ? ` (evidence: ${r.evidence})` : ''}`).join('\n');
  const content = [
    { type: 'input_text', text: `Brief:\n${t.brief}\n\nAgent's report (outcome ${t.finish?.outcome ?? 'built'}):\n${report || '(none)'}\n\nStill views:` },
    ...stills.map(img),
    { type: 'input_text', text: ASK },
  ];
  const body = { model, input: [{ role: 'user', content }], reasoning: { effort } };
  for (let attempt = 1; ; attempt++) {
    if (spent >= maxUsd) return { id, error: 'budget' };
    try {
      const { res, raw, http } = await timedPost(fetch, `${META_BASE}/responses`, { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body, timeoutMs: 180_000 });
      if (!res.ok) throw Object.assign(new Error(`Meta API ${res.status}: ${raw.slice(0, 300)}`), { status: res.status });
      const r = parseResponse(JSON.parse(raw));
      const c = costUsd(model, r.usage);
      spent += c;
      ledger.add({ purpose: 'eval', model, provider: 'meta', what: 'demo-review', runId: t.runId, costUsd: c, usage: r.usage, servedBy: r.servedBy, ms: http.ms });
      const m = r.text.match(/\{[\s\S]*\}/);
      let parsed = null;
      try { parsed = m ? JSON.parse(m[0]) : null; } catch {}
      const verdict = SCALE.find((v) => v === String(parsed?.verdict ?? '').toUpperCase().trim()) ?? null;
      return { id, runId: t.runId, stills: stills.length, verdict, contradicted: parsed?.contradicted ?? null, notes: parsed?.notes ?? null, raw: verdict ? undefined : r.text, d8: d8[id].verdict };
    } catch (e) {
      const transient = e.status == null || [408, 409, 429, 500, 502, 503, 504].includes(e.status);
      if (!transient || attempt >= 3) return { id, error: String(e.message ?? e) };
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

const todo = [...ids];
const results = [];
await Promise.all(Array.from({ length: workers }, async () => {
  while (todo.length) {
    const r = await review(todo.shift());
    results.push(r);
    console.log(`${r.id}: muse ${r.verdict ?? r.error ?? '?'} / D8 ${r.d8 ?? '-'}`);
  }
}));
mkdirSync(join(ROOT, 'runs'), { recursive: true });
const out = join(ROOT, 'runs', `meta-review-${model}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(out, JSON.stringify({ model, effort, spentUsd: spent, prompt: ASK, results: results.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + '\n');
const drop = (v) => v === 'DROP';
const done = results.filter((r) => r.verdict);
console.log(`wrote ${out}: ${done.length}/${ids.length} answered, drop agreement ${done.filter((r) => drop(r.verdict) === drop(r.d8)).length}/${done.length}, $${spent.toFixed(2)}`);
