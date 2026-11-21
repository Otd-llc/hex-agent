// Offline mode (HEX_BACKEND=engine, src/engine-backend.mjs): openHex's object over hex-core's
// engine. No network and no browser: the engine child is faked (a node process speaking the
// same JSON lines, and an in-process stand-in); one test runs the real binary when
// HEX_ENGINE_BIN and HEX_ENGINE_RECORDS are set, and is skipped otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { openEngine, openChild, STAND_INS } from '../src/engine-backend.mjs';
import { openCallLog } from '../src/calllog.mjs';

const ENV = 'hex-engine-serve/1';
const line = (kind, rest) => ({ envelope: ENV, kind, ...rest });
const READY = line('ready', { engine: { name: 'hex-engine', version: '0.1.0', apiVersion: 1 }, records: 3, build: 'starter' });

// An in-process child: answers toUrl and applyAll, leaves the rest unanswered.
function fakeChild(id) {
  return async () => ({
    ready: READY,
    async send({ member, args }) {
      if (member === 'toUrl') return line('answer', { member, result: `v2s=${id}` });
      if (member === 'applyAll') return line('answer', { member, result: { outcomes: args[0].map((op) => ({ ok: true, op })), rolledBack: false } });
      if (member === 'nope') return line('unreadable', { stage: 'call' });
      return line('unanswered', { member, reason: 'not-implemented', why: `${member}: not ported` });
    },
    close: async () => {},
  });
}

test('offline: answers from the engine, stand-ins marked, refusals named, fresh a child of its own', async () => {
  let opened = 0;
  const hex = await openEngine({ open: () => fakeChild(opened++)() });
  assert.equal(hex.version, 1);
  assert.match(hex.build, /^hex-engine 0\.1\.0 \(3 records\)$/);
  const op = { variant: 'full', op: 'place', at: { level: 0, q: 1, r: 0 } };
  assert.deepEqual((await hex.call('applyAll', [op], {})).outcomes[0].op, op);
  // settle is answered as settled, and says it was not run
  assert.deepEqual(await hex.call('settle'), { offline: true });
  // what needs the scene is refused before the engine is asked
  await assert.rejects(hex.call('still', {}), (e) => e.code === 'OFFLINE' && /still: not answered offline.*scene/.test(e.message));
  // what the engine leaves unanswered is refused with its reason
  await assert.rejects(hex.call('bom'), (e) => e.code === 'OFFLINE' && /bom: not ported/.test(e.message));
  await assert.rejects(hex.call('nope'), /not a documented hexAPI method/);
  const f = await hex.fresh();
  assert.equal(opened, 2, 'fresh is a second child');
  assert.equal(await f.call('toUrl'), 'v2s=1');
  assert.equal(await hex.call('toUrl'), 'v2s=0');
  assert.throws(() => hex.page.screenshot(), /HEX_BACKEND=engine: there is no page \(asked for page\.screenshot\)/);
  assert.deepEqual(hex.offline, { standIns: 3, refused: 2, byMember: { settle: 3, still: 1, bom: 1 }, lastRefused: 'bom' });
  assert.deepEqual(Object.keys(STAND_INS).sort(), ['measure', 'settle', 'still', 'surfaces', 'view']);
  await hex.close();
});

test('offline: the call log holds both contexts, the stand-in marked', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'offline-log-'));
  const log = openCallLog({ url: 'engine', dir });
  let n = 0;
  const hex = await openEngine({ log, open: () => fakeChild(n++)() });
  await hex.call('toUrl');
  const f = await hex.fresh();
  await f.call('toUrl');
  await hex.call('bom').catch(() => {});
  await hex.close();
  const lines = readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[0].build, 'hex-engine 0.1.0 (3 records)');
  assert.deepEqual(lines.slice(1).map((l) => [l.ctx, l.member, l.ok]), [
    ['main', 'settle', true], ['main', 'toUrl', true], ['fresh', 'settle', true], ['fresh', 'toUrl', true], ['main', 'bom', false],
  ]);
  assert.deepEqual(lines[1].result, { offline: true });
  assert.equal(lines[5].error.code, 'OFFLINE');
});

// A child process that speaks the protocol: the line transport, the ready line, the order.
const FAKE = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const say = (o) => process.stdout.write(JSON.stringify({ envelope: '${ENV}', ...o }) + '\\n');
say({ kind: 'ready', engine: { name: 'hex-engine', version: '9', apiVersion: 1 }, records: 0, build: 'starter', args: process.argv.slice(1) });
rl.on('line', (l) => { const c = JSON.parse(l); say({ kind: 'answer', member: c.member, result: { echo: c.args } }); });
`;

test('offline: a child over its pipes, the contract asked for, answers in order', async () => {
  const child = await openChild({ bin: process.execPath, records: 'r.json', spawnChild: (bin, args, o) => spawn(bin, ['-e', FAKE, ...args], o) });
  assert.deepEqual(child.ready.args, ['serve', 'r.json', '--contract', (await import('../src/contract.mjs')).CONTRACT.hash]);
  const got = await Promise.all([1, 2, 3].map((i) => child.send({ member: 'getState', args: [i] })));
  assert.deepEqual(got.map((g) => g.result.echo[0]), [1, 2, 3]);
  await child.close();
  await assert.rejects(openChild({ bin: '', records: '' }), /needs HEX_ENGINE_BIN and HEX_ENGINE_RECORDS/);
});

test('offline off: HEX_BACKEND unset, openHex is the browser bridge', async () => {
  delete process.env.HEX_BACKEND;
  const page = { goto: async () => {}, waitForFunction: async () => {}, evaluate: async (fn) => (String(fn).includes('__loadHexAPI') ? 1 : String(fn).includes('document.scripts') ? '/assets/x.js' : undefined) };
  const launch = chromium.launch;
  chromium.launch = async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} });
  try {
    const { openHex } = await import('../src/bridge.mjs');
    const hex = await openHex({ url: 'http://127.0.0.1:1/' });
    assert.equal(hex.page, page);
    assert.equal(hex.build, '/assets/x.js');
    assert.equal(hex.offline, undefined);
    await hex.close();
  } finally {
    chromium.launch = launch;
  }
});

test('offline, the real engine (HEX_ENGINE_BIN, HEX_ENGINE_RECORDS)', { skip: !(process.env.HEX_ENGINE_BIN && process.env.HEX_ENGINE_RECORDS) }, async () => {
  process.env.HEX_BACKEND = 'engine';
  try {
    const { openHex } = await import('../src/bridge.mjs');
    const hex = await openHex({});
    const r = await hex.call('applyAll', [{ variant: 'full', op: 'place', at: { level: 0, q: 1, r: 0 } }], {});
    assert.equal(r.outcomes[0].ok, true);
    assert.equal(JSON.stringify(r.outcomes[0].op), '{"variant":"full","op":"place","at":{"level":0,"q":1,"r":0}}');
    assert.match(await hex.call('toUrl'), /^v2s=/);
    const f = await hex.fresh();
    assert.equal((await f.call('getState')).nodes.length, 1, 'fresh is the starter');
    await assert.rejects(hex.call('openSockets', { family: 'bin' }), (e) => e.code === 'OFFLINE');
    await hex.close();
  } finally {
    delete process.env.HEX_BACKEND;
  }
});
