import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openUptimeLedger, B300_USD_PER_S, hasZone, IDLE_S, DELETE_LAG_S, VALIDATE_SPEC, canonSpec, specSha } from '../src/uptime.mjs';
import { hostedModel, hostOf, hostedCostUsd, dedicatedHost, publicModelId, hostLabel, redactHost } from '../src/hosted.mjs';
import { modelFor } from '../src/session.mjs';
import { loadEnv, heldFromEnvFile } from '../src/env.mjs';
import { timedPost, requestsInFlight } from '../src/http.mjs';
import { vizCommit } from '../src/provenance.mjs';
import { validationChecks, validationPassed, warmup } from '../src/modal-checks.mjs';
import { runKey, budgetCut, loadRuns } from '../src/runkey.mjs';
import { tally, groups } from '../bin/tally.mjs';

const at = (iso) => Date.parse(iso);
const tmp = () => mkdtempSync(join(tmpdir(), 'uptime-'));
const fresh = (clock, opts = {}) => openUptimeLedger({ path: join(tmp(), 'u.jsonl'), creditUsd: 130, reserveUsd: 5, runMaxS: 600, now: () => clock.t, ...opts });
const RATE = 4 * B300_USD_PER_S;
const TAIL = 600 + IDLE_S + DELETE_LAG_S;
const up = (l, host = 'h.modal.run', o = {}) => l.start({ host, maxReplicas: 1, idleMin: 15, ...o });

test('uptime: no open window, no headroom; the cold start bills from up-at; new work stops before the tail crosses the cap', () => {
  const clock = { t: at('2026-11-02T00:20:00Z') };
  const l = fresh(clock);
  assert.equal(l.headroom(), 0);
  up(l, 'muse.modal.run', { upAt: '2026-11-02T00:00:00Z' });
  assert.ok(Math.abs(l.spent() - 1200 * RATE) < 1e-9, '20 min of 4 GPUs');
  assert.ok(Math.abs(l.headroom() - (125 - 1200 * RATE - TAIL * RATE)) < 1e-9, 'cap less spent less the last run, the idle 15 min and the delete');
  assert.throws(() => up(l, 'x.modal.run'), /already open/);
  // The last run can start at about $110.8 spent (125 - 30 min at $28.40/h): the tail then lands at the cap.
  const edge = 125 / RATE - TAIL;
  clock.t = at('2026-11-02T00:00:00Z') + (edge - 1) * 1000;
  assert.ok(l.headroom() > 0);
  clock.t += 2000;
  assert.ok(!(l.headroom() > 0));
  assert.ok(Math.abs(l.spent() - (125 - TAIL * RATE)) < 0.01);
  assert.ok(!(l.headroom('demo') > 0), 'demo has no way past it either');
});

test('uptime: the ceiling, the floor and the bounds refuse loosening or bad numbers', () => {
  const path = join(tmp(), 'u.jsonl');
  const o = (x) => () => openUptimeLedger({ path, creditUsd: 130, reserveUsd: 5, runMaxS: 600, ...x });
  assert.throws(o({ creditUsd: 131 }), /above the Modal credit/);
  assert.throws(o({ creditUsd: 1e9 }), /above the Modal credit/);
  assert.throws(o({ reserveUsd: 4.99 }), /below the floor/);
  assert.throws(o({ reserveUsd: 0 }), /below the floor/);
  assert.throws(o({ reserveUsd: -5 }), /below the floor/);
  for (const bad of [NaN, 'x', Infinity, null]) {
    assert.throws(o({ creditUsd: bad }), /must be a number|above/);
    assert.throws(o({ reserveUsd: bad }), /must be a number|below/);
    assert.throws(o({ runMaxS: bad }), /must be a number|runMaxS/);
  }
  assert.throws(o({ creditUsd: undefined }), /must be a number/);
  // Unset reserve and run length take the floor and the default, never zero.
  assert.equal(o({ reserveUsd: undefined })().reserveUsd, 5);
  assert.throws(o({ creditUsd: 0 }), /above 0/);
  assert.throws(o({ creditUsd: -1 }), /above 0/);
  assert.throws(o({ runMaxS: 0 }), /runMaxS/);
  assert.throws(o({ runMaxS: 59 }), /runMaxS/);
  assert.throws(o({ runMaxS: 1801 }), /runMaxS/);
  assert.ok(o({ creditUsd: 100, reserveUsd: 20 })(), 'tightening is fine');
  const l = openUptimeLedger({ path, creditUsd: '130', reserveUsd: '5' });
  for (const g of [0, 3, 5, NaN, -4]) assert.throws(() => l.start({ host: 'h.modal.run', gpus: g, maxReplicas: 1, idleMin: 15 }), /gpus/);
});

test('uptime: max replicas must be 1, idle 15 min, and times must name their zone', () => {
  const l = fresh({ t: at('2026-11-02T00:00:00Z') });
  assert.throws(() => l.start({ host: 'h.modal.run', idleMin: 15 }), /max replicas must be 1/);
  assert.throws(() => l.start({ host: 'h.modal.run', maxReplicas: 2, idleMin: 15 }), /max replicas must be 1/);
  assert.throws(() => l.start({ host: 'h.modal.run', maxReplicas: 1 }), /idle timeout must be 15/);
  assert.throws(() => l.start({ host: 'h.modal.run', maxReplicas: 1, idleMin: 30 }), /idle timeout must be 15/);
  assert.throws(() => up(l, 'h.modal.run', { upAt: '2026-11-02T00:00:00' }), /no timezone/);
  assert.ok(hasZone('2026-11-02T00:00:00-05:00') && hasZone('2026-11-02T05:00:00Z') && !hasZone('2026-11-02 00:00'));
  up(l, 'h.modal.run', { upAt: '2026-11-01T19:00:00-05:00' });
  assert.equal(l.windows()[0].start, at('2026-11-02T00:00:00Z'));
  assert.equal(l.windows()[0].idleS, IDLE_S);
  assert.throws(() => l.stop({ downAt: '2026-11-02T01:00:00' }), /no timezone/);
});

test('uptime: stop closes the window, calls are info only, reconcile records the billed figure', () => {
  const clock = { t: at('2026-11-02T00:00:00Z') };
  const l = fresh(clock);
  up(l, 'h.modal.run', { configShot: '.spend/endpoint.png' });
  clock.t += 3600 * 1000;
  l.add({ runId: 'r', purpose: 'eval', costUsd: 0.05, inputTokens: 1 });
  assert.throws(() => l.reconcile({ billedUsd: 30, source: 'usage page' }), /still open/);
  l.stop();
  const hour = l.spent();
  assert.ok(Math.abs(hour - 3600 * RATE) < 1e-9);
  clock.t += 3600 * 1000;
  assert.equal(l.spent(), hour, 'nothing bills while down');
  assert.equal(l.headroom(), 0, 'and nothing runs');
  assert.throws(() => l.reconcile({ billedUsd: 30 }), /source/);
  assert.throws(() => l.reconcile({ billedUsd: NaN, source: 's' }), /billedUsd/);
  const s = l.reconcile({ billedUsd: 29, source: 'modal.com usage page 2026-11-02' });
  assert.equal(s.reconciled[0].billedUsd, 29);
  const lines = readFileSync(l.path, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.deepEqual(lines.map((x) => x.kind), ['start', 'call', 'stop', 'reconcile']);
  assert.equal(lines[0].maxReplicas, 1);
  assert.equal(lines[0].idleS, 900);
  assert.equal(lines[0].configShot, '.spend/endpoint.png');
  assert.equal(lines[1].tokenCostUsd, 0.05);
  assert.ok(!('costUsd' in lines[1]));
  assert.throws(() => l.stop(), /no window/);
});

test('segments: validation is the fixed spec; others need a passing validation and an approval of that exact spec, in this window', () => {
  const clock = { t: at('2026-11-02T00:00:00Z') };
  const l = fresh(clock);
  const S2 = { sets: ['briefs', 'briefs-hard', 'briefs-wide'], only: null, repeat: 5, concurrency: 9, maxMinutes: 60, effort: 'low' };
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'validate', spec: VALIDATE_SPEC }), /no Modal up window/);
  up(l);
  assert.throws(() => l.authorize({ host: 'o.modal.run', segment: 'validate', spec: VALIDATE_SPEC }), /pinned to another host/);
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: null, spec: VALIDATE_SPEC }), /belongs to a segment/);
  l.authorize({ host: 'h.modal.run', segment: 'validate', spec: { ...VALIDATE_SPEC, sets: ['briefs-hard', 'briefs-wide'], only: 'three-storey,minimal-bin' } });
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'validate', spec: { ...VALIDATE_SPEC, repeat: 5 } }), /fixed spec/);
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'S2', spec: S2 }), /no passing validation/);
  l.recordValidation({ passed: false });
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'S2', spec: S2 }), /no passing validation/);
  l.recordValidation({ passed: true, summary: 'runs/x/summary.json' });
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'S2', spec: S2 }), /not approved/);
  assert.throws(() => l.approve({ segment: 'S2', spec: S2 }), /approvedBy/);
  assert.throws(() => l.approve({ segment: 'validate', spec: S2, approvedBy: 'x' }), /not "validate"/);
  assert.throws(() => l.approve({ segment: 'S2', spec: { ...S2, repeat: 0 }, approvedBy: 'x' }), /repeat/);
  assert.throws(() => l.approve({ segment: 'S2', spec: { ...S2, concurrency: NaN }, approvedBy: 'x' }), /concurrency/);
  const a = l.approve({ segment: 'S2', spec: S2, approvedBy: 'owner via lane 1, 2026-11-02 chat' });
  assert.equal(a.specSha, specSha(S2));
  l.authorize({ host: 'h.modal.run', segment: 'S2', spec: { ...S2, sets: ['briefs-wide', 'briefs', 'briefs-hard'] } });
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'S2', spec: { ...S2, repeat: 6 } }), /another spec/);
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'S2', spec: { ...S2, effort: 'high' } }), /another spec/);
  assert.deepEqual(l.approval('S2').spec, canonSpec(S2));
  // A new window starts clean: neither the validation nor the approval carries over.
  l.stop();
  up(l);
  assert.throws(() => l.authorize({ host: 'h.modal.run', segment: 'S2', spec: S2 }), /no passing validation/);
  assert.equal(l.approval('S2'), null);
});

test('dedicated hosts: *.modal.run or <ws>--ep-<name>-server.<region>.modal.direct; refusals name a label, not the host; ids and text redacted', () => {
  assert.equal(dedicatedHost('modal-dedicated:https://OTD--muse.modal.run/v1/'), 'otd--muse.modal.run');
  assert.equal(dedicatedHost('modal-dedicated:https://OTD--ep-hex-muse-server.us-west.modal.direct/v1'), 'otd--ep-hex-muse-server.us-west.modal.direct');
  assert.throws(() => dedicatedHost('modal-dedicated:secret-x.us-west.modal.direct'), (e) => /Shared Endpoint/.test(e.message) && !e.message.includes('secret-x'));
  for (const h of ['inference.us-west.modal.direct', 'otd--ep-x-server.modal.direct', 'otd--ep-x-server.us-west.modal.direct.evil.com', 'ep-x-server.us-west.modal.direct']) {
    assert.throws(() => dedicatedHost(`modal-dedicated:${h}`), /Shared Endpoint|not a Modal Dedicated Endpoint host/, h);
  }
  for (const h of ['evil.com', 'modal.run.evil.com', 'x.modal.run.evil.com', 'x.modal.run/../evil', 'a b.modal.run']) {
    assert.throws(() => dedicatedHost(`modal-dedicated:${h}`), (e) => /not a Modal Dedicated Endpoint host/.test(e.message) && !e.message.includes(h.split('/')[0]), h);
  }
  assert.equal(publicModelId('modal-dedicated:otd--muse.modal.run'), 'modal-dedicated:[endpoint host redacted]');
  assert.equal(publicModelId('meta-models/muse-spark-open-1026'), 'meta-models/muse-spark-open-1026');
  assert.match(hostLabel('otd--muse.modal.run'), /^host#[0-9a-f]{8}$/);
  assert.equal(redactHost('fetch https://otd--muse.modal.run/v1 failed', 'otd--muse.modal.run'), `fetch https://${hostLabel('otd--muse.modal.run')}/v1 failed`);
});

test('modal-dedicated adapter: its host as base, the weights as model, proxy token only, each call timed, host kept out of errors', async () => {
  const seen = [];
  const reply = { ok: true, status: 200, text: async () => JSON.stringify({ id: 'r', model: 'served-name', choices: [{ message: { role: 'assistant', content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) };
  const f = async (url, init) => (seen.push({ url, init }), reply);
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
  assert.equal(requestsInFlight(), 0);
  assert.throws(() => hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', env: { MODAL_TOKEN_ID: 'ak-1' } }), /MODAL_TOKEN_ID/);
  assert.throws(() => hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', env: { MODAL_TOKEN_SECRET: 'as-1' } }), /MODAL_TOKEN_ID/);
  assert.ok(hostedCostUsd('modal-dedicated:h.modal.run', { inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0 }) > 0, 'token cost kept for the trace');
  // A failed request keeps its timing and status, and its text loses the host.
  const echo = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'no replica for otd--muse.modal.run' }), env: {} });
  await assert.rejects(echo.next({ instructions: 's', items: [], tools: [] }), (e) => e.status === 503 && e.http.status === 503 && !e.message.includes('otd--muse'));
  const p = await echo.probe();
  assert.equal(p.status, 503);
  assert.ok(!p.body.includes('otd--muse'));
  const net = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND otd--muse.modal.run'); }, env: {} });
  await assert.rejects(net.next({ instructions: 's', items: [], tools: [] }), (e) => !e.message.includes('otd--muse') && e.http.status === null);
  assert.ok(!(await net.probe()).error.includes('otd--muse'));
  // Any letter case, and a host that straddles where the text is cut, leave nothing behind.
  assert.ok(!/otd--muse/i.test(redactHost('at OTD--Muse.Modal.Run now', 'otd--muse.modal.run')));
  const long = 'x'.repeat(190) + 'OTD--MUSE.modal.run' + 'y'.repeat(400);
  const cut = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', fetchImpl: async () => ({ ok: false, status: 502, text: async () => long }), env: {} });
  const pc = await cut.probe();
  assert.ok(!/otd|--mus|muse\.m/i.test(pc.body), pc.body);
  await assert.rejects(cut.next({ instructions: 's', items: [], tools: [] }), (e) => !/otd--|muse\.modal/i.test(e.message));
  const tail = 'x'.repeat(495) + 'otd--muse.modal.run';
  const cut2 = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', apiKey: 'pt', fetchImpl: async () => ({ ok: false, status: 502, text: async () => tail }), env: {} });
  await assert.rejects(cut2.next({ instructions: 's', items: [], tools: [] }), (e) => !/otd-|otd\b/i.test(e.message.replace(/host#[0-9a-f]+/, '')));
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

test('warm-up: a client error stops at once; a slow or 5xx answer waits; a fast 200 ends it', async () => {
  const run = (answers, o = {}) => {
    let i = 0;
    const clock = { t: 0 };
    return warmup(async () => answers[Math.min(i++, answers.length - 1)], { maxMinutes: 30, fastMs: 20000, everyMs: 15000, headroom: () => 1, sleep: async (ms) => { clock.t += ms; }, now: () => clock.t, ...o });
  };
  for (const s of [400, 401, 403, 404]) {
    const r = await run([{ ok: false, status: s, ms: 50, body: 'x' }]);
    assert.equal(r.ok, false);
    assert.equal(r.tries.length, 1, `${s} is final`);
  }
  const r = await run([{ ok: false, status: 503, ms: 100 }, { ok: true, status: 200, ms: 90000 }, { ok: true, status: 200, ms: 800 }]);
  assert.equal(r.ok, true);
  assert.equal(r.tries.length, 3);
  const never = await run([{ ok: false, status: 503, ms: 10 }]);
  assert.match(never.why, /no fast 200 in 30 min/);
  const broke = await run([{ ok: false, status: 503, ms: 10 }], { headroom: () => NaN });
  assert.match(broke.why, /headroom/);
});

test('modelFor: modal-dedicated needs the command-line flag, the window pinned to its host, and a segment', () => {
  const saved = { ...process.env };
  const dir = tmp();
  try {
    Object.assign(process.env, { MODAL_PROXY_TOKEN: 't', MODAL_UPTIME_LEDGER: join(dir, 'u.jsonl') });
    for (const k of ['MODAL_DEDICATED_ALLOWED', 'MODAL_TOKEN_ID', 'MODAL_TOKEN_SECRET', 'MODAL_SEGMENT', 'MODAL_CREDIT_USD', 'MODAL_RESERVE_USD']) delete process.env[k];
    const id = 'modal-dedicated:h.modal.run';
    const v = { modelId: id, purpose: 'eval', segment: 'validate', spec: VALIDATE_SPEC };
    assert.throws(() => modelFor(v), /Dedicated runs are off/);
    process.env.MODAL_ALLOWED = '1';
    assert.throws(() => modelFor(v), /Dedicated runs are off/, 'the old shared switch opens nothing');
    process.env.MODAL_DEDICATED_ALLOWED = '1';
    assert.throws(() => modelFor(v), /no Modal up window/);
    const l = openUptimeLedger({ creditUsd: 130, reserveUsd: 5 });
    up(l, 'other.modal.run');
    assert.throws(() => modelFor(v), /pinned to another host/);
    l.stop();
    up(l, 'h.modal.run');
    const { model, ledger } = modelFor(v);
    assert.equal(model.provider, 'modal-dedicated');
    assert.equal(model.effort, 'low', 'same effort as Baseten');
    assert.equal(ledger.kind, 'uptime');
    assert.ok(ledger.headroom() > 0);
    // bin/run.mjs and a bare suite name no segment: refused.
    assert.throws(() => modelFor({ modelId: id, purpose: 'eval' }), /belongs to a segment/);
    assert.throws(() => modelFor({ ...v, segment: 'S2' }), /no passing validation/);
    // Settings that would loosen the cap are refused here too.
    process.env.MODAL_CREDIT_USD = '500';
    assert.throws(() => modelFor(v), /above the Modal credit/);
    process.env.MODAL_CREDIT_USD = 'abc';
    assert.throws(() => modelFor(v), /must be a number/);
    delete process.env.MODAL_CREDIT_USD;
    process.env.MODAL_RESERVE_USD = '0';
    assert.throws(() => modelFor(v), /below the floor/);
    delete process.env.MODAL_RESERVE_USD;
    process.env.MODAL_TOKEN_ID = 'ak';
    assert.throws(() => modelFor(v), /MODAL_TOKEN_ID/);
    delete process.env.MODAL_TOKEN_ID;
    assert.throws(() => modelFor({ ...v, modelId: 'modal-dedicated:x.us-west.modal.direct' }), /Shared Endpoint/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('modelFor: no model, an unknown id, or the Meta switch from .env is refused; nothing falls through to Meta', () => {
  const saved = { ...process.env };
  const dir = tmp();
  try {
    delete process.env.META_API_ALLOWED;
    assert.throws(() => modelFor({ modelId: null, purpose: 'dev' }), /name the model/);
    assert.throws(() => modelFor({ modelId: 'modl:typo', purpose: 'dev' }), /not a known model id/);
    assert.throws(() => modelFor({ modelId: 'muse-spark-1.4', purpose: 'dev' }), /not a known model id/);
    process.env.META_API_ALLOWED = '1';
    assert.throws(() => modelFor({ modelId: 'gpt-x', purpose: 'dev' }), /not a known model id/, 'the switch does not make an unknown id Meta');
    delete process.env.META_API_ALLOWED;
    assert.throws(() => modelFor({ modelId: 'muse-spark-1.3', purpose: 'dev' }), /Meta Model API is off/);
    writeFileSync(join(dir, '.env'), 'META_API_ALLOWED=1\nMODAL_DEDICATED_ALLOWED=1\nSOME_TEST_KEY=v\n');
    loadEnv(join(dir, '.env'));
    assert.equal(process.env.META_API_ALLOWED, undefined);
    assert.equal(process.env.MODAL_DEDICATED_ALLOWED, undefined);
    assert.equal(process.env.SOME_TEST_KEY, 'v');
    process.env.META_API_ALLOWED = '1';
    assert.throws(() => modelFor({ modelId: 'muse-spark-1.3', purpose: 'dev' }), /META_API_ALLOWED is in \.env/);
    process.env.MODAL_DEDICATED_ALLOWED = '1';
    assert.throws(() => modelFor({ modelId: 'modal-dedicated:h.modal.run', purpose: 'eval' }), /MODAL_DEDICATED_ALLOWED is in \.env/);
  } finally {
    heldFromEnvFile.clear();
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
function suiteDir(provider, model, rows, extra = {}) {
  const dir = tmp();
  for (const r of rows) {
    if (!r.trace) continue;
    mkdirSync(join(dir, r.id + r.attempt), { recursive: true });
    writeFileSync(join(dir, r.id + r.attempt, 'trace.json'), JSON.stringify({ provider, model, ...extra, ...r.t }));
    r.trace = `${r.id + r.attempt}/trace.json`;
  }
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ provider, model, rows: rows.map(({ t, ...row }) => row) }));
  return dir;
}

test('run keys: provider, model, effort, contract, page build and agent commit; budget cuts are not results', () => {
  const a = runKey({ provider: 'baseten', model: 'm', effort: 'low', contractHash: 'fcf4301cdeadbeef', pageBuild: '/p.js', agent: { commit: 'abcdef1234', dirty: true } });
  assert.equal(a.key, 'baseten | m | low | fcf4301c | /p.js | abcdef1+dirty');
  assert.notEqual(a.key, runKey({ provider: 'baseten', model: 'm', effort: 'low', contractHash: 'fcf4301c', pageBuild: '/q.js', agent: { commit: 'abcdef1234' } }).key);
  assert.ok(budgetCut({ budget: 'refused' }));
  assert.ok(budgetCut({ stop: 'cost budget' }));
  assert.ok(budgetCut({ stop: 'eval credit budget' }));
  assert.ok(!budgetCut({ stop: 'turn budget' }));
  assert.ok(!budgetCut({ stop: null }));
});

test('tally: one group per run key; budget-refused and budget-stopped runs left out of completed and passed', () => {
  const apply = (code, tryInstead, next, nextOk) => [
    { type: 'apply', ops: [{ op: 'x' }], outcomes: [{ ok: false, code, details: tryInstead ? { tryInstead } : {} }] },
    { type: 'apply', ops: [next], outcomes: [{ ok: nextOk }] },
  ];
  const ti = { op: 'place', at: { q: 0, r: 0, level: 1 }, variant: 'half-n' };
  const k = { effort: 'low', contractHash: 'fcf4301c', pageBuild: '/p.js', agent: { commit: 'c1' } };
  const a = suiteDir('baseten', 'meta-models/muse-spark-open-1026', [
    { id: 'b1', attempt: 1, pass: true, trace: true, t: { events: apply('KIND_MISMATCH_BELOW', ti, { variant: 'half-n', at: { level: 1, r: 0, q: 0 }, op: 'place' }, true), verdict: { validation: { issues: [{ code: 'PROP_INSIDE' }] } } } },
    { id: 'b2', attempt: 1, pass: false, overclaimed: true, trace: true, t: { events: apply('PROP_NO_REST', null, { op: 'y' }, false) } },
    { id: 'b4', attempt: 1, pass: false, stop: 'cost budget', trace: true, t: { stop: 'cost budget', events: [] } },
    { id: 'b5', attempt: 1, pass: false, stop: 'eval credit budget', budget: 'stopped', trace: true, t: { events: [] } },
  ], k);
  // Same provider and model on another page build: its own group.
  const a2 = suiteDir('baseten', 'meta-models/muse-spark-open-1026', [{ id: 'b1', attempt: 1, pass: true, trace: true, t: { events: [] } }], { ...k, pageBuild: '/q.js' });
  const b = suiteDir('anthropic', 'claude-opus-5-5', [{ id: 'c1', attempt: 1, pass: true, trace: true, t: { events: [] } }], k);
  const g = groups([a, a2, b]);
  assert.equal(g.size, 3);
  const key = [...g.keys()][0];
  assert.match(key, /^baseten \| meta-models\/muse-spark-open-1026 \| low \| fcf4301c \| \/p\.js \| c1$/);
  const r = tally(g.get(key));
  assert.deepEqual({ attempted: r.attempted, completed: r.completed, passed: r.passed, budgetExcluded: r.budgetExcluded, overclaimed: r.overclaimed }, { attempted: 4, completed: 2, passed: 1, budgetExcluded: 2, overclaimed: 1 });
  assert.deepEqual(r.codes.KIND_MISMATCH_BELOW, { refused: 1, withTry: 1, sentNext: 1, nextOk: 1 });
  assert.deepEqual(r.codes.PROP_NO_REST, { refused: 1, withTry: 0, sentNext: 0, nextOk: 0 });
  assert.deepEqual(r.issues, { PROP_INSIDE: 1 });
  // A refused-before-start row (no trace) is attempted, cut, and never completed.
  const c = suiteDir('baseten', 'meta-models/muse-spark-open-1026', [{ id: 'b3', attempt: 1, pass: false, error: 'no eval budget left: {}', budget: 'refused' }]);
  const rc = tally(loadRuns([c]));
  assert.deepEqual([rc.attempted, rc.completed, rc.budgetExcluded], [1, 0, 1]);
  // A trace that is not what its summary says is refused, not counted.
  const d = suiteDir('baseten', 'meta-models/muse-spark-open-1026', [{ id: 'x', attempt: 1, pass: true, trace: true, t: { events: [] } }]);
  writeFileSync(join(d, 'x1', 'trace.json'), JSON.stringify({ provider: 'anthropic', model: 'claude-opus-5-5', events: [] }));
  assert.throws(() => groups([d]), /summary says/);
});

test('validation checks: gated on minimal-bin pass, recovered errors, servedBy, pageBuild, three-storey tryInstead', () => {
  const note = { pageBuild: '/assets/hex-B.js', viz: 'bbb' };
  const model = { type: 'model', servedBy: 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4' };
  const good = (extra = []) => ({ pageBuild: '/assets/hex-B.js', events: [{ type: 'model_error', retrying: true }, model, ...extra] });
  const refusal = [{ type: 'apply', ops: [{}], outcomes: [{ ok: false, code: 'KIND_MISMATCH_BELOW', details: { tryInstead: { op: 'place' } } }] }];
  const D = (rows) => join(suiteDir('modal-dedicated', 'modal-dedicated:[endpoint host redacted]', rows), 'summary.json');
  const ok = validationChecks(D([{ id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: good() }, { id: 'three-storey', attempt: 1, pass: true, trace: true, t: good(refusal) }]), note);
  assert.ok(ok.every((c) => c.ok));
  assert.equal(validationPassed(ok), true);
  const bad = validationChecks(D([
    { id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: { pageBuild: '/assets/hex-A.js', events: [{ type: 'model_error', retrying: false }, { type: 'model', servedBy: null }] } },
    { id: 'three-storey', attempt: 1, pass: false, trace: true, t: good() },
  ]), note);
  assert.deepEqual(bad.filter((c) => !c.ok).map((c) => c.check), ['minimal-bin no unrecovered model error', 'minimal-bin servedBy', 'minimal-bin pageBuild = lane 1 live note', 'three-storey passed', 'three-storey refusal with tryInstead']);
  assert.equal(validationPassed(bad), false);
  const t3 = validationChecks(D([{ id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: good() }, { id: 'three-storey', attempt: 1, pass: false, trace: true, t: good(refusal) }]), note);
  assert.deepEqual(t3.filter((c) => !c.ok).map((c) => [c.check, c.gate]), [['three-storey passed', false]]);
  assert.equal(validationPassed(t3), true, 'three-storey failing its brief is reported, not gated');
  assert.equal(validationPassed(validationChecks(D([{ id: 'minimal-bin', attempt: 1, pass: false, trace: true, t: good() }, { id: 'three-storey', attempt: 1, pass: true, trace: true, t: good(refusal) }]), note)), false);
  assert.equal(validationPassed(validationChecks(null, note)), false);
  // No tryInstead on three-storey is reported, not gated (Muse sees one in ~7 of 25 runs).
  const noTry = validationChecks(D([{ id: 'minimal-bin', attempt: 1, pass: true, trace: true, t: good() }, { id: 'three-storey', attempt: 1, pass: true, trace: true, t: good() }]), note);
  assert.deepEqual(noTry.filter((c) => !c.ok).map((c) => [c.check, c.gate]), [['three-storey refusal with tryInstead', false]]);
  assert.equal(validationPassed(noTry), true);
});
