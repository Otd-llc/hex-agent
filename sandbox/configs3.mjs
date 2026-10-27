// Round 3 (revised after the first independent review): planter-led builds
// following DESIGN_RUBRIC.md. Tall fused columns (stacked as fused parts above
// three storeys), drained planters as deep as the top part, soil everywhere,
// plants matched to depth and position. Built by hand through the public API.
import { cell, hexagon } from './lib.mjs';

const at = (q, r, level = 0) => cell(q, r, level);

async function clearStart(b) {
  const first = (await b.state()).nodes[0];
  if (first) await b.apply([{ op: 'remove', ref: first.ref }], 'clear start');
}

// A column of height h (1..6) as at most two fused parts: 3 storeys, then the rest.
const partsOf = (h) => (h > 3 ? [{ level: 0, storeys: 3 }, { level: 3, storeys: h - 3 }] : [{ level: 0, storeys: h }]);
async function columns(b, cols) {
  const ops = cols.flatMap(({ q, r, h, variant = 'full' }) =>
    partsOf(h).map(({ level, storeys }) => ({ op: 'place', at: at(q, r, level), variant, ...(storeys > 1 ? { storeys } : {}) })));
  return b.apply(ops, `columns ${cols.length} (${ops.length} fused parts)`);
}

// A drained planter as deep as the column's top part, keyed on its top storey.
async function planters(b, cols) {
  const ops = cols.map(({ q, r, h }) => {
    const top = partsOf(h).at(-1).storeys;
    return { op: 'addBin', at: at(q, r, h - 1), stem: `hex-bin-full-drain${top > 1 ? `-x${top}` : ''}` };
  });
  return b.apply(ops, `planters ${ops.length}`);
}

// Ground-level notch planters only, the tallest drained one per site, never
// stacked singles (a stacked lower notch is roofed and cannot be planted).
async function gapPlanters(b) {
  let n = 0;
  for (let pass = 0; pass < 40; pass++) {
    const offers = (await b.offers({ family: 'notch' })).filter((o) => o.at.level === 0 && /^hex-bin-notch-(mf|fm)-drain(-x[23])?$/.test(o.op.stem));
    offers.sort((a, z) => Number(z.op.stem.match(/-x(\d)$/)?.[1] ?? 1) - Number(a.op.stem.match(/-x(\d)$/)?.[1] ?? 1));
    let placed = false;
    for (const o of offers) {
      const r = await b.hex.call('apply', o.op);
      if (r.ok) { n++; placed = true; break; }
    }
    if (!placed) break;
  }
  b.log(`  notch planters: ${n}`);
}

// Owner rule (round 3): end caps on every open face, the tallest that fit,
// staggered between neighbouring faces so the seams never line up. Faces
// alternate round each cell by bearing (30, 90, 150 ... -> index 0..5): even
// faces start with the tall cap, odd faces start one storey up, below a short
// cap, so a column of height h is capped 2+2+...(+1) or 1+2+2+...(+1).
const capPlan = (h, odd) => {
  const out = [];
  let level = 0;
  if (odd && h >= 2) out.push({ level: level++, storeys: 1 });
  while (level < h) {
    const s = h - level >= 2 ? 2 : 1;
    out.push({ level, storeys: s });
    level += s;
  }
  return out;
};
async function staggeredCaps(b) {
  const offers = await b.offers({ family: 'cap' });
  const faces = new Map(); // "q,r,bearing" -> {q, r, face, bearing, levels:Set}
  for (const o of offers) {
    const k = `${o.at.q},${o.at.r},${o.op.bearingDeg}`;
    const f = faces.get(k) ?? { q: o.at.q, r: o.at.r, face: o.op.face, bearing: o.op.bearingDeg, levels: new Set() };
    f.levels.add(o.at.level);
    faces.set(k, f);
  }
  let tall = 0;
  let short = 0;
  for (const f of faces.values()) {
    const levels = [...f.levels].sort((a, z) => a - z);
    const base = levels[0];
    const h = levels.length; // contiguous open storeys on this face
    const odd = (((f.bearing + 30) / 60) % 6) % 2 === 1;
    for (const { level, storeys } of capPlan(h, odd)) {
      const op = { op: 'addCap', at: at(f.q, f.r, base + level), face: f.face, bearingDeg: f.bearing, ...(storeys === 2 ? { storeys: 2 } : {}) };
      let r = await b.hex.call('apply', op);
      if (!r.ok && storeys === 2) {
        // A tall cap that does not fit falls back to two short ones.
        const a1 = await b.hex.call('apply', { ...op, storeys: undefined });
        const a2 = await b.hex.call('apply', { ...op, at: at(f.q, f.r, base + level + 1), storeys: undefined });
        short += (a1.ok ? 1 : 0) + (a2.ok ? 1 : 0);
        continue;
      }
      if (r.ok) storeys === 2 ? tall++ : short++;
    }
  }
  await b.hex.call('settle');
  b.log(`  staggered caps: ${tall} tall + ${short} short on ${faces.size} faces`);
}

async function lock(b) {
  await b.fillOffers({ family: 'jointBolt' }, () => true, { label: 'joint bolts' });
}

// Soil in every planter, then a plant chosen by depth and position, falling
// back to a smaller stage of the same crop; an empty planter is logged.
async function plantAll(b, choose) {
  const nodes = (await b.state()).nodes.filter((n) => ['bin', 'notch', 'bay'].includes(n.family));
  let planted = 0;
  for (const n of nodes) {
    await b.hex.call('apply', { op: 'fillSoil', part: n.ref });
    const id = choose(n);
    if (!id) continue;
    let p;
    for (const t of [...new Set([id, id.replace(/-(young|harvest)$/, '-seedling')])]) {
      p = await b.hex.call('apply', { op: 'plant', id: t, in: n.ref });
      if (p.ok) { if (t !== id) b.log(`  ${n.ref}: ${id} has no room, planted ${t}`); break; }
    }
    if (p.ok) planted++;
    else b.log(`  EMPTY ${n.ref}: no plant rests (${p.code})`);
  }
  await b.hex.call('settle');
  b.log(`  planted ${planted}/${nodes.length} planters`);
}
const cellOf = (n) => (n.at ? `${n.at.q},${n.at.r}` : '');

const RING = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const CONFIGS = [
  {
    id: 'strawberry-pyramid',
    title: 'Strawberry pyramid',
    pitch: 'A nineteen-cell strawberry patch stepping three, two and one storeys from the centre so every plant gets sun: fruiting strawberries on the inner tier, younger plants on the outer tier and in the rim notches, and a nasturtium crowning it.',
    async build(b) {
      await clearStart(b);
      const ring = (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(-c.q - c.r));
      const cols = hexagon(2).map((c) => ({ q: c.q, r: c.r, h: 3 - ring(c) }));
      await columns(b, cols);
      await planters(b, cols);
      await gapPlanters(b);
      await lock(b);
      await staggeredCaps(b);
      let k = 0;
      await plantAll(b, (n) => {
        if (n.family !== 'bin') return k++ % 3 === 2 ? 'alyssum-young' : 'strawberry-young';
        if (cellOf(n) === '0,0') return 'nasturtium-harvest';
        // Young plants on the outer tier keep the 3-2-1 steps visible.
        return n.at.level === 0 ? 'strawberry-young' : 'strawberry-harvest';
      });
    },
  },
  {
    id: 'salad-theatre',
    title: 'Succession salad theatre',
    pitch: 'Three rows stepping down to the front, each a stage of the same salad bed: harvest-size kale, oakleaf lettuce and bok choy at the back, young lettuces and bok choy in the middle, the next sowing of lettuce, spinach and microgreens in front.',
    async build(b) {
      await clearStart(b);
      const back = [0, 1, 2].map((q) => ({ q, r: -1, h: 3 }));
      const mid = [0, 1, 2].map((q) => ({ q, r: 0, h: 2 }));
      const front = [0, 1, 2].map((q) => ({ q: q - 1, r: 1, h: 1 }));
      const cols = [...back, ...mid, ...front];
      await columns(b, cols);
      await planters(b, cols);
      await lock(b);
      await staggeredCaps(b);
      const rows = { '-1': ['kale-harvest', 'lettuce-oakleaf-harvest', 'bokchoy-harvest'], 0: ['lettuce-oakleaf-young', 'bokchoy-young', 'lettuce-romaine-young'], 1: ['lettuce-butterhead-young', 'spinach-young', 'microgreens-harvest'] };
      const used = { '-1': 0, 0: 0, 1: 0 };
      await plantAll(b, (n) => rows[n.at.r][used[n.at.r]++ % 3]);
    },
  },
  {
    id: 'tomato-companions',
    title: 'Tomatoes with companions',
    pitch: 'A patio bed in two rows: three-storey planters, the deepest the system makes, carrying micro tomatoes and a pepper at the back, and a low front row of companions that help them: basil, marigold and nasturtium.',
    async build(b) {
      await clearStart(b);
      const back = [0, 1, 2].map((q) => ({ q, r: -1, h: 3 }));
      const front = [0, 1, 2].map((q) => ({ q: q - 1, r: 0, h: 1 }));
      await columns(b, [...back, ...front]);
      await planters(b, [...back, ...front]);
      await lock(b);
      await staggeredCaps(b);
      const pick = { '-1': ['tomato-micro-harvest', 'pepper-harvest', 'tomato-micro-harvest'], 0: ['basil-harvest', 'marigold-harvest', 'nasturtium-young'] };
      const used = { '-1': 0, 0: 0 };
      await plantAll(b, (n) => pick[n.at.r][used[n.at.r]++ % 3]);
    },
  },
];
// Dropped from round 3, with the reason kept:
// - herb-spiral: any spiral that peaks at its centre hides the cell behind the
//   centre from the configurator's fixed camera, and the public API has no
//   camera control; two layouts each left a planter and its claimed herb unseen
//   (review 3: FAIL).
// - salad-ring: the "open heart" is one empty cell, too small to stand in, and
//   the lettuces hide it from the camera (review 2: FAIL).
// - corner-wedge: a sixty-degree wedge does not fit a ninety-degree corner, so
//   its stated purpose was false (review 2: FAIL).
// - windowsill-trough (a run of half-e cells): no joint bolts are offered between
//   stacked half cells in a line and every side connector is refused MESH_CLASH,
//   so the run cannot be locked (LOOSE_BODY).
