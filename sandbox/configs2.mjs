// Round 2: ten configurations with one purpose, a setting and a deliberate
// silhouette each. Built by hand through the public API, like round 1.
import { cell, hexagon, key } from './lib.mjs';

const at = (q, r, level = 0) => cell(q, r, level);
const inCells = (cells) => { const ks = new Set(cells.map(key)); return (o) => ks.has(key(o.at)); };
const stemHas = (...parts) => (o) => parts.every((p) => (o.op.stem ?? '').includes(p));
const and = (...fs) => (o) => fs.every((f) => f(o));
const column = (q, r, storeys, variant = 'full') => Array.from({ length: storeys }, (_, l) => ({ ...at(q, r, l), variant }));

async function nodesOf(b, family, where = () => true) {
  return (await b.state()).nodes.filter((n) => n.family === family && where(n));
}
const atCell = (c) => (n) => n.at && key(n.at) === key(c);

async function finishShell(b, { covers = [], caps = true } = {}) {
  await b.fillOffers({ family: 'jointBolt' }, () => true, { label: 'joint bolts' });
  for (const c of covers) await b.fillOffers({ family: 'cover', face: 'top' }, inCells([c]), { max: 1, label: `cover ${key(c)}` });
  if (caps) await b.fillOffers({ family: 'cap' }, () => true, { label: 'caps' });
}

// Put one prop on one named surface (a node ref or 'bench' with a position); log refusals.
async function prop(b, id, on, extra = {}) {
  let o = await b.hex.call('apply', { op: 'addProp', id, on, ...extra });
  if (!o.ok && on !== 'bench') o = await b.hex.call('apply', { op: 'addProp', id, on, drop: true, ...extra });
  b.log(`  prop ${id}: ${o.ok ? 'ok' : o.code}`);
  return o.ok ? o.added[0] : null;
}
async function coverAt(b, c) { return (await nodesOf(b, 'cover', atCell(c)))[0]?.ref; }
async function binAt(b, c) { return (await nodesOf(b, 'bin', atCell(c)))[0]?.ref; }

// A potted plant on a cover: pot, soil, plant.
async function pottedPlant(b, coverRef, potId, plantId) {
  if (!coverRef) return;
  const pot = await prop(b, potId, coverRef);
  if (!pot) return;
  const filled = await b.hex.call('apply', { op: 'fillPot', ref: pot });
  const ref = filled.ok ? filled.added[0] : pot;
  const p = await b.hex.call('apply', { op: 'plant', id: plantId, in: ref });
  b.log(`  plant ${plantId} in ${potId}: ${p.ok ? 'ok' : p.code}`);
}
async function soilAndPlant(b, binRef, plantId) {
  if (!binRef) return;
  await b.hex.call('apply', { op: 'fillSoil', part: binRef });
  const p = await b.hex.call('apply', { op: 'plant', id: plantId, in: binRef });
  b.log(`  plant ${plantId}: ${p.ok ? 'ok' : p.code}`);
}

export const CONFIGS = [
  {
    id: 'pit-case',
    title: 'Drone pit case',
    pitch: 'The kit you carry to the flying field: two drawers on one front for spares, a top storey of divided trays holding screws, standoffs and batteries, a lid with a handle. Radio and goggles ride alongside.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      for (const l of [0, 1]) await b.place([{ ...at(0, 0, l), variant: 'half-n' }, { ...at(1, 0, l), variant: 'half-n' }, at(0, -1, l), at(1, -1, l)]);
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'front drawers, two storeys' });
      await b.fillOffers({ family: 'bin', level: 1 }, and(inCells([at(1, -1, 1)]), stemHas('full-div3')), { max: 1, label: 'divided tray' });
      await finishShell(b, { covers: [at(0, -1, 1), at(0, 0, 1), at(1, 0, 1)] });
      await b.fillOffers({ family: 'handle' }, inCells([at(0, -1, 1)]), { max: 1, label: 'handle' });
      await prop(b, 'heap-standoffs-div3', await binAt(b, at(1, -1, 1)));
      await prop(b, 'lipo-4s', await coverAt(b, at(1, 0, 1)));
      await prop(b, 'radio', 'bench', { atMm: { x: 460, z: 140 }, yawDeg: -20 });
      await prop(b, 'goggles', 'bench', { atMm: { x: -360, z: 180 }, yawDeg: 25 });
      await prop(b, 'cinewhoop', 'bench', { atMm: { x: 120, z: 420 }, yawDeg: 15 });
    },
  },
  {
    id: 'tiered-herbs',
    title: 'Tiered kitchen herb garden',
    pitch: 'A three-step staircase of draining planters so every herb gets light and every pot is in reach: front step one storey, middle two, back three. A grow light stands behind.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      const steps = [[1, 1], [2, 2], [3, 3]]; // [height, ... ] by row r = 1, 0, -1
      const rows = [{ r: 1, h: 1 }, { r: 0, h: 2 }, { r: -1, h: 3 }];
      for (const { r, h } of rows) for (const q of [0, 1, 2]) await b.place(column(q - (r === 1 ? 1 : 0), r, h));
      void steps;
      const tops = rows.flatMap(({ r, h }) => [0, 1, 2].map((q) => at(q - (r === 1 ? 1 : 0), r, h - 1)));
      await b.fillOffers({ family: 'bin', stem: 'hex-bin-full-drain' }, inCells(tops), { label: 'draining planters on each top' });
      await finishShell(b);
      const herbs = ['basil-harvest', 'parsley-harvest', 'chives-harvest', 'thyme-harvest', 'mint-harvest', 'oregano-harvest', 'rosemary-harvest', 'sage-harvest', 'basil-young'];
      for (const [i, c] of tops.entries()) await soilAndPlant(b, await binAt(b, c), herbs[i % herbs.length]);
      await prop(b, 'grow-light', 'bench', { atMm: { x: 150, z: -520 } });
    },
  },
  {
    id: 'angled-caddy',
    title: 'Angled drawer caddy',
    pitch: 'A desk-corner tower with drawers facing three ways at 60 degrees apart, two storeys each, so a seated person reaches every drawer without leaning: the canted fronts are the point.',
    async build(b) {
      await b.place(column(0, 0, 3).slice(1));
      const wings = [{ c: [0, 1], v: 'half-n' }, { c: [1, 0], v: 'half-w' }, { c: [-1, 0], v: 'half-e' }];
      for (const { c, v } of wings) await b.place(column(c[0], c[1], 2, v));
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers (classic)' });
      await b.fillOffers({ family: 'drawer', type: 'slide' }, () => true, { label: 'drawers (slide)' });
      await finishShell(b, { covers: [at(0, 0, 2)] });
      const top = await coverAt(b, at(0, 0, 2));
      await prop(b, 'mug', top);
      await prop(b, 'laptop-open', 'bench', { atMm: { x: -560, z: 260 }, yawDeg: 35 });
    },
  },
  {
    id: 'bedside',
    title: 'Bedside unit',
    pitch: 'Two cells, two storeys: a drawer for the night things, a lamp, a stack of books and a mug on top.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      for (const l of [0, 1]) await b.place([{ ...at(0, 0, l), variant: 'half-n' }, { ...at(1, 0, l), variant: 'half-n' }, at(0, -1, l), at(1, -1, l)]);
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers, two storeys' });
      await finishShell(b, { covers: [at(0, 0, 1), at(1, 0, 1), at(0, -1, 1), at(1, -1, 1)] });
      await prop(b, 'task-lamp', await coverAt(b, at(0, -1, 1)));
      await prop(b, 'book-stack', await coverAt(b, at(1, -1, 1)));
      await prop(b, 'mug', await coverAt(b, at(1, 0, 1)));
      await prop(b, 'phone', await coverAt(b, at(0, 0, 1)));
    },
  },
  {
    id: 'monitor-riser',
    title: 'Monitor riser with drawers',
    pitch: 'A four-cell bridge under a 27-inch monitor that lifts it to eye level, with drawers facing the user for cables and stationery; keyboard and mouse in front.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      await b.place([0, 1, 2, 3].map((q) => ({ ...at(q, 0), variant: 'half-n' })).concat([0, 1, 2, 3].map((q) => at(q, -1))));
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers facing the user' });
      await finishShell(b, { covers: [0, 1, 2, 3].map((q) => at(q, -1)) });
      await prop(b, 'monitor-27', await coverAt(b, at(1, -1)), { yawDeg: 0 });
      await prop(b, 'keyboard', 'bench', { atMm: { x: 300, z: 520 } });
      await prop(b, 'mouse', 'bench', { atMm: { x: 640, z: 520 } });
      await prop(b, 'phone', await coverAt(b, at(3, -1)));
    },
  },
  {
    id: 'seed-station',
    title: 'Seed-starting station',
    pitch: 'A seven-cell honeycomb of draining trays with seedlings, raised one storey on a ring so it drains, under a grow light with a clip fan for airflow.',
    async build(b) {
      await b.place(hexagon(1).filter((c) => c.q || c.r));
      await b.place(hexagon(1, 1));
      await b.fillOffers({ family: 'bin', level: 1, stem: 'hex-bin-full-drain' }, () => true, { label: 'draining trays, upper storey' });
      await finishShell(b);
      const seedlings = ['lettuce-butterhead-seedling', 'kale-seedling', 'basil-seedling', 'tomato-micro-seedling', 'pepper-seedling', 'marigold-seedling', 'chard-seedling'];
      const bins = await nodesOf(b, 'bin');
      for (const [i, n] of bins.entries()) await soilAndPlant(b, n.ref, seedlings[i % seedlings.length]);
      await prop(b, 'grow-light', 'bench', { atMm: { x: 0, z: -460 } });
      await prop(b, 'clip-fan', 'bench', { atMm: { x: 520, z: 0 }, yawDeg: -90 });
    },
  },
  {
    id: 'plant-pyramid',
    title: 'Indoor plant pyramid',
    pitch: 'A stepped stand for a sunny window: seven cells, three, then one, each top carrying a real pot with soil and a plant, trailing flowers low and fruit high.',
    async build(b) {
      await b.place(hexagon(1).filter((c) => c.q || c.r));
      const mid = [at(0, 0, 1), at(1, -1, 1), at(-1, 0, 1), at(0, 1, 1)];
      await b.place(mid);
      await b.place([at(0, 0, 2)]);
      const lowTops = hexagon(1).filter((c) => c.q || c.r).filter((c) => !mid.some((m) => m.q === c.q && m.r === c.r));
      await finishShell(b, { covers: [...lowTops, ...mid.filter((m) => m.q || m.r), at(0, 0, 2)] });
      const low = ['nasturtium-harvest', 'alyssum-harvest', 'marigold-harvest'];
      for (const [i, c] of lowTops.entries()) await pottedPlant(b, await coverAt(b, c), 'pot-m', low[i % low.length]);
      const midPlants = ['strawberry-harvest', 'pepper-harvest', 'strawberry-harvest'];
      for (const [i, c] of mid.filter((m) => m.q || m.r).entries()) await pottedPlant(b, await coverAt(b, c), 'pot-m', midPlants[i]);
      await pottedPlant(b, await coverAt(b, at(0, 0, 2)), 'pot-l', 'tomato-patio-young');
    },
  },
  {
    id: 'repair-station',
    title: 'Electronics repair station',
    pitch: 'A raised back row of drawers and divided trays behind a three-cell work surface: screws, nuts and standoffs within reach, multimeter and drivers on the bench, a task lamp overhead.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      for (const l of [0, 1]) await b.place([0, 1, 2].map((q) => ({ ...at(q, -1, l), variant: 'half-n' })).concat([0, 1, 2, 3].map((q) => at(q, -2, l))));
      await b.place([0, 1, 2].map((q) => at(q - 1, 0)));
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers, two storeys' });
      await b.fillOffers({ family: 'bin', level: 1 }, and(inCells([0, 1, 2].map((q) => at(q, -2, 1))), stemHas('full-div3')), { label: 'divided trays, back' });
      await finishShell(b, { covers: [0, 1, 2].map((q) => at(q - 1, 0)).concat([at(3, -2, 1)], [0, 1, 2].map((q) => at(q, -1, 1))) });
      await prop(b, 'heap-screws-div3', await binAt(b, at(0, -2, 1)));
      await prop(b, 'heap-nuts-div3', await binAt(b, at(1, -2, 1)));
      await prop(b, 'heap-standoffs-div3', await binAt(b, at(2, -2, 1)));
      await prop(b, 'multimeter', await coverAt(b, at(-1, 0)));
      await prop(b, 'hexdriver-set', await coverAt(b, at(0, 0)));
      await prop(b, 'filament-spool', await coverAt(b, at(1, 0)));
      await prop(b, 'task-lamp', await coverAt(b, at(3, -2, 1)));
    },
  },
  {
    id: 'charging-station',
    title: 'Drone charging station',
    pitch: 'A ring of six landing pads around a vented charger bay: each pad carries a drone, batteries sit in the centre trays, louvred ports let the charger breathe.',
    async build(b) {
      await b.place(hexagon(1).filter((c) => c.q || c.r));
      await b.fillOffers({ family: 'bin' }, and(inCells([at(0, 0)]), stemHas('full-div3')), { max: 1, label: 'battery tray' });
      await b.fillOffers({ family: 'port', stem: 'hex-port-louvre' }, inCells(hexagon(1).filter((c) => c.q || c.r)), { max: 3, label: 'louvred vents' });
      await finishShell(b, { covers: hexagon(1).filter((c) => c.q || c.r) });
      const pads = hexagon(1).filter((c) => c.q || c.r);
      for (const [i, c] of pads.entries()) await prop(b, 'cinewhoop', await coverAt(b, c), { yawDeg: i * 60 });
      await prop(b, 'quad-5in', 'bench', { atMm: { x: 560, z: 300 }, yawDeg: -30 });
      await prop(b, 'radio', 'bench', { atMm: { x: -520, z: 320 }, yawDeg: 20 });
      await prop(b, 'lipo-6s', await binAt(b, at(0, 0)));
    },
  },
  {
    id: 'coffee-station',
    title: 'Coffee station',
    pitch: 'A stepped counter unit: a raised back shelf for mugs and glasses, a front row of drawers for pods and spoons, a working top in between.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      await b.place([0, 1, 2].map((q) => ({ ...at(q, 0), variant: 'half-n' })).concat([0, 1, 2].map((q) => at(q, -1))));
      await b.place([0, 1, 2, 3].map((q) => at(q, -2)).concat([0, 1, 2, 3].map((q) => at(q, -2, 1))));
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers' });
      await finishShell(b, { covers: [0, 1, 2].map((q) => at(q, -1)).concat([0, 1, 2, 3].map((q) => at(q, -2, 1))) });
      const shelf = [0, 1, 2, 3].map((q) => at(q, -2, 1));
      const cups = ['mug', 'glass-tumbler', 'mug', 'cup-tumbler'];
      for (const [i, c] of shelf.entries()) await prop(b, cups[i], await coverAt(b, c));
      await prop(b, 'bowl', await coverAt(b, at(1, -1)));
      await prop(b, 'spoon', await coverAt(b, at(2, -1)));
    },
  },
];
