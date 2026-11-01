import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openUptimeLedger, B300_USD_PER_S } from '../src/uptime.mjs';
import { hostedModel, hostOf, hostedCostUsd } from '../src/hosted.mjs';
import { modelFor } from '../src/session.mjs';

const at = (iso) => Date.parse(iso);
const fresh = (clock, opts = {}) => openUptimeLedger({ path: join(mkdtempSync(join(tmpdir(), 'uptime-')), 'u.jsonl'), creditUsd: 130, reserveUsd: 5, runMaxS: 600, now: () => clock.t, ...opts });

test('uptime: no open window, no headroom; the cold start bills from --up-at', () => {
  const clock = { t: at('2026-11-02T00:20:00Z') };
  const l = fresh(clock);
  assert.equal(l.headroom('eval'), 0);
  l.start({ host: 'muse.modal.run', upAt: '2026-11-02T00:00:00Z' });
  const rate = 4 * B300_USD_PER_S;
  assert.ok(Math.abs(l.spent() - 1200 * rate) < 1e-9, '20 min of 4 GPUs');
  assert.ok(Math.abs(l.headroom('eval') - (125 - 1200 * rate - 600 * rate)) < 1e-9, 'cap less spent less the longest run');
  assert.throws(() => l.start({ host: 'x' }), /already open/);
});

test('uptime: a run is refused once the window carried through the longest run crosses the cap', () => {
  const clock = { t: at('2026-11-02T00:00:00Z') };
  const l = fresh(clock);
  l.start({ host: 'h' });
  const rate = 4 * B300_USD_PER_S;
  // Seconds until the cap less one run: about 4.1 hours at ~$28.40/hour.
  const edge = 125 / rate - 600;
  clock.t += (edge - 1) * 1000;
  assert.ok(l.headroom('eval') > 0);
  clock.t += 2000;
  assert.ok(l.headroom('eval') <= 0);
  assert.ok(l.headroom('demo') > 0, 'demo may use the reserve');
});

test('uptime: stop closes the window and the spend stays; calls are info only', () => {
  const clock = { t: at('2026-11-02T00:00:00Z') };
  const l = fresh(clock);
  l.start({ host: 'h' });
  clock.t += 3600 * 1000;
  l.add({ runId: 'r', purpose: 'eval', costUsd: 0.05, inputTokens: 1 });
  l.stop();
  const hour = l.spent();
  assert.ok(Math.abs(hour - 3600 * 4 * B300_USD_PER_S) < 1e-9);
  clock.t += 3600 * 1000;
  assert.equal(l.spent(), hour, 'nothing bills while down');
  assert.equal(l.headroom('eval'), 0, 'and nothing runs');
  const lines = readFileSync(l.path, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  assert.deepEqual(lines.map((x) => x.kind), ['start', 'call', 'stop']);
  assert.equal(lines[1].tokenCostUsd, 0.05);
  assert.ok(!('costUsd' in lines[1]));
  assert.equal(l.summary().up, null);
  assert.throws(() => l.stop(), /no window/);
});

test('modal-dedicated: its own host as base, the weights in the model field, proxy auth either way', async () => {
  const seen = [];
  const reply = { ok: true, text: async () => JSON.stringify({ id: 'r', choices: [{ message: { role: 'assistant', content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 1 } }) };
  const f = async (url, init) => (seen.push({ url, init }), reply);
  assert.equal(hostOf('modal-dedicated:x.modal.run'), 'modal-dedicated');
  assert.equal(hostOf('modal:x.us-west.modal.direct'), 'modal');
  const m = hostedModel({ model: 'modal-dedicated:https://otd--muse.modal.run/v1/', apiKey: 'pt', fetchImpl: f, env: {} });
  await m.next({ instructions: 's', items: [{ role: 'user', content: 'b' }], tools: [] });
  assert.equal(seen[0].url, 'https://otd--muse.modal.run/v1/chat/completions');
  assert.equal(JSON.parse(seen[0].init.body).model, 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer pt');
  const k = hostedModel({ model: 'modal-dedicated:otd--muse.modal.run', fetchImpl: f, env: { MODAL_TOKEN_ID: 'wk-1', MODAL_TOKEN_SECRET: 'ws-1', MODAL_DEDICATED_MODEL: 'other' } });
  await k.next({ instructions: 's', items: [{ role: 'user', content: 'b' }], tools: [] });
  assert.equal(seen[1].init.headers['Modal-Key'], 'wk-1');
  assert.equal(seen[1].init.headers['Modal-Secret'], 'ws-1');
  assert.ok(!('Authorization' in seen[1].init.headers));
  assert.equal(JSON.parse(seen[1].init.body).model, 'other');
  assert.throws(() => hostedModel({ model: 'modal-dedicated:', apiKey: 'pt', env: {} }), /endpoint host/);
  assert.ok(hostedCostUsd('modal-dedicated:h', { inputTokens: 1e6, cachedInputTokens: 0, outputTokens: 0 }) > 0, 'token cost kept for the trace');
});

test('modelFor: modal-dedicated is off without MODAL_ALLOWED, and on it uses the uptime ledger', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { MODAL_PROXY_TOKEN: 't', MODAL_CREDIT_USD: '130', MODAL_RESERVE_USD: '5' });
    delete process.env.MODAL_ALLOWED;
    assert.throws(() => modelFor({ modelId: 'modal-dedicated:h.modal.run', purpose: 'eval' }), /Dedicated runs are off/);
    process.env.MODAL_ALLOWED = '1';
    const { model, ledger } = modelFor({ modelId: 'modal-dedicated:h.modal.run', purpose: 'eval' });
    assert.equal(model.provider, 'modal-dedicated');
    assert.equal(ledger.kind, 'uptime');
    assert.match(ledger.path.replace(/\\/g, '/'), /\/\.spend\/modal-dedicated\.jsonl$/);
    assert.equal(ledger.creditUsd, 130);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
