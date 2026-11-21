// Look before acting (HEX_LOOKAHEAD=1, src/lookahead.mjs): try_ops answered by a shadow on
// hex-core's engine, kept in step from the page. No network, no model: the engine child and
// the page are faked; one test replays recorded runs' batches through try_ops on the real
// binary when HEX_ENGINE_BIN and HEX_ENGINE_RECORDS are set, and is skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { withLookahead, TRY_OPS_SPEC } from '../src/lookahead.mjs';
import { openChild } from '../src/engine-backend.mjs';
import { createTools, toolSpecsFor } from '../src/tools.mjs';

const ENV = 'hex-engine-serve/1';
const say = (kind, rest) => ({ envelope: ENV, kind, ...rest });

// A page that answers toUrl with its build's link, which changes with every write it takes.
function fakePage() {
  let n = 1;
  const calls = [];
  return {
    calls,
    async call(member, ...args) {
      calls.push(member);
      if (member === 'toUrl') return `v2s=page${n}`;
      if (member === 'getState') return { nodes: [{ ref: 'bin:0,0,0~hex-bin-full', family: 'bin' }], staging: { props: [], soil: [] } };
      if (member === 'applyAll') { n++; return { outcomes: args[0].map((op) => ({ ok: true, op })), rolledBack: false }; }
      return null;
    },
    close: async () => {},
  };
}

// An engine child that says what it was sent; `applyAll` of an op `fillSoil` is not answered,
// a link `v2s=props` loads and reads no state.
function fakeEngine(sent) {
  return async () => ({
    ready: say('ready', {}),
    async send(obj) {
      sent.push(obj.control ? `new ${obj.build}` : `${obj.member} ${JSON.stringify(obj.args).slice(0, 40)}`);
      if (obj.control) return say('session', { build: obj.build });
      if (obj.member === 'load') return say('answer', { member: 'load', result: { ok: true } });
      if (obj.member === 'toUrl') return obj.props ? say('unanswered', {}) : say('answer', { member: 'toUrl', result: 'x' });
      if (obj.member === 'applyAll') {
        const ops = obj.args[0];
        if (ops.some((o) => o.op === 'fillSoil')) return say('unanswered', { member: 'applyAll', why: 'the op fillSoil is not ported' });
        return say('answer', {
          member: 'applyAll',
          result: { outcomes: ops.map((op) => (op.at?.q === 2 ? { ok: false, op, code: 'SOCKET_OCCUPIED', message: 'that cell is taken.', details: {} } : { ok: true, op, added: ['piece:1,0,0;full'], removed: [], warnings: [] })), rolledBack: ops.some((o) => o.at?.q === 2) },
        });
      }
      return say('unanswered', { member: obj.member, why: 'not ported' });
    },
    close: async () => {},
  });
}

const place = (q, variant = 'full') => ({ op: 'place', at: { q, r: 0, level: 0 }, variant });

test('look-ahead off: no try_ops offered, none run, the bridge as before', async () => {
  delete process.env.HEX_LOOKAHEAD;
  assert.ok(!toolSpecsFor().some((t) => t.name === 'try_ops'));
  const tools = createTools(fakePage());
  assert.deepEqual(await tools.run('try_ops', { ops: [place(1)] }), { error: 'unknown tool try_ops' });
  process.env.HEX_LOOKAHEAD = '1';
  assert.ok(toolSpecsFor().some((t) => t.name === 'try_ops'));
  process.env.HEX_BACKEND = 'engine';
  assert.ok(!toolSpecsFor().some((t) => t.name === 'try_ops'), 'offline, the engine is the page: no shadow');
  delete process.env.HEX_BACKEND;
  delete process.env.HEX_LOOKAHEAD;
  assert.match(TRY_OPS_SPEC.description, /cannot say/);
});

test('try_ops: answered from the shadow, the page untouched, the shadow put back and kept in step from the page', async () => {
  const sent = [];
  const page = fakePage();
  const hex = await withLookahead(page, { open: fakeEngine(sent) });
  // the page's calls but getState, which the tool layer's own resolution of refs reads
  const pageCalls = () => page.calls.filter((c) => c !== 'getState');
  const events = [];
  const tools = createTools(hex, { onEvent: (e) => events.push(e) });
  const r = await tools.run('try_ops', { ops: [place(1), place(2)] });
  assert.equal(r.error, undefined, JSON.stringify(r));
  assert.equal(r.available, true);
  assert.deepEqual(r.outcomes[0], { ok: true, op: 'place', added: ['piece:1,0,0;full'] });
  assert.deepEqual(r.outcomes[1], { ok: false, op: 'place', code: 'SOCKET_OCCUPIED', message: 'that cell is taken.' });
  assert.equal(r.rolledBack, true);
  // the page was asked only for its link (and read); the shadow loaded it, tried, and was put back on it
  assert.deepEqual(pageCalls(), ['toUrl']);
  assert.deepEqual(sent.map((s) => s.split(' ')[0]), ['new', 'load', 'toUrl', 'applyAll', 'new', 'load', 'toUrl']);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'try_ops');
  assert.deepEqual(events[0].ops, [place(1), place(2)]);
  assert.ok(events[0].answer.raw && typeof events[0].ms === 'number');
  // a second try on the same page build: no page call, the shadow already there
  sent.length = 0;
  await tools.run('try_ops', { ops: [place(1)] });
  assert.deepEqual(pageCalls(), ['toUrl']);
  assert.deepEqual(sent.map((s) => s.split(' ')[0]), ['applyAll', 'new', 'load', 'toUrl']);
  // the page takes a write: the next try takes the page's new link
  await hex.call('applyAll', [place(3)], {});
  sent.length = 0;
  await tools.run('try_ops', { ops: [place(4)] });
  assert.deepEqual(pageCalls(), ['toUrl', 'applyAll', 'toUrl']);
  assert.ok(sent.some((s) => s.includes('page2')), sent.join('\n'));
  // what the engine does not answer: cannot say, never a guess
  const cannot = await tools.run('try_ops', { ops: [{ op: 'fillSoil', part: 'bin:0,0,0~hex-bin-full' }] });
  assert.equal(cannot.cannotSay, true);
  assert.match(cannot.note, /^the engine cannot say: the op fillSoil is not ported/);
  assert.equal(cannot.outcomes, undefined);
  await hex.close();
});

// The newest suites' runs on today's tool layer, from the starter (bin/offline-replay.mjs's
// choice), the first 20 by their paths.
function recordedRuns(n) {
  const suites = ['suite-2026-11-04T17-07-56-347Z', 'suite-2026-11-04T16-58-26-381Z', 'suite-2026-11-04T16-22-20-053Z', 'suite-2026-11-03T09-14-48-579Z', 'suite-2026-11-03T08-45-28-942Z', 'suite-2026-11-03T08-45-28-941Z'];
  const out = [];
  for (const s of suites) {
    const dir = join('runs', s);
    if (!existsSync(dir)) continue;
    for (const r of readdirSync(dir).sort()) {
      const p = join(dir, r, 'trace.json');
      if (!existsSync(p) || !statSync(p).isFile()) continue;
      const t = JSON.parse(readFileSync(p, 'utf8'));
      if (!t.events || t.startSha256 || t.contractHash?.slice(0, 8) !== 'da0834cc') continue;
      if (t.events.some((e) => e.type === 'model' && (e.calls ?? []).some((c) => c.name === 'survey'))) continue;
      if (t.events.some((e) => e.type === 'tool' && e.name === 'apply' && /did not answer/.test(e.result?.error ?? ''))) continue;
      out.push(t);
      if (out.length === n) return out;
    }
  }
  return out;
}

test('try_ops on the real engine against 20 recorded runs: the page\'s verdict on each batch, the engine\'s beforehand', { skip: !(process.env.HEX_ENGINE_BIN && process.env.HEX_ENGINE_RECORDS) }, async () => {
  const runs = recordedRuns(20);
  assert.equal(runs.length, 20);
  const score = { same: 0, different: 0, cannotSay: 0, notReached: 0, messages: 0 };
  const firstDifferent = [];
  const ctx = { resolve: async (op) => op, liveRefs: async () => null, takeRole: (x) => [x, null] };
  for (const t of runs) {
    // the page stands in as an engine of its own, on the starter, given each batch as recorded;
    // it is the page only while the engine has called every batch as the page did
    const page = await openChild();
    const pageHex = { call: async (m, ...a) => { const o = await page.send({ member: m, args: a }); if (o.kind !== 'answer') throw new Error(`${m}: ${o.why}`); return o.result; }, close: () => page.close() };
    const hex = await withLookahead(pageHex);
    let lost = false;
    for (const e of t.events) {
      // the recorded undos and redos the page took, made on the stand-in too
      if (e.type === 'tool' && (e.name === 'undo' || e.name === 'redo') && (e.result?.undone || e.result?.redone)) {
        if (!lost) await hex.call(e.name);
        continue;
      }
      if (e.type !== 'apply') continue;
      if (lost) { score.notReached++; continue; }
      const r = await hex.lookahead.tryOps({ ops: e.ops, atomic: e.atomic !== false }, ctx);
      const raw = r.available && !r.cannotSay ? r.outcomes : null;
      let verdict;
      if (!raw) verdict = 'cannotSay';
      else {
        const same = r.rolledBack === e.rolledBack && raw.length === e.outcomes.length && raw.every((o, i) => o.ok === e.outcomes[i].ok && (o.ok || o.code === e.outcomes[i].code));
        verdict = same ? 'same' : 'different';
        if (same && raw.some((o, i) => !o.ok && o.message !== e.outcomes[i].message)) score.messages++;
        if (!same && firstDifferent.length < 5) firstDifferent.push(`${t.runId}: ${e.ops.map((o) => o.op).join(',')}: page ${JSON.stringify(e.outcomes.map((o) => o.ok || o.code))}, engine ${JSON.stringify(raw.map((o) => o.ok || o.code))}`);
      }
      score[verdict]++;
      if (verdict !== 'same') { lost = true; continue; }
      await hex.call('applyAll', e.ops, e.atomic === false ? { keepGoing: true } : {});
    }
    await hex.close();
  }
  console.log(`TRY_OPS (20 recorded runs, ${score.same + score.different + score.cannotSay + score.notReached} batches): the engine called ${score.same} as the page did (accepted or refused, the same codes; ${score.messages} of them with a refusal worded otherwise), ${score.different} differently, ${score.cannotSay} it could not say; ${score.notReached} not reached (after a batch it did not call as the page did, the stand-in is no longer the page)${firstDifferent.length ? '\n  ' + firstDifferent.join('\n  ') : ''}`);
  assert.ok(score.same > 0);
});
