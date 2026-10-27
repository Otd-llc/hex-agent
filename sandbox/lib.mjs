// Hand-built reference configurations: small helpers over the public
// window.hexAPI, used by the sandbox build scripts. Every change still goes
// through apply/applyAll, so the configurator's rules and collision gate judge
// it exactly as they judge the agent.
import { openHex } from '../src/bridge.mjs';

export const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
export const cell = (q, r, level = 0) => ({ q, r, level });
export const key = (c) => `${c.q},${c.r},${c.level ?? 0}`;

// Axial hexagon of the given radius around (0,0): radius 1 = 7 cells, 2 = 19.
export function hexagon(radius, level = 0) {
  const out = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) out.push(cell(q, r, level));
  return out;
}

export async function builder({ headless = true, log = console.log } = {}) {
  const hex = await openHex({ headless });
  const b = {
    hex,
    log,
    async state() {
      return hex.call('getState');
    },
    async offers(query, where = () => true) {
      return (await hex.call('openSockets', query)).filter(where);
    },
    // Apply ops one by one; refusals are reported, not thrown.
    async apply(ops, label = '') {
      const res = { ok: 0, refused: {} };
      for (const op of ops) {
        const o = await hex.call('apply', op);
        if (o.ok) res.ok++;
        else (res.refused[o.code] ??= []).push(o.message);
      }
      await hex.call('settle');
      log(`  ${label || ops[0]?.op}: ${res.ok}/${ops.length} ok${Object.keys(res.refused).length ? ' refused ' + JSON.stringify(Object.fromEntries(Object.entries(res.refused).map(([k, v]) => [k, v.length]))) : ''}`);
      if (Object.keys(res.refused).length) for (const [k, v] of Object.entries(res.refused)) log(`    ${k}: ${v[0]}`);
      return res;
    },
    async place(cells, variant = 'full', extra = {}) {
      return b.apply(cells.map((c) => ({ op: 'place', at: cell(c.q, c.r, c.level ?? 0), variant: c.variant ?? variant, ...extra })), `place ${cells.length}`);
    },
    // Take offers one at a time, re-asking after each (offers go stale), until
    // none match or the cap is reached.
    async fillOffers(query, where = () => true, { max = 500, label } = {}) {
      let n = 0;
      const refused = {};
      for (; n < max; ) {
        const offer = (await b.offers(query, where)).find((o) => !refused[JSON.stringify(o.op)]);
        if (!offer) break;
        const o = await hex.call('apply', offer.op);
        if (o.ok) n++;
        else refused[JSON.stringify(offer.op)] = o.code;
      }
      await hex.call('settle');
      const codes = Object.values(refused).reduce((m, c) => ((m[c] = (m[c] ?? 0) + 1), m), {});
      log(`  ${label ?? query.family}: ${n} placed${Object.keys(codes).length ? ' (offers refused: ' + JSON.stringify(codes) + ')' : ''}`);
      return n;
    },
    async validate() {
      return hex.call('validate');
    },
    async close() {
      await hex.close();
    },
  };
  return b;
}

// End-of-build report: the same checks the agent's verdict uses, plus a share
// link reloaded in a fresh session.
// Every drawer must actually open: open it through the API, note any refusal,
// close it again. Reports which way each one faces (its key).
export async function drawerCheck(b) {
  const state = await b.state();
  const out = [];
  // A cut-face drawer fills the half opposite its half base, so it faces away from it.
  const FACES = { 'half-n': 'south', 'half-s': 'north', 'half-e': 'west', 'half-w': 'east' };
  for (const n of state.nodes.filter((x) => x.family === 'drawer')) {
    const base = state.nodes.find((x) => x.family === 'piece' && x.at && key(x.at) === key(n.at));
    const variant = base?.ref.split(';')[1] ?? null;
    const o = await b.hex.call('apply', { op: 'setDrawerOpen', at: n.at, open: true });
    if (o.ok) await b.hex.call('apply', { op: 'setDrawerOpen', at: n.at, open: false });
    out.push({ ref: n.ref, at: n.at, faces: FACES[variant] ?? variant, opens: o.ok, refused: o.ok ? null : `${o.code}: ${o.message}` });
  }
  await b.hex.call('settle');
  return out;
}

export async function finish(b, { name, shots } = {}) {
  const drawers = await drawerCheck(b);
  const v = await b.validate();
  const state = await b.state();
  const bom = await b.hex.call('bom');
  const fragment = await b.hex.call('toUrl');
  const fresh = await b.hex.fresh();
  const loaded = await fresh.call('load', fragment);
  await fresh.call('settle');
  const back = await fresh.call('getState');
  const bom2 = await fresh.call('bom');
  await fresh.close();
  const families = {};
  for (const n of state.nodes) families[n.family] = (families[n.family] ?? 0) + 1;
  const levels = [...new Set(state.nodes.filter((n) => n.at).map((n) => n.at.level))].sort();
  const report = {
    name,
    parts: state.nodes.length,
    families,
    levels,
    props: state.staging.props.length,
    drawers,
    soil: state.staging.soil.length,
    rulesOk: v.ok,
    meshClash: v.meshClash,
    issues: v.issues.map((i) => `${i.severity}:${i.code}`),
    roundTrip: loaded.ok && back.nodes.length === state.nodes.length && JSON.stringify(bom.lines) === JSON.stringify(bom2.lines),
    printed: bom.printedInstances,
    bomLines: bom.lines.length,
    pack: bom.pack.url,
    shareUrl: `https://hex.onethousanddrones.com/#${fragment}`,
  };
  return report;
}
