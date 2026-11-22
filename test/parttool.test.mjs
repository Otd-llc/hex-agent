// Changed parts (HEX_PART_SERVICE, src/parttool.mjs): make_part posts a recipe to the part
// service and returns its answer as it came. No network but a fake service on a local port,
// no model: the fake answers with the service's own examples (test/fixtures/part-service.json,
// copied by hand from its contract), which the first test holds to their recorded hashes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MAKE_PART_SPEC, PART_TOOL_LINE, makePart, recipeOf } from '../src/parttool.mjs';
import { createTools, toolSpecsFor } from '../src/tools.mjs';
import { INSTRUCTIONS, runAgent } from '../src/agent.mjs';

const FIX = JSON.parse(readFileSync(new URL('./fixtures/part-service.json', import.meta.url), 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const ENV = ['HEX_PART_SERVICE', 'HEX_LOOKAHEAD', 'HEX_BACKEND'];
const clearEnv = () => ENV.forEach((k) => delete process.env[k]);

// '<status> <json>' as the contract prints an answer
function answerOf(name) {
  const { line } = FIX.answers[name];
  const m = line.match(/^(\d{3}) (\{.*\})$/);
  assert.ok(m, `${name}: a status and a JSON body`);
  return { status: Number(m[1]), text: m[2], body: JSON.parse(m[2]) };
}
const recipe = (name) => JSON.parse(FIX.recipes[name].line);
const argsOf = (name) => {
  const { base, size, changes } = recipe(name);
  return { base, size, changes };
};

// A fake service: POST /v1/part answered from the examples by the body sent; a request with an
// Origin is refused as the service refuses an unlisted one. `mode` makes it busy, panic, hang.
async function fakeService() {
  const seen = [];
  const built = new Set();
  const state = { mode: 'normal' };
  const byBody = new Map([
    [FIX.recipes['port-through-joint'].line, 'reaches'],
    [FIX.recipes['divider-cell-bin'].line, 'scope'],
    [FIX.recipes['pocket-colour'].line, 'malformed'],
  ]);
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      if (state.mode === 'hang') return;
      const send = (a, extra = {}) => {
        res.writeHead(a.status, { 'content-type': 'application/json', connection: 'close', ...extra });
        res.end(typeof a.body === 'string' ? a.body : a.text ?? JSON.stringify(a.body));
      };
      if (req.headers.origin !== undefined) return send(answerOf('origin'));
      if (req.method !== 'POST' || req.url !== '/v1/part') return send({ status: 404, body: { refused: 'route', field: null } });
      if (state.mode === 'busy') return send(answerOf('busy'), { 'retry-after': FIX.answers.busy.retry_after });
      if (state.mode === 'panic') return send(answerOf('panic'));
      if (state.mode === 'garbage') return send({ status: 502, body: '<html>bad gateway</html>' });
      if (body === FIX.recipes.pocket.line) {
        const a = answerOf('pocket-built');
        const again = built.has(body);
        built.add(body);
        return send({ status: a.status, body: { ...a.body, came: again ? 'read' : 'built' } });
      }
      return send(answerOf(byBody.get(body) ?? 'malformed'));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, seen, state,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}

// Today's tool lists and system text (origin/feat/look-ahead, before make_part), by SHA-256 of
// JSON.stringify(toolSpecsFor(features)) and of the text.
const TODAY_TOOLS = [
  [{}, 'c5d1bb8762ae9e16f3b4d7a0335012b1bb6f6adb8137d4a436f101e46d759d41'],
  [{ acceptance: true }, 'b1728ef1da08c929ec6971cf100488cf3788f3526a61ab4c646688d66c42bd60'],
  [{ abstain: true }, 'b5fb18a168942a73aa867287d0c4daaa13e1996ca67cf01a99a52aab8e2b884e'],
  [{ rolegraph: true }, '7338b3388366bad491114214b2e344a0a97eb0927980be3ce93aeee45dfdfa03'],
  [{ topology: false }, 'cadae6d92570905a5e14fe63f0ed17ed770e9471f87d977a5092c38b067f5603'],
  [{ acceptance: true, abstain: true, rolegraph: true }, '53a87569b0a5264845329f5b9c178dcbc5cea8c2eab1f9695e046b9ad2e11f5c'],
];
const TODAY_INSTRUCTIONS = '9b2342f86a3e60056d48a401264cb6f0169f18a781e365683be70f57b41f1a80';
// what runAgent sends with the default features and strategy
const TODAY_SENT = '204d6933d8cd9c540a6b1fe1da68e5804d6f4a614d284c723f338c7fcd49dbf4';

// runAgent with a model that finishes at once: the system text and tools it was sent
async function firstTurn() {
  let seen;
  const finish = { requirements: [{ requirement: 'r', status: 'met', evidence: 'e' }], summary: 's' };
  const model = {
    kind: 'mock', provider: 'mock', model: 'scripted',
    next: async (a) => {
      seen ??= a;
      return { id: 'r', output: [], calls: [{ callId: 'c', name: 'finish', arguments: JSON.stringify(finish) }], text: '', usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } };
    },
  };
  await runAgent({ hex: { call: async () => ({}) }, model, brief: 'x', features: { verify: false } });
  return seen;
}

test('the fixtures are the contract\'s examples: every line its recorded hash, every recipe\'s hash the name its answer carries', () => {
  for (const group of ['recipes', 'answers']) {
    for (const [name, ex] of Object.entries(FIX[group])) {
      if (ex.derived) continue;
      assert.equal(sha(ex.line), ex.sha256, `${group}.${name}`);
    }
  }
  assert.equal(Buffer.byteLength(FIX.recipes.pocket.line), FIX.recipes.pocket.content_length);
  for (const name of Object.keys(FIX.answers)) answerOf(name);
  // an answer to a recipe names it by the recipe's hash
  assert.equal(answerOf('pocket-built').body.name, FIX.recipes.pocket.sha256);
  assert.equal(answerOf('reaches').body.name, FIX.recipes['port-through-joint'].sha256);
  assert.equal(answerOf('scope').body.name, FIX.recipes['divider-cell-bin'].sha256);
  // the one derived recipe is what it says it is
  const colour = recipe('pocket');
  colour.changes[0].colour = 'red';
  assert.equal(JSON.stringify(colour), FIX.recipes['pocket-colour'].line);
  // the tool writes each recipe as the contract prints it
  for (const name of Object.keys(FIX.recipes)) assert.equal(recipeOf(argsOf(name)).text, FIX.recipes[name].line, name);
});

test('HEX_PART_SERVICE unset: the tool lists are today\'s byte for byte, and no make_part is run', async () => {
  clearEnv();
  for (const [features, hash] of TODAY_TOOLS) assert.equal(sha(JSON.stringify(toolSpecsFor(features))), hash, JSON.stringify(features));
  assert.deepEqual(await createTools({ call: async () => ({}) }).run('make_part', argsOf('pocket')), { error: 'unknown tool make_part' });
  // set, the same list with make_part last
  process.env.HEX_PART_SERVICE = 'http://127.0.0.1:9';
  for (const [features] of TODAY_TOOLS) {
    const set = toolSpecsFor(features);
    assert.deepEqual(set.at(-1), MAKE_PART_SPEC);
    clearEnv();
    assert.deepEqual(set.slice(0, -1), toolSpecsFor(features));
    process.env.HEX_PART_SERVICE = 'http://127.0.0.1:9';
  }
  clearEnv();
});

test('HEX_PART_SERVICE unset: INSTRUCTIONS and the system text sent are today\'s byte for byte; set, one line more', async () => {
  clearEnv();
  assert.equal(sha(INSTRUCTIONS), TODAY_INSTRUCTIONS);
  const unset = await firstTurn();
  assert.equal(sha(unset.instructions), TODAY_SENT);
  assert.equal(sha(JSON.stringify(unset.tools)), TODAY_TOOLS[2][1], 'the default features: abstain on');
  process.env.HEX_PART_SERVICE = 'http://127.0.0.1:9';
  const set = await firstTurn();
  clearEnv();
  assert.equal(set.instructions, unset.instructions + PART_TOOL_LINE);
  assert.equal(PART_TOOL_LINE.trim().split('\n').length, 1);
  assert.deepEqual(set.tools.map((t) => t.name), [...unset.tools.map((t) => t.name), 'make_part']);
});

test('make_part posts the recipe as the contract prints it, with no Origin, and returns verdict, notes, name and came', async () => {
  const svc = await fakeService();
  try {
    const events = [];
    const a = await makePart(argsOf('pocket'), { service: svc.url, onEvent: (e) => events.push(e) });
    assert.equal(svc.seen.length, 1);
    const [req] = svc.seen;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/part');
    assert.equal(req.body, FIX.recipes.pocket.line);
    assert.equal(req.headers['content-length'], String(FIX.recipes.pocket.content_length));
    assert.equal(req.headers['content-type'], 'application/json');
    assert.equal(req.headers.origin, undefined, 'a caller that is not a browser sends no Origin');
    assert.equal(req.headers.host, new URL(svc.url).host);
    assert.equal(req.headers['transfer-encoding'], undefined);
    const ex = answerOf('pocket-built').body;
    assert.deepEqual({ ...a, note: undefined }, { ok: true, name: ex.name, verdict: 'clear', notes: [], came: 'built', note: undefined });
    assert.match(a.note, /cannot be placed in this build yet/);
    assert.equal(a.name, sha(req.body), 'the name is the hash of what was posted');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'make_part');
    assert.equal(events[0].name, a.name);
    assert.equal(events[0].status, 200);
    // the same again is read, not built
    const b = await makePart(argsOf('pocket'), { service: svc.url + '/' });
    assert.equal(b.came, 'read');
    assert.equal(b.name, a.name);
    assert.equal(svc.seen.length, 2);
  } finally {
    await svc.close();
  }
});

test('a refusal comes back as the service gave it: its word, its field and what it adds', async () => {
  const svc = await fakeService();
  try {
    for (const [recipeName, answerName] of [['port-through-joint', 'reaches'], ['divider-cell-bin', 'scope'], ['pocket-colour', 'malformed']]) {
      const a = await makePart(argsOf(recipeName), { service: svc.url });
      const ex = answerOf(answerName);
      assert.deepEqual(a, { ok: false, status: ex.status, ...ex.body }, recipeName);
    }
    assert.equal(svc.seen.length, 3);
    svc.state.mode = 'panic';
    const p = answerOf('panic');
    assert.deepEqual(await makePart(argsOf('pocket'), { service: svc.url }), { ok: false, status: 500, ...p.body });
    svc.state.mode = 'garbage';
    assert.deepEqual(
      { ...(await makePart(argsOf('pocket'), { service: svc.url })), note: undefined },
      { ok: false, status: 502, refused: 'unreadable', field: null, note: undefined },
    );
  } finally {
    await svc.close();
  }
});

test('a busy service is a refusal "busy, retry after N s", asked once and never again', async () => {
  const svc = await fakeService();
  try {
    svc.state.mode = 'busy';
    const events = [];
    const a = await makePart(argsOf('pocket'), { service: svc.url, onEvent: (e) => events.push(e) });
    assert.equal(svc.seen.length, 1, 'not retried');
    assert.deepEqual(a, { ok: false, status: 503, refused: 'busy', field: null, retryAfterS: 5, note: 'busy, retry after 5 s' });
    assert.equal(events.length, 1);
  } finally {
    await svc.close();
  }
});

test('no service, or one that does not answer: a refusal, never a hang or a throw', async () => {
  const svc = await fakeService();
  const url = svc.url;
  svc.state.mode = 'hang';
  const t0 = Date.now();
  const hung = await makePart(argsOf('pocket'), { service: url, waitMs: 300 });
  assert.ok(Date.now() - t0 < 5000);
  assert.equal(hung.refused, 'no-answer');
  assert.equal(svc.seen.length, 1);
  await svc.close();
  const gone = await makePart(argsOf('pocket'), { service: url });
  assert.equal(gone.refused, 'unreachable');
  assert.equal(gone.status, null);
  await assert.rejects(makePart(argsOf('pocket'), { service: null }), /HEX_PART_SERVICE is not set/);
  await assert.rejects(makePart({ ...argsOf('pocket'), density: 'print' }, { service: url }), /not density/);
});

test('through the tool layer: offered and run only with HEX_PART_SERVICE set; HEX_URL and the page untouched', async () => {
  const svc = await fakeService();
  const hexUrl = process.env.HEX_URL;
  try {
    clearEnv();
    process.env.HEX_PART_SERVICE = svc.url;
    const pageCalls = [];
    const events = [];
    const tools = createTools({ call: async (m) => { pageCalls.push(m); return {}; } }, { onEvent: (e) => events.push(e) });
    // the model's arguments arrive as text
    const a = await tools.run('make_part', JSON.stringify(argsOf('pocket')));
    assert.equal(a.ok, true);
    assert.equal(a.came, 'built');
    const r = await tools.run('make_part', { ...argsOf('pocket'), changes: JSON.stringify(argsOf('pocket').changes) });
    assert.equal(r.came, 'read', 'changes given as text are read as the array');
    assert.deepEqual(await tools.run('make_part', { base: 'x', size: 'S', changes: [], extra: 1 }), { error: 'make_part takes base, size and changes, not extra' });
    assert.deepEqual(pageCalls, [], 'make_part calls nothing on the page');
    assert.deepEqual(events.map((e) => e.type), ['make_part', 'make_part']);
    assert.equal(process.env.HEX_URL, hexUrl);
  } finally {
    clearEnv();
    await svc.close();
  }
});
