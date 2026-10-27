// Ten reference configurations, built by hand through the public API.
// Each build() only asks the configurator what fits (openSockets) and applies
// it; nothing reaches past window.hexAPI.
import { cell, hexagon, key } from './lib.mjs';

const at = (q, r, level = 0) => cell(q, r, level);
const inCells = (cells) => { const ks = new Set(cells.map(key)); return (o) => ks.has(key(o.at)); };
const stemHas = (...parts) => (o) => parts.every((p) => (o.op.stem ?? '').includes(p));
const and = (...fs) => (o) => fs.every((f) => f(o));

// Finishing pass shared by every build: lock the bodies together, close the
// tops asked for, cap every open edge.
async function finishShell(b, { covers = [], caps = true } = {}) {
  await b.fillOffers({ family: 'jointBolt' }, () => true, { label: 'joint bolts' });
  if (covers.length) await b.fillOffers({ family: 'cover', face: 'top' }, inCells(covers), { label: 'top covers' });
  if (caps) await b.fillOffers({ family: 'cap' }, () => true, { label: 'caps' });
}

async function propIds(b, kind, stage) {
  const props = await b.hex.call('listProps');
  return props.filter((p) => (!kind || p.kind === kind) && (!stage || p.stage === stage)).map((p) => p.id);
}

async function nodesOf(b, family, where = () => true) {
  return (await b.state()).nodes.filter((n) => n.family === family && where(n));
}

// Stage each prop on the first candidate surface that takes it (props rest on
// pieces, covers, caps, bins and drawers; not every one has room).
async function stageOn(b, ids, parts) {
  const used = new Set();
  const codes = {};
  let placed = 0;
  for (const id of ids) {
    for (const p of parts) {
      if (used.has(p.ref)) continue;
      let o = await b.hex.call('apply', { op: 'addProp', id, on: p.ref });
      if (!o.ok) o = await b.hex.call('apply', { op: 'addProp', id, on: p.ref, drop: true });
      if (o.ok) { used.add(p.ref); placed++; break; }
      (codes[o.code] ??= 0), codes[o.code]++;
    }
  }
  await b.hex.call('settle');
  b.log(`  props: ${placed}/${ids.length} staged${placed < ids.length ? ' (refusals ' + JSON.stringify(codes) + ')' : ''}`);
}
const spikeJunction = (s) => s.ref.split('#')[1].split('|').map((x) => { const [q, r] = x.split(',').map(Number); return { q, r }; });

async function plantBins(b, kind, stage) {
  const bins = await nodesOf(b, 'bin');
  if (!bins.length) return;
  await b.apply(bins.map((n) => ({ op: 'fillSoil', part: n.ref })), 'soil');
  const plants = (await propIds(b, kind, stage)).filter(Boolean);
  const plantable = (await b.hex.call('listProps')).filter((p) => p.plant && plants.includes(p.id)).map((p) => p.id);
  await b.apply(bins.map((n, i) => ({ op: 'plant', id: plantable[i % plantable.length], in: n.ref })), `plant ${kind}`);
}

export const CONFIGS = [
  {
    id: 'field-kit',
    title: 'Drone field repair kit',
    pitch: 'A carry-anywhere kit: drawers for small parts, divided trays for screws and props, a louvred bay for a charger, and a handle.',
    async build(b) {
      await b.place([at(1, 0), at(1, -1), at(0, -1)]);
      await b.place([at(0, 1), at(1, 1)], 'half-n');
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers' });
      await b.fillOffers({ family: 'bin' }, and(inCells([at(1, 0), at(1, -1)]), stemHas('div3')), { max: 2, label: 'divided bins' });
      await b.fillOffers({ family: 'port', stem: 'hex-port-louvre' }, inCells([at(0, 0)]), { max: 2, label: 'louvre vents' });
      await finishShell(b, { covers: [at(0, 0)] });
      await b.fillOffers({ family: 'handle' }, () => true, { max: 1, label: 'handle' });
      const cover = (await nodesOf(b, 'cover'))[0];
      const trays = await nodesOf(b, 'bin');
      const pieces = await nodesOf(b, 'piece');
      await stageOn(b, ['cinewhoop', 'lipo-4s', 'prop-stack', 'radio'], [...(cover ? [cover] : []), ...trays, ...pieces]);
    },
  },
  {
    id: 'herb-garden',
    title: 'Irrigated herb garden',
    pitch: 'Four planter cells on one straight water line; third-depth draining trays clear the pipe, filled with soil and planted with herbs.',
    async build(b) {
      const row = [at(1, 0), at(2, 0), at(3, 0)];
      await b.place(row);
      await b.apply([{ op: 'addRun', level: 0, start: { q: 0, r: 0 }, entryEdge: 3, through: row.map(({ q, r }) => ({ q, r })) }], 'water run');
      await b.fillOffers({ family: 'bin', stem: 'hex-bin-third-drain' }, () => true, { label: 'third-depth drain trays' });
      await finishShell(b);
      await plantBins(b, 'herbs', 'harvest');
    },
  },
  {
    id: 'drawer-tower',
    title: 'Three-storey parts cabinet',
    pitch: 'A tower of drawers, two per storey across three storeys, bolted into one body and capped: the classic small-parts cabinet.',
    async build(b) {
      await b.apply([{ op: 'remove', ref: (await b.state()).nodes[0].ref }], 'clear start');
      for (const level of [0, 1, 2]) {
        await b.place([0, 1, 2].map((q) => ({ ...at(q, 0, level), variant: 'half-n' })).concat([0, 1, 2, 3].map((q) => at(q, -1, level))));
      }
      await b.fillOffers({ family: 'drawer' }, () => true, { label: 'drawers' });
      await finishShell(b, { covers: [0, 1, 2, 3].map((q) => at(q, -1, 2)).concat([0, 1, 2].map((q) => at(q, 0, 2))) });
    },
  },
  {
    id: 'tool-wall',
    title: 'Workshop tool wall',
    pitch: 'A wall-hung strip of five cells: keyhole hangers to mount it, hooks and rods for hand tools, and trays for bits.',
    async build(b) {
      await b.place([at(1, 0), at(2, 0), at(3, 0), at(4, 0)]);
      await b.fillOffers({ family: 'accessory', stem: 'hex-acc-keyhole' }, () => true, { max: 2, label: 'keyhole hangers' });
      await b.fillOffers({ family: 'accessory', stem: 'hex-acc-hook' }, () => true, { max: 6, label: 'hooks' });
      await b.fillOffers({ family: 'accessory', stem: 'hex-acc-rod' }, () => true, { max: 2, label: 'rods' });
      await b.fillOffers({ family: 'bin' }, stemHas('div2'), { max: 3, label: 'bit trays' });
      await finishShell(b);
      await stageOn(b, ['hexdriver-set', 'pliers', 'multimeter', 'tape'], [...(await nodesOf(b, 'bin')), ...(await nodesOf(b, 'piece'))]);
    },
  },
  {
    id: 'desk-station',
    title: 'Desk charging station',
    pitch: 'Three cells round a corner: a large platform on a spike holds a phone, a cable cover passes the charger lead, and trays hold pens and cards.',
    async build(b) {
      await b.place([at(1, 0), at(0, 1)]);
      await b.fillOffers({ family: 'spike', type: 'mount' }, () => true, { max: 1, label: 'mount spike' });
      const spike = (await b.state()).nodes.find((n) => n.family === 'spike');
      if (spike) {
        const r = await b.apply([{ op: 'setSpikeAccessory', level: 0, junction: spikeJunction(spike), accessory: 'platform-lrg' }], 'large platform');
        if (!r.ok) await b.apply([{ op: 'setSpikeAccessory', level: 0, junction: spikeJunction(spike), accessory: 'platform-sm' }], 'small platform');
      }
      await b.fillOffers({ family: 'bin' }, and(inCells([at(1, 0), at(0, 1)]), stemHas('div')), { max: 2, label: 'pen trays' });
      await b.apply([{ op: 'addCover', at: at(0, 0), variant: 'full', face: 'top', type: 'cable' }], 'cable cover');
      await finishShell(b);
      await stageOn(b, ['phone', 'mug', 'pen', 'marker', 'cable-coil'], [...(await nodesOf(b, 'cover')), ...(await nodesOf(b, 'bin')), ...(await nodesOf(b, 'piece'))]);
    },
  },
  {
    id: 'seed-tray',
    title: 'Seed propagation tray',
    pitch: 'A seven-cell honeycomb of draining trays filled with soil and planted with seedlings, standing on three stud feet.',
    async build(b) {
      await b.place(hexagon(1).filter((c) => c.q || c.r));
      await b.fillOffers({ family: 'bin', stem: 'hex-bin-full-drain' }, () => true, { label: 'drain trays' });
      await b.fillOffers({ family: 'spike', type: 'stud', facing: 'down' }, () => true, { max: 3, label: 'stud feet' });
      await finishShell(b);
      await plantBins(b, 'leafy', 'seedling');
    },
  },
  {
    id: 'display-stand',
    title: 'Two-tier display stand',
    pitch: 'A seven-cell base with two raised cells and platforms on spikes at two corners, for showing products or plants at three heights.',
    async build(b) {
      await b.place(hexagon(1).filter((c) => c.q || c.r));
      // Two corners of the centre, each shared with two ring cells; the two ring cells left over carry the upper storey.
      const corners = [[{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }], [{ q: 0, r: 0 }, { q: -1, r: 0 }, { q: -1, r: 1 }]];
      for (const junction of corners) {
        await b.apply([{ op: 'addSpike', level: 0, junction, variant: 'mount' }, { op: 'setSpikeAccessory', level: 0, junction, accessory: 'platform-sm' }], 'spike + platform');
      }
      await b.place([at(0, -1, 1), at(0, 1, 1)]);
      await finishShell(b, { covers: hexagon(1).filter((c) => c.q || c.r).concat([at(0, -1, 1), at(0, 1, 1)]) });
      await stageOn(b, (await propIds(b, 'succulents')).slice(0, 6), [...(await nodesOf(b, 'cover')), ...(await nodesOf(b, 'piece'))]);
    },
  },
  {
    id: 'workbench',
    title: 'Nineteen-cell workbench top',
    pitch: 'A flat work surface of nineteen cells, covered, bolted and capped all round, with drawers set into its edge.',
    async build(b) {
      const cells = hexagon(2).filter((c) => c.q || c.r);
      const edgeHalves = [at(2, 0), at(-2, 0)];
      await b.place(cells.filter((c) => !edgeHalves.some((h) => h.q === c.q && h.r === c.r)));
      await b.place([{ ...at(2, 0), variant: 'half-w' }, { ...at(-2, 0), variant: 'half-e' }]);
      await b.fillOffers({ family: 'drawer', type: 'slide' }, () => true, { label: 'edge drawers (slide)' });
      await finishShell(b, { covers: hexagon(2) });
      const covers = await nodesOf(b, 'cover');
      await stageOn(b, ['drill', 'multimeter', 'hexdriver-set', 'tape', 'laptop-open', 'task-lamp'], covers);
    },
  },
  {
    id: 'vented-enclosure',
    title: 'Ventilated electronics enclosure',
    pitch: 'A closed two-cell box for a controller board: louvred vents, a cable gland for power, covers top and bottom, on mount feet.',
    async build(b) {
      await b.place([at(1, 0)]);
      await b.fillOffers({ family: 'port', stem: 'hex-port-louvre' }, () => true, { max: 2, label: 'louvre vents' });
      await b.fillOffers({ family: 'port', stem: 'hex-port-gland' }, () => true, { max: 1, label: 'cable gland' });
      await b.fillOffers({ family: 'cover', face: 'bottom' }, () => true, { label: 'bottom covers' });
      await finishShell(b, { covers: [at(0, 0), at(1, 0)] });
    },
  },
  {
    id: 'toy-sorter',
    title: 'Two-storey toy and craft sorter',
    pitch: 'Seven cells of divided bins on the ground storey and three more above, with handles so any lid lifts off.',
    async build(b) {
      await b.place(hexagon(1).filter((c) => c.q || c.r));
      await b.place([at(0, 0, 1), at(1, 0, 1), at(0, 1, 1)]);
      await b.fillOffers({ family: 'bin', level: 0 }, stemHas('div'), { label: 'divided bins, ground' });
      await b.fillOffers({ family: 'bin', level: 1 }, stemHas('div'), { label: 'divided bins, upper' });
      await finishShell(b, { covers: [at(0, 0, 1), at(1, 0, 1), at(0, 1, 1)] });
      await b.fillOffers({ family: 'handle' }, () => true, { max: 3, label: 'handles' });
    },
  },
];
