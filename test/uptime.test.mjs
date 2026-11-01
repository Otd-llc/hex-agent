import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openUptimeLedger, B300_USD_PER_S, hasZone } from '../src/uptime.mjs';
import { hostedModel, hostOf, hostedCostUsd, dedicatedHost, publicModelId } from '../src/hosted.mjs';
import { modelFor } from '../src/session.mjs';
import { loadEnv, heldFromEnvFile } from '../src/env.mjs';
import { timedPost, requestsInFlight } from '../src/http.mjs';
import { vizCommit } from '../src/provenance.mjs';
import { validationChecks, validationPassed } from '../src/modal-checks.mjs';
import { tally, groups } from '../bin/tally.mjs';

const at = (iso) => Date.parse(iso);
const tmp = () => mkdtempSync(join(tmpdir(), 'uptime-'));
const fresh = (clock, opts = {}) => openUptimeLedger({ path: join(tmp(), 'u.jsonl'), creditUsd: 130, reserveUsd: 5, runMaxS: 600, now: () => clock.t, ...opts });
const RATE = 4 * B300_USD_PER_S;

test('uptime: no open window, no headroom; the cold start bills from up-at', () => {
  const clock = { t: at('2026-11-02T00:20:00Z') };
  const l = fresh(clock);
  assert.equal(l.headroom('eval'), 0);
  l.start({ host: 'muse.modal.run', maxReplicas: 1, upAt: '2026-11-02T00:00:00Z' });
  assert.ok(Math.abs(l.spent() - 1200 * RATE) < 1e-9, '20 min of 4 GPUs');
  assert.ok(Math.abs(l.headroom('eval') - (125 - 1200 * RATE - 600 * RATE)) < 1e-9, 'cap less spent less the longest run');
  assert.throws(() => l.start({ host: 'x.modal.run', maxReplicas: 1 }), /already open/);
});

test('uptime: max replicas must be 1, and times must name their zone', () => {
  const l = fresh({ t: at('2026-11-02T00:00:00Z') });
  assert.throws(() => l.start({ host: 'h.modal.run' }), /max replicas must be 1/);
  assert.throws(() => l.start({ host: 'h.modal.run', maxReplicas: 2 }), /max replicas must be 1/);
  assert.throws(() => l.start({ host: 'h.modal.run', maxReplicas: 1, upAt: '2026-11-02T00:00:00' }), /no timezone/);
  assert.ok(hasZone('2026-11-02T00:00:00-05:00') && hasZone('2026-11-02T05:00:00Z') && !hasZone('2026-11-02 00:00'));
  l.start({ host: 'h.modal.run', maxReplicas: 1, upAt: '2026-11-01T19:00:00-05:00' });
  assert.equal(l.windows()[0].start, at('2026-11-02T00:00:00Z'));
  assert.throws(() => l.stop({ downAt: '2026-11-02T01:00:00' }), /no timezone/);
});

test('uptime: a run is refused once the window carried through the longest run crosses the cap', () => {
  const clock = { t: at('2026-11-02T00:00:00Z') };
  const l = fresh(clock);
  l.start({ host: 'h.modal.run', maxReplicas: 1 });
  const edge = 125 / RATE - 600;
  clock.t += (edge - 1) * 1000;
  assert.ok(l.headroom('eval') > 0);
  clock.t += 2000;
  assert.ok(l.headroom('eval') <= 0);
  assert.ok(l.headroom('demo') > 0, 'demo may use the reserve');
});

test('uptime: stop closes the window, calls are info only, reconcile records the billed figure', () => {
  const clock = { t: at('2026-11-02T00:00:00Z') };
  const l = fresh(clock);
  l.start({ host: 'h.modal.run', maxReplicas: 1, configShot: 'shots/endpoint.png' });
  clock.t += 3600 * 1000;
  l.add({ runId: 'r', purpose: 'eval', costUsd: 0.05, inputTokens: 1 });
  assert.throws(() => l.reconcile({ billedUsd: 30, source: 'usage page' }), /still open/);
  l.stop();
  const hour = l.spent();
  assert.ok(Math.abs(hour - 3600 * RATE) < 1e-9);
  clock.t += 3600 * 1000;
  assert.equal(l.spent(), hour, 'nothing bills while down');
  assert.equal(l.headroom('eval'), 0, 'and nothing runs');
  assert.throws(() => l.reconcile({ billedUsd: 30 }), /source/);
  const s = l.reconcile({ billedUsd: 29, source: 'modal.com usage page 2026-11-02' });
  assert.equal(s.reconciled[0].billedUsd, 29);
  assert.ok(Math.abs(s.reconciled[0].diffUsd - (29 - hour)) < 1e-3);
  const lines = readFileSync(l.path, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.deepEqual(lines.map((x) => x.kind), ['start', 'call', 'stop', 'reconcile']);
  assert.equal(lines[0].maxReplicas, 1);
  assert.equal(lines[0].configShot, 'shots/endpoint.png');
  assert.equal(lines[1].tokenCostUsd, 0.05);
  assert.ok(!('costUsd' in lines[1]));
  assert.throws(() => l.stop(), /no window/);
});

test('dedicated hosts: *.modal.run only; the Shared router and other hosts refused; ids redacted', () => {
  assert.equal(dedicatedHost('modal-dedicated:https://OTD--muse.modal.run/v1/'), 'otd--muse.modal.run');
  assert.throws(() => dedicatedHost('modal-dedicated:m.us-west.modal.direct'), /Shared Endpoint/);
  for (const h of ['evil.com', 'modal.run.evil.com', 'x.modal.run.evil.com', 'x.modal.run/../evil', 'a b.modal.run']) {
    assert.throws(() => dedicatedHost(`modal-dedicated:${h}`), /not a Modal Dedicated Endpoint host/, h);
  }
  assert.equal(publicModelId('modal-dedicated:otd--muse.modal.run'), 'modal-dedicated:[endpoint host redacted]');
  assert.equal(publicModelId('meta-models/muse-spark-open-1026'), 'meta-models/muse-spark-open-1026');
});

test('modal-dedicated adapter: its host as base, the weights as model, proxy token only, each call timed', async () => {
  const seen = [];
  const reply = { ok: true, status: 200, text: async () => JSON.stringify({ id: 'r', model: 'served-name', choices: [{ message: { role: 'assistant', content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) };
  const f = async (url, init) => (seen.push({ url, init, inFlight: requestsInFlight() }), reply);
  assert.equal(hostOf('modal-dedicated:x.modal.run'), 'modal-dedicated');
  const m = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', effort: 'low', fetchImpl: f, env: {} });
  const r = await m.next({ instructions: 's', items: [{ role: 'user', content: 'b' }], tools: [] });
  assert.equal(seen[0].url, 'https://otd--muse.modal.run/v1/chat/completions');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4');
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer pt');
  assert.ok(!('Modal-Key' in seen[0].init.headers));
  assert.equal(r.servedBy, 'served-name');
  assert.equal(r.http.status, 200);
  assert.equal(r.http.inFlight, 1);
  assert.ok(r.http.startedAt && r.http.endedAt && r.http.ms >= 0);
  assert.equal(r.params.reasoningEffort, 'low');
  assert.equal(r.params.maxCompletionTokens, 16000);
  assert.equal(requestsInFlight(), 0);
  // Modal's account-token names in the environment: refused before any request.
  assert.throws(() => hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', env: { MODAL_TOKEN_ID: 'ak-1' } }), /MODAL_TOKEN_ID/);
  assert.throws(() => hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', env: { MODAL_TOKEN_SECRET: 'as-1' } }), /MODAL_TOKEN_ID/);
  assert.throws(() => hostedModel({ model: 'modal-dedicated:evil.com', apiKey: 'pt', env: {} }), /not a Modal Dedicated/);
  assert.ok(hostedCostUsd('modal-dedicated:h.modal.run', { inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0 }) > 0, 'token cost kept for the trace');
  // A failed request still records its timing and status.
  const bad = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'cold' }), env: {} });
  await assert.rejects(bad.next({ instructions: 's', items: [], tools: [] }), (e) => e.status === 503 && e.http.status === 503);
  const p = await bad.probe();
  assert.equal(p.ok, false);
  assert.equal(p.status, 503);
});

test('timedPost: in-flight counts concurrent requests', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const f = async () => (await gate, { ok: true, status: 200, text: async () => '{}' });
  const a = timedPost(f, 'u', { headers: {}, body: {}, timeoutMs: 1000 });
  const b = timedPost(f, 'u', { headers: {}, body: {}, timeoutMs: 1000 });
  assert.equal(requestsInFlight(), 2);
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.deepEqual([ra.http.inFlight, rb.http.inFlight], [1, 2]);
  assert.equal(requestsInFlight(), 0);
});

test('modelFor: modal-dedicated needs the command-line flag, no .env flag, the credit, an up window pinned to its host', () => {
  const saved = { ...process.env };
  const dir = tmp();
  try {
    Object.assign(process.env, { MODAL_PROXY_TOKEN: 't', MODAL_CREDIT_USD: '130', MODAL_RESERVE_USD: '5', MODAL_UPTIME_LEDGER: join(dir, 'u.jsonl') });
    delete process.env.MODAL_DEDICATED_ALLOWED;
    delete process.env.MODAL_TOKEN_ID;
    delete process.env.MODAL_TOKEN_SECRET;
    const id = 'modal-dedicated:h.modal.run';
    assert.throws(() => modelFor({ modelId: id, purpose: 'eval' }), /Dedicated runs are off/);
    // The old shared switch does not open the dedicated path.
    process.env.MODAL_ALLOWED = '1';
    assert.throws(() => modelFor({ modelId: id, purpose: 'eval' }), /Dedicated runs are off/);
    process.env.MODAL_DEDICATED_ALLOWED = '1';
    assert.throws(() => modelFor({ modelId: id, purpose: 'eval' }), /no Modal up window/);
    const l = openUptimeLedger({ creditUsd: 130, reserveUsd: 5 });
    l.start({ host: 'other.modal.run', maxReplicas: 1 });
    assert.throws(() => modelFor({ modelId: id, purpose: 'eval' }), /pinned to other\.modal\.run/);
    l.stop();
    l.start({ host: 'h.modal.run', maxReplicas: 1 });
    const { model, ledger } = modelFor({ modelId: id, purpose: 'eval' });
    assert.equal(model.provider, 'modal-dedicated');
    assert.equal(model.effort, 'low', 'same effort as Baseten');
    assert.equal(ledger.kind, 'uptime');
    assert.ok(ledger.headroom('eval') > 0);
    process.env.MODAL_TOKEN_ID = 'ak';
    assert.throws(() => modelFor({ modelId: id, purpose: 'eval' }), /MODAL_TOKEN_ID/);
    delete process.env.MODAL_TOKEN_ID;
    assert.throws(() => modelFor({ modelId: 'modal-dedicated:x.us-west.modal.direct', purpose: 'eval' }), /Shared Endpoint/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('env: MODAL_DEDICATED_ALLOWED in .env is not loaded, and the dedicated gate refuses', () => {
  const saved = { ...process.env };
  const dir = tmp();
  try {
    delete process.env.MODAL_DEDICATED_ALLOWED;
    writeFileSync(join(dir, '.env'), 'MODAL_DEDICATED_ALLOWED=1\nSOME_TEST_KEY=v\n');
    loadEnv(join(dir, '.env'));
    assert.equal(process.env.MODAL_DEDICATED_ALLOWED, undefined);
    assert.equal(process.env.SOME_TEST_KEY, 'v');
    assert.ok(heldFromEnvFile.has('MODAL_DEDICATED_ALLOWED'));
    process.env.MODAL_DEDICATED_ALLOWED = '1';
    assert.throws(() => modelFor({ modelId: 'modal-dedicated:h.modal.run', purpose: 'eval' }), /is in \.env/);
  } finally {
    heldFromEnvFile.delete('MODAL_DEDICATED_ALLOWED');
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('provenance: the viz commit from lane 1\'s newest live note, and whether its pageBuild matches', () => {
  const p = join(tmp(), 'notes.jsonl');
  writeFileSync(p, [
    JSON.stringify({ kind: 'channel' }),
    JSON.stringify({ kind: 'live', viz: 'aaa', at: '1', pageBuild: '/assets/hex-A.js' }),
    'not json',
    JSON.stringify({ kind: 'live', viz: 'bbb', at: '2', pageBuild: '/assets/hex-B.js' }),
  ].join('\n'));
  assert.deepEqual(vizCommit('/assets/hex-B.js', p), { commit: 'bbb', source: 'lane 1 live note 2', notePageBuild: '/assets/hex-B.js', pageBuildMatches: true });
  assert.equal(vizCommit('/assets/hex-A.js', p).pageBuildMatches, false);
  assert.equal(vizCommit('x', join(tmp(), 'none.jsonl')).commit, null);
});

// A suite dir on disk with one row per given trace.
function suiteDir(provider, model, rows) {
  const dir = tmp();
  for (const r of rows) {
    if (!r.trace) continue;
    mkdirSync(join(dir, r.id + r.attempt), { recursive: true });
    writeFileSync(join(dir, r.id + r.attempt, 'trace.json'), JSON.stringify({ provider, model, ...r.t }));
    r.trace = `${r.id + r.attempt}/trace.json`;
  }
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ provider, model, rows: rows.map(({ t, ...row }) => row) }));
  return dir;
}

test('tally: grouped by provider + model; budget-refused and budget-stopped runs left out of completed and passed', () => {
  const apply = (code, tryInstead, next, nextOk) => [
    { type: 'apply', ops: [{ op: 'x' }], outcomes: [{ ok: false, code, details: tryInstead ? { tryInstead } : {} }] },
    { type: 'apply', ops: [next], outcomes: [{ ok: nextOk }] },
  ];
  const ti = { op: 'place', at: { q: 0, r: 0, level: 1 }, variant: 'half-n' };
  const a = suiteDir('baseten', 'meta-models/muse-spark-open-1026', [
    { id: 'b1', attempt: 1, pass: true, trace: true, t: { events: apply('KIND_MISMATCH_BELOW', ti, { variant: 'half-n', at: { level: 1, r: 0, q: 0 }, op: 'place' }, true), verdict: { validation: { issues: [{ code: 'PROP_INSIDE' }] } } } },
    { id: 'b2', attempt: 1, pass: false, overclaimed: true, trace: true, t: { events: apply('PROP_NO_REST', null, { op: 'y' }, false) } },
    { id: 'b3', attempt: 1, pass: false, error: 'no eval budget left: {}', budget: 'refused' },
    { id: 'b4', attempt: 1, pass: false, stop: 'eval credit budget', budget: 'stopped', trace: true, t: { events: [] } },
  ]);
  const b = suiteDir('anthropic', 'claude-opus-5-5', [{ id: 'c1', attempt: 1, pass: true, trace: true, t: { events: [] } }]);
  const g = groups([a, b]);
  assert.deepEqual([...g.keys()], ['baseten/meta-models/muse-spark-open-1026', 'anthropic/claude-opus-5-5']);
  const r = tally(g.get('baseten/meta-models/muse-spark-open-1026'));
  assert.deepEqual({ attempted: r.attempted, completed: r.completed, passed: r.passed, budgetExcluded: r.budgetExcluded, overclaimed: r.overclaimed }, { attempted: 4, completed: 2, passed: 1, budgetExcluded: 2, overclaimed: 1 });
  assert.deepEqual(r.codes.KIND_MISMATCH_BELOW, { refused: 1, withTry: 1, sentNext: 1, nextOk: 1 });
  assert.deepEqual(r.codes.PROP_NO_REST, { refused: 1, withTry: 0, sentNext: 0, nextOk: 0 });
  assert.deepEqual(r.issues, { PROP_INSIDE: 1 });
  // A trace that is not what its summary says is refused, not counted.
  const c = suiteDir('baseten', 'meta-models/muse-spark-open-1026', [{ id: 'x', attempt: 1, pass: true, trace: true, t: { events: [] } }]);
  writeFileSync(join(c, 'x1', 'trace.json'), JSON.stringify({ provider: 'anthropic', model: 'claude-opus-5-5', events: [] }));
  assert.throws(() => groups([c]), /summary says/);
});

test('validation checks: pass, recovered errors allowed, servedBy, pageBuild, three-storey tryInstead', () => {
  const note = { pageBuild: '/assets/hex-B.js', viz: 'bbb' };
  const model = { type: 'model', servedBy: 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4' };
  const good = (extra = []) => ({ pageBuild: '/assets/hex-B.js', events: [{ type: 'model_error', retrying: true }, model, ...extra] });
  const refusal = [{ type: 'apply', ops: [{}], outcomes: [{ ok: false, code: 'KIND_MISMATCH_BELOW', details: { tryInstead: { op: 'place' } } }] }];
  const dir = suiteDir('modal-dedicated', 'modal-dedicated:[endpoint host redacted]', [
    { id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: good() },
    { id: 'three-storey', attempt: 1, pass: true, trace: true, t: good(refusal) },
  ]);
  const ok = validationChecks(join(dir, 'summary.json'), note);
  assert.ok(ok.every((c) => c.ok), JSON.stringify(ok.filter((c) => !c.ok)));
  const bad = suiteDir('modal-dedicated', 'modal-dedicated:[endpoint host redacted]', [
    { id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: { pageBuild: '/assets/hex-A.js', events: [{ type: 'model_error', retrying: false }, { type: 'model', servedBy: null }] } },
    { id: 'three-storey', attempt: 1, pass: false, trace: true, t: good() },
  ]);
  const failed = validationChecks(join(bad, 'summary.json'), note).filter((c) => !c.ok).map((c) => c.check);
  assert.deepEqual(failed, ['minimal-bin no unrecovered model error', 'minimal-bin servedBy', 'minimal-bin pageBuild = lane 1 live note', 'three-storey passed', 'three-storey refusal with tryInstead']);
  assert.deepEqual(validationChecks(null, note), [{ check: 'summary written', ok: false }]);
  assert.equal(validationPassed(validationChecks(null, note)), false);
  // three-storey failing its brief is reported, not gated; minimal-bin failing is gated.
  const t3fail = suiteDir('modal-dedicated', 'modal-dedicated:[endpoint host redacted]', [
    { id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: good() },
    { id: 'three-storey', attempt: 1, pass: false, trace: true, t: good(refusal) },
  ]);
  const c3 = validationChecks(join(t3fail, 'summary.json'), note);
  assert.deepEqual(c3.filter((c) => !c.ok).map((c) => [c.check, c.gate]), [['three-storey passed', false]]);
  assert.equal(validationPassed(c3), true);
  const mbfail = suiteDir('modal-dedicated', 'modal-dedicated:[endpoint host redacted]', [
    { id: 'minimal-bin', attempt: 1, pass: false, trace: true, t: good() },
    { id: 'three-storey', attempt: 1, pass: true, trace: true, t: good(refusal) },
  ]);
  assert.equal(validationPassed(validationChecks(join(mbfail, 'summary.json'), note)), false);
  assert.equal(validationPassed(ok), true);
  assert.equal(validationPassed(validationChecks(join(bad, 'summary.json'), note)), false);
});
