// The call log (HEX_CALL_LOG=1, src/calllog.mjs): off, the bridge is as it was; on, every
// hexAPI call of both contexts is a line in order, a timeout included, and a write that fails
// fails no call. No network and no browser: playwright's chromium.launch is replaced by a fake
// browser whose page answers a fake hexAPI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

process.env.HEX_CALL_TIMEOUT_MS = '200'; // read when the bridge is loaded, below
const { openHex } = await import('../src/bridge.mjs');

// A page whose hexAPI answers from `api` (member -> function of the args); `slow` never answers.
function fakeBrowser(api) {
  const page = {
    goto: async () => {},
    waitForFunction: async () => {},
    async evaluate(fn, arg) {
      const src = String(fn);
      if (src.includes('__loadHexAPI')) return 1;
      if (src.includes('document.scripts')) return '/assets/hex-FAKE.js';
      const [m, a] = arg;
      if (m === 'slow') return new Promise(() => {});
      return api[m](...a);
    },
  };
  return { newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} };
}

const api = {
  settle: () => undefined,
  getState: () => ({ nodes: [{ ref: 'piece:0,0,0;full' }] }),
  toUrl: () => 'v2s=abc',
  applyAll: (ops, o) => ({ outcomes: ops.map((op) => ({ ok: true, op })), rolledBack: false, o }),
  // a page that never answers: the bridge's timeout is the answer
  validate: () => new Promise(() => {}),
};

chromium.launch = async () => fakeBrowser(api);

async function session() {
  const hex = await openHex({ url: 'http://127.0.0.1:1/hex.html' });
  const out = [];
  out.push(await hex.call('getState'));
  out.push(await hex.call('applyAll', [{ variant: 'full', op: 'place', at: { level: 0, q: 1, r: 0 } }], {}));
  const fresh = await hex.fresh();
  out.push(await fresh.call('toUrl'));
  out.push(await hex.call('validate').catch((e) => ({ threw: e.code })));
  await fresh.close();
  await hex.close();
  return out;
}

const lines = (dir) => {
  const runs = readdirSync(dir);
  assert.equal(runs.length, 1, 'one log a session');
  return readFileSync(join(dir, runs[0], 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
};

test('call log off: the bridge answers as before and writes nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calls-off-'));
  delete process.env.HEX_CALL_LOG;
  process.env.HEX_CALL_LOG_DIR = dir;
  const off = await session();
  assert.deepEqual(readdirSync(dir), []);
  process.env.HEX_CALL_LOG = '1';
  const on = await session();
  delete process.env.HEX_CALL_LOG;
  assert.deepEqual(on, off, 'the same answers with the log on');
  assert.deepEqual(off[3], { threw: 'CALL_TIMEOUT' });
});

test('call log on: every call of both contexts in order, as it crossed, a timeout an answer', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calls-on-'));
  process.env.HEX_CALL_LOG = '1';
  process.env.HEX_CALL_LOG_DIR = dir;
  await session();
  delete process.env.HEX_CALL_LOG;
  const [head, ...calls] = lines(dir);
  assert.equal(head.schema, 'hex-agent-calls/1');
  assert.equal(head.version, 1);
  assert.equal(head.build, '/assets/hex-FAKE.js');
  assert.equal(head.url, 'http://127.0.0.1:1/hex.html');
  assert.ok(!Number.isNaN(Date.parse(head.openedAt)));
  assert.deepEqual(calls.map((c) => [c.n, c.ctx, c.member, c.ok]), [
    [0, 'main', 'settle', true],
    [1, 'main', 'getState', true],
    [2, 'main', 'applyAll', true],
    [3, 'fresh', 'settle', true],
    [4, 'fresh', 'toUrl', true],
    [5, 'main', 'validate', false],
  ]);
  // what crossed, key for key
  assert.equal(JSON.stringify(calls[2].args), '[[{"variant":"full","op":"place","at":{"level":0,"q":1,"r":0}}],{}]');
  assert.deepEqual(calls[2].result.outcomes[0].op, { variant: 'full', op: 'place', at: { level: 0, q: 1, r: 0 } });
  assert.equal(calls[4].result, 'v2s=abc');
  assert.equal(calls[5].error.code, 'CALL_TIMEOUT');
  assert.match(calls[5].error.message, /validate did not answer/);
  assert.ok(calls.every((c, i) => i === 0 || c.t >= calls[i - 1].t));
});

test('call log: a write that fails fails no call, and is said once at the end', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'calls-bad-'));
  const notAFolder = join(dir, 'file');
  writeFileSync(notAFolder, 'x');
  process.env.HEX_CALL_LOG = '1';
  process.env.HEX_CALL_LOG_DIR = notAFolder;
  const said = [];
  const err = console.error;
  console.error = (...a) => said.push(a.join(' '));
  try {
    const out = await session();
    assert.deepEqual(out[0], { nodes: [{ ref: 'piece:0,0,0;full' }] });
  } finally {
    console.error = err;
    delete process.env.HEX_CALL_LOG;
  }
  const logSaid = said.filter((s) => s.startsWith('call log:'));
  assert.equal(logSaid.length, 1, said.join('\n'));
  assert.match(logSaid[0], /^call log: 7 line\(s\) not written/);
  assert.ok(existsSync(notAFolder));
});
