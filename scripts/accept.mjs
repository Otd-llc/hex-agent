// Targeted contract acceptance on a disposable build in a fresh headless
// context: drawer key narrowing, spike type/facing queries, SPIKE_CLASH,
// atomic batch rollback, share-link round trip. Writes runs/accept-<ts>.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { openHex } from '../src/bridge.mjs';

const hex = await openHex();
const log = [];
const note = (step, data) => { log.push({ step, ...data }); console.log(step, JSON.stringify(data).slice(0, 400)); };
const brief = (o) => (o.ok ? { ok: true, added: o.added.length, warnings: o.warnings.map((w) => w.code) } : { ok: false, code: o.code, alts: o.validAlternatives.length });

try {
  // A 2-storey-capable cluster: centre plus a ring, so drawers and spikes have somewhere to go.
  const ring = (await hex.call('openSockets', { family: 'piece' })).map((s) => s.op);
  const grow = await hex.call('applyAll', ring);
  note('ring', { ops: ring.length, rolledBack: grow.rolledBack, outcomes: grow.outcomes.map(brief) });

  const drawers = await hex.call('openSockets', { family: 'drawer' });
  const keys = [...new Set(drawers.map((d) => d.op.key))];
  note('drawer sockets', { count: drawers.length, keys, sample: drawers[0]?.op });
  if (keys.length) {
    const k = keys[0];
    const narrowed = await hex.call('openSockets', { family: 'drawer', key: k });
    note('drawer key narrowing', { key: k, count: narrowed.length, allMatch: narrowed.every((d) => d.op.key === k) });
  }

  for (const q of [{}, { type: 'solid' }, { facing: 'down' }, { type: 'platform-sm' }, { type: 'platform-sm', facing: 'down' }]) {
    const s = await hex.call('openSockets', { family: 'spike', ...q });
    note('spike sockets', { query: q, count: s.length, sample: s[0]?.op });
  }
  for (const family of ['handle', 'cover', 'cap', 'accessory', 'connector', 'insert', 'riser']) {
    const s = await hex.call('openSockets', { family });
    note('sockets', { family, count: s.length, sample: s[0]?.op });
  }

  // SPIKE_CLASH: place a drawer, then try every spike offered before it, at its level.
  const spikesBefore = await hex.call('openSockets', { family: 'spike' });
  if (drawers.length) {
    const d = await hex.call('apply', drawers[0].op);
    note('drawer apply', brief(d));
    const spikesAfter = await hex.call('openSockets', { family: 'spike' });
    const afterSet = new Set(spikesAfter.map((s) => JSON.stringify(s.op)));
    const dropped = spikesBefore.filter((s) => !afterSet.has(JSON.stringify(s.op)));
    note('spike offers dropped by drawer', { before: spikesBefore.length, after: spikesAfter.length, dropped: dropped.length });
    const codes = {};
    for (const s of dropped.slice(0, 8)) {
      const o = await hex.call('apply', s.op);
      codes[o.ok ? 'OK' : o.code] = (codes[o.ok ? 'OK' : o.code] ?? 0) + 1;
      if (o.ok) await hex.call('undo');
    }
    note('applying dropped spike offers', { codes });
  }

  // Atomic batch: one good op then one bad ref must roll back and leave nodes unchanged.
  const before = (await hex.call('getState')).nodes.length;
  const good = (await hex.call('openSockets', { family: 'bin' }))[0]?.op;
  const batch = await hex.call('applyAll', [good, { op: 'remove', ref: 'no-such-ref' }]);
  const after = (await hex.call('getState')).nodes.length;
  note('atomic batch', { rolledBack: batch.rolledBack, outcomes: batch.outcomes.map(brief), nodesBefore: before, nodesAfter: after });

  // Round trip.
  const v = await hex.call('validate');
  const frag = await hex.call('toUrl');
  const bom = await hex.call('bom');
  const nodes = (await hex.call('getState')).nodes.length;
  await hex.call('load', { pieces: [{ q: 0, r: 0, level: 0, variant: 'full' }] });
  const reset = (await hex.call('getState')).nodes.length;
  const re = await hex.call('load', frag);
  await hex.call('settle');
  const back = (await hex.call('getState')).nodes.length;
  const bom2 = await hex.call('bom');
  note('round trip', {
    validate: { ok: v.ok, meshClash: v.meshClash, codes: v.issues.map((i) => i.code) },
    fragLen: frag.length, fragHead: frag.slice(0, 6), nodes, reset, load: re, back,
    bomSame: JSON.stringify(bom.lines) === JSON.stringify(bom2.lines), printed: bom.printedInstances,
  });
} finally {
  mkdirSync('runs', { recursive: true });
  writeFileSync(`runs/accept-${Date.now()}.json`, JSON.stringify(log, null, 2) + '\n');
  await hex.close();
}
