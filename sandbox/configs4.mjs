// Round 4: toolboxes, benches, workstations and storage, in the house style
// from the owner's toolbox builds (otd-hex-builds): a spine of full cells
// with half-cell flanks cut face out, tall fused parts, every cell top-loaded
// with a bin as deep as it is tall, drawers on the flank flats, grab bins on
// the spine's free end faces, cable lids and a trinity handle; plus the
// owner's staggered end caps. Built by hand through the public API.
import { cell } from './lib.mjs';

const at = (q, r, level = 0) => cell(q, r, level);
const k = (q, r) => `${q},${r}`;

async function clearStart(b) {
  const first = (await b.state()).nodes[0];
  if (first) await b.apply([{ op: 'remove', ref: first.ref }], 'clear start');
}
const partsOf = (h) => (h === 4 ? [{ level: 0, storeys: 2 }, { level: 2, storeys: 2 }] : h > 3 ? [{ level: 0, storeys: 3 }, { level: 3, storeys: h - 3 }] : [{ level: 0, storeys: h }]);
async function columns(b, cols) {
  const ops = cols.flatMap(({ q, r, h, variant = 'full' }) =>
    partsOf(h).map(({ level, storeys }) => ({ op: 'place', at: at(q, r, level), variant, ...(storeys > 1 ? { storeys } : {}) })));
  return b.apply(ops, `columns ${cols.length} (${ops.length} fused parts)`);
}
// A top-loaded bin as deep as the column's top part; stem without depth suffix.
async function topBins(b, cols, stem, { shallow = false } = {}) {
  const ops = cols.map(({ q, r, h, variant = 'full' }) => {
    const top = shallow ? 1 : partsOf(h).at(-1).storeys;
    const s = typeof stem === 'function' ? stem({ q, r, h, variant }) : stem;
    return { op: 'addBin', at: at(q, r, h - 1), stem: `${s}${top > 1 ? `-x${top}` : ''}` };
  });
  return b.apply(ops, `top bins ${ops.length}`);
}
async function lock(b) {
  await b.fillOffers({ family: 'jointBolt' }, () => true, { label: 'joint bolts' });
}
// Drawers on flank flats: the tallest drawer the half offers, stacked up the column.
async function flankDrawers(b, cells, style) {
  let n = 0;
  for (const { q, r } of cells) {
    for (let pass = 0; pass < 6; pass++) {
      const offers = (await b.offers({ family: 'drawer', ...(style ? { type: style } : {}), storeys: 2 })).filter((o) => o.at.q === q && o.at.r === r);
      const single = offers.length ? [] : (await b.offers({ family: 'drawer', ...(style ? { type: style } : {}) })).filter((o) => o.at.q === q && o.at.r === r);
      const o = offers[0] ?? single[0];
      if (!o) break;
      const res = await b.hex.call('apply', o.op);
      if (!res.ok) break;
      n++;
    }
  }
  b.log(`  flank drawers: ${n}`);
}
// Grab bins (bolt-on, plain or divided, no ports or drains) on given cells' free faces, tallest first.
async function grabBins(b, cells, { max = 4 } = {}) {
  const ks = new Set(cells.map(({ q, r }) => k(q, r)));
  let n = 0;
  for (let pass = 0; pass < max; pass++) {
    const offers = (await b.offers({ family: 'binBolt' })).filter((o) => ks.has(k(o.at.q, o.at.r)) && /^hex-bin-bolt-[a-z-]*port(-div\d)?(-x2)?$/.test(o.op.stem) && !/drain/.test(o.op.stem));
    offers.sort((a, z) => (z.op.stem.endsWith('-x2') ? 1 : 0) - (a.op.stem.endsWith('-x2') ? 1 : 0) || (z.op.stem.includes('div') ? 1 : 0) - (a.op.stem.includes('div') ? 1 : 0));
    let placed = false;
    for (const o of offers) {
      const res = await b.hex.call('apply', o.op);
      if (res.ok) { n++; placed = true; break; }
    }
    if (!placed) break;
  }
  b.log(`  grab bins: ${n}`);
}
async function lids(b, cells, type = 'cable') {
  let n = 0;
  for (const c of cells) {
    const o = (await b.offers({ family: 'cover', face: 'top', type })).find((x) => x.at.q === c.q && x.at.r === c.r && x.at.level === c.level);
    if (o && (await b.hex.call('apply', o.op)).ok) n++;
  }
  b.log(`  ${type} lids: ${n}/${cells.length}`);
}
async function handleOn(b, c) {
  const o = (await b.offers({ family: 'handle' })).find((x) => x.at.q === c.q && x.at.r === c.r && x.at.level === c.level);
  const ok = o ? (await b.hex.call('apply', o.op)).ok : false;
  b.log(`  trinity handle ${c.q},${c.r}: ${ok ? 'ok' : 'none offered'}`);
}

// Owner rule: staggered end caps, tallest that fit (see configs3.mjs).
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
  // Capping one face can open another to a cap, so pass until nothing new is offered.
  for (let pass = 0; pass < 4; pass++) {
    const before = (await b.offers({ family: 'cap' })).length;
    if (!before) break;
    await capPass(b);
    if ((await b.offers({ family: 'cap' })).length >= before) break;
  }
}
async function capPass(b) {
  const faces = new Map();
  for (const o of await b.offers({ family: 'cap' })) {
    const key = `${o.at.q},${o.at.r},${o.op.bearingDeg}`;
    const f = faces.get(key) ?? { q: o.at.q, r: o.at.r, face: o.op.face, bearing: o.op.bearingDeg, levels: new Set() };
    f.levels.add(o.at.level);
    faces.set(key, f);
  }
  let tall = 0;
  let short = 0;
  for (const f of faces.values()) {
    const levels = [...f.levels].sort((a, z) => a - z);
    const odd = (((f.bearing + 30) / 60) % 6) % 2 === 1;
    for (const { level, storeys } of capPlan(levels.length, odd)) {
      const op = { op: 'addCap', at: at(f.q, f.r, levels[0] + level), face: f.face, bearingDeg: f.bearing, ...(storeys === 2 ? { storeys: 2 } : {}) };
      const r = await b.hex.call('apply', op);
      if (!r.ok && storeys === 2) {
        const a1 = await b.hex.call('apply', { ...op, storeys: undefined });
        const a2 = await b.hex.call('apply', { ...op, at: at(f.q, f.r, levels[0] + level + 1), storeys: undefined });
        short += (a1.ok ? 1 : 0) + (a2.ok ? 1 : 0);
        continue;
      }
      if (r.ok) storeys === 2 ? tall++ : short++;
    }
  }
  await b.hex.call('settle');
  b.log(`  staggered caps: ${tall} tall + ${short} short`);
}

async function nodesAt(b, family, c) {
  return (await b.state()).nodes.filter((n) => n.family === family && n.at && n.at.q === c.q && n.at.r === c.r && (c.level == null || n.at.level === c.level));
}
async function prop(b, id, on, extra = {}) {
  if (!on) { b.log(`  prop ${id}: no surface`); return null; }
  // No drop retry: a dropped prop tumbles (a lamp on the floor, a tilted mug).
  // A prop that does not rest where a person would put it is skipped and logged.
  // Dropping is allowed only INTO a container (bin, grab bin), where the prop
  // settles inside it; never onto a lid or the bench.
  const { into = false, ...rest } = extra;
  let o = await b.hex.call('apply', { op: 'addProp', id, on, ...rest });
  if (!o.ok && into) o = await b.hex.call('apply', { op: 'addProp', id, on, drop: true, ...rest });
  b.log(`  prop ${id}: ${o.ok ? 'ok' : 'SKIPPED ' + o.code}`);
  return o.ok ? o.added[0] : null;
}
async function soilPlant(b, binRef, plantId) {
  await b.hex.call('apply', { op: 'fillSoil', part: binRef });
  const p = await b.hex.call('apply', { op: 'plant', id: plantId, in: binRef });
  b.log(`  plant ${plantId}: ${p.ok ? 'ok' : p.code}`);
}

// Spine along r with flanks: west (-1, r) half-e and east (1, r - 1) half-w, cut faces out.
const spineAndFlanks = (n, h, q0 = 0) => ({
  spine: Array.from({ length: n }, (_, r) => ({ q: q0, r, h })),
  west: Array.from({ length: n }, (_, r) => ({ q: q0 - 1, r, h, variant: 'half-e' })),
  east: Array.from({ length: n }, (_, r) => ({ q: q0 + 1, r: r - 1, h, variant: 'half-w' })),
});

export const CONFIGS = [
  {
    id: 'toolbox',
    title: 'Two-storey toolbox',
    pitch: 'The house toolbox: a three-cell spine of deep divided bins under cable lids, tall slide drawers down both flanks, grab bins on the spine ends, and a trinity handle on the centre lid; a drill rests on the bench beside it.',
    async build(b) {
      await clearStart(b);
      const { spine, west, east } = spineAndFlanks(3, 2);
      await columns(b, [...spine, ...west, ...east]);
      await topBins(b, spine, ({ r }) => (r === 1 ? 'hex-bin-full-div2' : 'hex-bin-full-div3'));
      await lock(b);
      await flankDrawers(b, [...west, ...east], 'slide');
      await grabBins(b, [spine[0], spine[2]], { max: 2 });
      await lids(b, spine.map(({ q, r }) => at(q, r, 1)));
      await handleOn(b, at(0, 1, 1));
      await staggeredCaps(b);
      await prop(b, 'drill', 'bench', { atMm: { x: 420, z: 260 }, yawDeg: -30 });
    },
  },
  {
    id: 'tool-tote',
    title: 'Open tool tote',
    pitch: 'A one-storey carry tote: open divided trays at both ends, hex drivers in one, a lidded centre with the trinity handle to carry it by, screws in the other, and empty grab bins down the sides for whatever comes along.',
    async build(b) {
      await clearStart(b);
      const spine = [0, 1, 2].map((r) => ({ q: 0, r, h: 1 }));
      await columns(b, spine);
      await topBins(b, [spine[0], spine[2]], 'hex-bin-full-div3');
      await lock(b);
      await lids(b, [at(0, 1, 0)], 'plain');
      await handleOn(b, at(0, 1, 0));
      await grabBins(b, spine, { max: 4 });
      await staggeredCaps(b);
      const [front] = await nodesAt(b, 'bin', at(0, 2, 0));
      const [back] = await nodesAt(b, 'bin', at(0, 0, 0));
      await prop(b, 'heap-screws-div3', front?.ref, { into: true });
      await prop(b, 'hexdriver-set', back?.ref, { into: true });
      // Pliers were cut: dropped into a grab bin they landed outside it, standing on their tips (review 3).
    },
  },
  {
    id: 'hex-bench',
    title: 'Hex bench',
    pitch: 'A five-cell, seat-height bench: lidded five-storey seat cells with a flush front row of tall drawers centred under the seat edge, and mirrored six-storey rosemary planters as its arms; the staggered caps run its full length and the seat is left clear to sit on.',
    async build(b) {
      await clearStart(b);
      const seat = [1, 2, 3, 4, 5].map((q) => ({ q, r: 0, h: 5 }));
      const arms = [{ q: 0, r: 0, h: 6 }, { q: 6, r: 0, h: 6 }];
      // Row r = 1, q = 1..4 sits centred under the seat row q = 1..5 (axial offset of half a cell).
      const front = [1, 2, 3, 4].map((q) => ({ q, r: 1, h: 5, variant: 'half-n' }));
      await columns(b, [...seat, ...arms, ...front]);
      await topBins(b, arms, 'hex-bin-full-drain');
      await lock(b);
      await flankDrawers(b, front.map(({ q, r }) => ({ q, r })), null);
      await lids(b, seat.map(({ q, r }) => at(q, r, 4)), 'plain');
      await lids(b, front.map(({ q, r }) => at(q, r, 4)), 'plain');
      await staggeredCaps(b);
      for (const e of arms) {
        const [bin] = await nodesAt(b, 'bin', at(e.q, e.r, 5));
        if (bin) await soilPlant(b, bin.ref, 'rosemary-harvest');
      }
    },
  },
  {
    id: 'parts-cabinet',
    title: 'Canted parts cabinet',
    pitch: 'A two-sided small-parts cabinet for a workbench island: two-storey drawers stacked down both long faces at the canted angle the owner noticed on the first drawer tower, so it is reachable from either side, deep bins in its spine and a lamp on top.',
    async build(b) {
      await clearStart(b);
      // Spine along q; the south flank's half-n cells and the north flank's half-s cells face out.
      const spine = [0, 1, 2].map((q) => ({ q, r: 0, h: 3 }));
      const south = [0, 1, 2].map((q) => ({ q: q - 1, r: 1, h: 4, variant: 'half-n' }));
      const north = [0, 1, 2].map((q) => ({ q: q + 1, r: -1, h: 4, variant: 'half-s' }));
      await columns(b, [...spine, ...south, ...north]);
      await topBins(b, spine.slice(0, 2), 'hex-bin-full-div3');
      await lock(b);
      await flankDrawers(b, [...south, ...north].map(({ q, r }) => ({ q, r })), null);
      await lids(b, [at(2, 0, 2)], 'plain');
      await lids(b, [...south, ...north].map(({ q, r }) => at(q, r, 3)), 'plain');
      await staggeredCaps(b);
      const [lamp] = await nodesAt(b, 'cover', at(1, 1, 3));
      await prop(b, 'task-lamp', lamp?.ref);
    },
  },
  {
    id: 'electronics-desk',
    title: 'Electronics workstation',
    pitch: 'A desk-back organiser for a soldering and repair bench: shallow divided trays of screws, standoffs and nuts on top of a three-storey spine, two-storey drawers facing the user in front, a lamp on its end lid and a multimeter on the bench beside it.',
    async build(b) {
      await clearStart(b);
      const spine = [0, 1, 2, 3].map((q) => ({ q, r: -1, h: 3 }));
      const front = [0, 1, 2].map((q) => ({ q, r: 0, h: 2, variant: 'half-n' }));
      await columns(b, [...spine, ...front]);
      // Shallow one-storey trays on the spine tops: parts must be visible and in reach.
      await topBins(b, spine.slice(0, 3), ({ q }) => (q === 1 ? 'hex-bin-full-div2' : 'hex-bin-full-div3'), { shallow: true });
      await lock(b);
      await flankDrawers(b, front.map(({ q, r }) => ({ q, r })), null);
      await lids(b, [at(3, -1, 2)], 'plain');
      await lids(b, front.map(({ q, r }) => at(q, r, 1)), 'plain');
      await staggeredCaps(b);
      const heaps = ['heap-screws-div3', 'heap-standoffs-div2', 'heap-nuts-div3'];
      for (const [i, c] of spine.slice(0, 3).entries()) {
        const [bin] = await nodesAt(b, 'bin', at(c.q, c.r, 2));
        await prop(b, heaps[i], bin?.ref);
      }
      const [lamp] = await nodesAt(b, 'cover', at(3, -1, 2));
      await prop(b, 'task-lamp', lamp?.ref);
      await prop(b, 'multimeter', 'bench', { atMm: { x: -380, z: 330 }, yawDeg: 20 });
    },
  },
  {
    id: 'potting-station',
    title: 'Potting station',
    pitch: 'A potting bench top: a three-cell spine with a deep planter growing a patio tomato at one end, a lidded work surface in the middle where a basil seedling is being potted on, a deep soil bin at the other end, and drawers in front for tools and labels.',
    async build(b) {
      await clearStart(b);
      const spine = [0, 1, 2].map((q) => ({ q, r: -1, h: 3 }));
      const front = [0, 1, 2].map((q) => ({ q, r: 0, h: 2, variant: 'half-n' }));
      await columns(b, [...spine, ...front]);
      await topBins(b, [spine[0]], 'hex-bin-full-drain');
      await topBins(b, [spine[2]], 'hex-bin-full');
      await lock(b);
      await flankDrawers(b, front.map(({ q, r }) => ({ q, r })), null);
      await lids(b, [at(1, -1, 2)], 'plain');
      await lids(b, front.map(({ q, r }) => at(q, r, 1)), 'plain');
      await staggeredCaps(b);
      const [planter] = await nodesAt(b, 'bin', at(0, -1, 2));
      if (planter) await soilPlant(b, planter.ref, 'tomato-micro-harvest');
      const [soilBin] = await nodesAt(b, 'bin', at(2, -1, 2));
      if (soilBin) b.log(`  soil bin: ${(await b.hex.call('apply', { op: 'fillSoil', part: soilBin.ref })).ok ? 'filled' : 'not fillable'}`);
      const [work] = await nodesAt(b, 'cover', at(1, -1, 2));
      const pot = await prop(b, 'pot-s', work?.ref);
      if (pot) {
        const filled = await b.hex.call('apply', { op: 'fillPot', ref: pot });
        const p = await b.hex.call('apply', { op: 'plant', id: 'basil-seedling', in: filled.ok ? filled.added[0] : pot });
        b.log(`  basil seedling potted on: ${p.ok ? 'ok' : p.code}`);
      }
    },
  },
];
