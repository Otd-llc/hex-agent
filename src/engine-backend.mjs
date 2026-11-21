// OFFLINE MODE (HEX_BACKEND=engine): the same object openHex returns for the browser
// ({ page, version, build, call, close, fresh }), with every hexAPI call answered by
// hex-core's native engine (`hex-engine serve <records.json>`, a child process speaking JSON
// lines: hex-core crates/hex-engine/DESIGN.md section 7). No browser, no page, no scene.
//   HEX_ENGINE_BIN      the hex-engine binary
//   HEX_ENGINE_RECORDS  the parts' records.json (hex-cad records <dir>)
// The bridge imports this file only when HEX_BACKEND=engine.
//
// fresh() is a second child: the round-trip check (session.mjs, verify) loads the link into a
// session of its own while the main one stays as it was, and one child holds one build (a
// control line {"control":"new"} would replace the main build). A child starts in about
// 150 ms.
//
// page is a stand-in that refuses every use by name ("HEX_BACKEND=engine: there is no
// page"): a null would fail as a TypeError that names nothing.
//
// WHAT THE ENGINE DOES NOT ANSWER, and what the tool layer gets instead (STAND_INS below).
// Nothing is faked silently: each stand-in is marked offline: true in what it answers, or
// refused with code OFFLINE, and each is counted in hex.offline.
//   settle         answered as settled: { offline: true }. tools.mjs awaits settle after every
//                  applyAll, undo and redo and reads nothing of its answer (955-973, 1044,
//                  1052); refusing it would turn every apply into a tool error. There is no
//                  collision gate offline: the engine's applyAll answer is final; where the
//                  page's gate would decide, the engine does not answer the batch (below).
//                  The apply event cannot carry the mark (tools.mjs, frozen, drops settle's
//                  answer): the mark is in the call log and in hex.offline.standIns.
//   still, view, measure, surfaces   refused, OFFLINE: they need the scene.
//   any other member or op the engine leaves unanswered (bom, validate, openSockets,
//                  listParts, listProps, suggestPlants, props and soil ops, the page's gate)
//                  refused, OFFLINE, with the engine's own reason; the tool returns it as its
//                  error, which its event records.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { withTimeout, callTimeoutMs } from './bridge.mjs';
import { CONTRACT } from './contract.mjs';

export const ENVELOPE = 'hex-engine-serve/1';
const MEMBERS = new Set(['getState', 'listParts', 'listProps', 'openSockets', 'validate', 'bom', 'toUrl', 'settle', 'measure', 'surfaces', 'suggestPlants', 'view', 'still', 'apply', 'applyAll', 'load', 'undo', 'redo']);

export const STAND_INS = {
  settle: { kind: 'answered', answer: () => ({ offline: true }) },
  still: { kind: 'refused', why: 'a still needs the scene' },
  view: { kind: 'refused', why: 'a view needs the scene' },
  measure: { kind: 'refused', why: 'measure needs the scene' },
  surfaces: { kind: 'refused', why: 'surfaces need the scene' },
};

export class OfflineError extends Error {
  constructor(member, why, code = 'OFFLINE') {
    super(`${member}: not answered offline (HEX_BACKEND=engine): ${why}`);
    this.code = code;
    this.member = member;
  }
}

const noPage = new Proxy({}, {
  get(_, k) {
    if (k === 'then') return undefined; // not a promise
    throw new Error(`HEX_BACKEND=engine: there is no page (asked for page.${String(k)})`);
  },
});

/** One hex-engine serve child: a call a line, the answers in order. */
export async function openChild({ bin = process.env.HEX_ENGINE_BIN, records = process.env.HEX_ENGINE_RECORDS, spawnChild = spawn } = {}) {
  if (!bin || !records) throw new Error('HEX_BACKEND=engine needs HEX_ENGINE_BIN and HEX_ENGINE_RECORDS');
  const child = spawnChild(bin, ['serve', records, '--contract', CONTRACT.hash], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const waiting = [];
  let ended = null;
  lines.on('line', (l) => waiting.shift()?.resolve(l));
  const done = new Promise((r) => child.on('exit', (code) => { ended = `hex-engine exited (${code})`; for (const w of waiting.splice(0)) w.reject(new Error(ended)); r(code); }));
  child.on('error', (e) => { ended = String(e.message); for (const w of waiting.splice(0)) w.reject(e); });
  const next = () => new Promise((resolve, reject) => (ended ? reject(new Error(ended)) : waiting.push({ resolve, reject })));
  const ready = JSON.parse(await next());
  if (ready.envelope !== ENVELOPE || ready.kind !== 'ready') {
    child.stdin.end();
    throw new Error(`hex-engine did not start: ${JSON.stringify(ready)}`);
  }
  let chain = Promise.resolve();
  // one line in, one line out, one at a time
  const send = (obj) => {
    const run = chain.then(async () => {
      const answer = next();
      child.stdin.write(JSON.stringify(obj) + '\n');
      return JSON.parse(await answer);
    });
    chain = run.catch(() => undefined);
    return run;
  };
  return {
    ready,
    send,
    async close() {
      child.stdin.end();
      await done;
    },
  };
}

/** The offline hex: openHex's object over two children (main, and fresh on demand). */
export async function openEngine({ log = null, open = openChild } = {}) {
  const offline = { standIns: 0, refused: 0, byMember: {}, lastRefused: null, lastWhy: null };
  const count = (member, what) => {
    offline[what]++;
    offline.byMember[member] = (offline.byMember[member] ?? 0) + 1;
    if (what === 'refused') offline.lastRefused = member;
  };
  async function bind(ctx) {
    const child = await open();
    const raw = async (member, args) => {
      if (!MEMBERS.has(member)) throw new Error(`not a documented hexAPI method: ${member}`);
      const stand = STAND_INS[member];
      if (stand?.kind === 'refused') {
        count(member, 'refused');
        throw new OfflineError(member, stand.why);
      }
      // undefined arguments cross as JSON does not write them: left out at the end
      while (args.length && args[args.length - 1] === undefined) args = args.slice(0, -1);
      const out = await withTimeout(child.send({ member, args }), callTimeoutMs(member, args), `hexAPI ${member}`);
      if (out.kind === 'answer') return out.result;
      if (out.kind === 'unanswered' && stand?.kind === 'answered') {
        count(member, 'standIns');
        return stand.answer();
      }
      count(member, 'refused');
      if (out.kind === 'unanswered') {
        offline.lastWhy = out.why ?? out.message;
        throw new OfflineError(member, offline.lastWhy);
      }
      throw new OfflineError(member, `${out.kind}: ${JSON.stringify(out)}`, `OFFLINE_${String(out.kind).toUpperCase()}`);
    };
    const call = log ? (member, ...args) => log.around(ctx, member, args, () => raw(member, args)) : (member, ...args) => raw(member, args);
    return { child, call };
  }
  const main = await bind('main');
  const version = main.child.ready.engine.apiVersion;
  const build = `hex-engine ${main.child.ready.engine.version} (${main.child.ready.records} records)`;
  log?.head({ version, build });
  await main.call('settle');
  const fresh = [];
  return {
    page: noPage,
    version,
    build,
    offline,
    call: main.call,
    async close() {
      await Promise.all([main, ...fresh].map((x) => x.child.close()));
      await log?.end();
    },
    async fresh() {
      const f = await bind('fresh');
      fresh.push(f);
      await f.call('settle');
      return { page: noPage, version, build, call: f.call, close: () => f.child.close() };
    },
  };
}
