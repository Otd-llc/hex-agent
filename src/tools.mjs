// The model's tools. Everything the model asks for passes through here:
// arguments are checked in code, ops are allowlisted, refs must exist in the
// live build, and socket ids map back to the exact op the configurator offered.
// The model never gets load(), so it cannot replace the build.

import { CONTRACT, checkerFor, refKinds } from './contract.mjs';

// Fields each op takes, [required, optional], from the vendored public contract
// (contract/hex-api-public.json; bin/sync-contract.mjs refreshes it). Checked
// before anything reaches the page.
const OP_FIELDS = CONTRACT.opFields;
const BUILD_OPS = new Set(Object.keys(OP_FIELDS));
// Compact, for the apply tool's description: "place(at, variant, storeys?); ..."
const OP_TABLE = Object.entries(OP_FIELDS)
  .map(([op, [req, opt]]) => `${op}(${[...req, ...opt.map((o) => `${o}?`)].join(', ')})`)
  .join('; ');

// Said when an offer list comes back empty, so the model changes the build
// instead of guessing raw ops for a part that has nowhere to go yet.
const NO_OFFERS =
  'No place on the build takes this part right now. Change the build so it can (for example add the cells it needs ' +
  'beside or below it), then ask again. Guessing raw ops for a part with no offers rarely works.';
const STREAK_LIMIT = 6;

// The value lists the public contract publishes (its `values` table): the only
// names the configurator places for these fields.
export const VALUES = CONTRACT.values;
// Which value list governs which field of which op.
const VALUE_OF = {
  variant: 'variant',
  'addCover.type': 'coverType',
  'setCoverType.type': 'coverType',
  capVariant: 'capVariant',
  'addSpike.variant': 'spikeVariant',
  accessory: 'spikeAccessory',
  mode: 'runMode',
  style: 'drawerStyle',
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isSite = (v) => v && typeof v === 'object' && isNum(v.q) && isNum(v.r);
const isCell = (v) => isSite(v) && isNum(v.level);
const SHAPES = {
  at: [isCell, 'a cell {q, r, level}'],
  start: [isSite, 'a site {q, r}'],
  junction: [(v) => Array.isArray(v) && v.length === 3 && v.every(isSite), 'an array of three sites [{q, r}, {q, r}, {q, r}]'],
  edge: [(v) => Array.isArray(v) && v.length === 2 && v.every(isSite), 'an array of two sites [{q, r}, {q, r}]'],
  through: [(v) => Array.isArray(v) && v.every(isSite), 'an array of sites'],
  level: [isNum, 'a number'],
};

export function checkOpShape(item) {
  const [required, optional] = OP_FIELDS[item.op];
  const takes = `${item.op} takes ${required.join(', ')}${optional.length ? ` (optional: ${optional.join(', ')})` : ''}`;
  const missing = required.filter((k) => !(k in item));
  if (missing.length) throw new Error(`${item.op} is missing ${missing.join(', ')}: ${takes}`);
  const extra = Object.keys(item).filter((k) => k !== 'op' && !required.includes(k) && !optional.includes(k));
  if (extra.length) throw new Error(`${extra.join(', ')} is not a field of ${item.op}: ${takes}`);
  for (const [k, [ok, says]] of Object.entries(SHAPES)) {
    if (k in item && !ok(item[k])) throw new Error(`${item.op}.${k} must be ${says}`);
  }
  for (const k of Object.keys(item)) {
    const list = VALUE_OF[`${item.op}.${k}`] ?? (k.includes('.') ? null : VALUE_OF[k]);
    if (!list || item[k] == null) continue;
    if (!VALUES[list].includes(item[k])) throw new Error(`${item.op}.${k} "${item[k]}" is not a ${list}: use one of ${VALUES[list].join(', ')}`);
  }
  // Every other field as its contract type says: numbers, booleans, literal
  // unions, small objects. Refs are checked against the live build in resolve().
  for (const [k, type] of Object.entries(CONTRACT.fieldTypes[item.op])) {
    if (!(k in item) || k in SHAPES || refKinds(type)) continue;
    const check = checkerFor(type);
    if (check && !check[0](item[k])) throw new Error(`${item.op}.${k} must be ${check[1]}`);
  }
}
const FAMILIES = ['piece', 'snap', 'spike', 'cover', 'cap', 'insert', 'handle', 'accessory', 'port', 'bin', 'binBolt',
  'connector', 'run', 'riser', 'coverHub', 'drawer', 'jointBolt', 'notch', 'bay'];

export const LIMITS = { opsPerCall: 30, opsTotal: 250, socketsShown: 40, partsShown: 40, nodesShown: 200, propsShown: 40, surfacesShown: 40 };
const mm = (v) => Math.round(v);

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const TOOL_SPECS = [
  {
    name: 'get_build',
    description: 'The build on screen now: every placed part (ref, family, cell, part name) and counts per family.',
    parameters: obj({}),
  },
  {
    name: 'find_parts',
    description:
      'Search the part catalog (bases, bins, accessories, ports, inserts, connectors, notches, bays, spike platforms). ' +
      'Covers, caps, handles, drawers, joint bolts, risers and spikes are not catalog entries: use find_sockets for them.',
    parameters: obj({
      family: { type: 'string', description: 'Optional node family, e.g. bin, accessory, piece.' },
      text: { type: 'string', description: 'Optional words to match in the value, name or use.' },
    }),
  },
  {
    name: 'find_sockets',
    description:
      'Every place one kind of part fits on the build now, each with an id (s1, s2, ...) you can pass to apply. ' +
      'An offered socket passes the placement rules; it is not yet proof the meshes clear. ' +
      'Offers are valid one at a time: applying one can make others stale, so ask again after a change. ' +
      'A joint bolt is offered from both cells of a wall: the bolt heads sit on the side you place from, and placing one fills the wall. ' +
      'Drawers (family drawer) sit on the cut face of a half base. Notch drawers (family notch) stand in an empty spot beside two bases ' +
      'that touch each other; a bay needs three; bases in a straight line or a cell apart offer none. ' +
      'A pipe run passing straight through a cell leaves room only for third-depth bins there; a cell holding pipe hardware ' +
      '(a coupling next to a corner, or a fitting or hub at the corner) takes no bin at all. Deeper trays and hardware cells ' +
      'refuse bins with PIPE_THROUGH_CELL, and a run is refused ROUTE_BIN_IN_WAY where a bin is in its way, so lay the run ' +
      'first and take bin offers after it, or keep the run straight; -pvc bins are for a vertical riser through the floor. ' +
      'A handle needs a cover on its face; spikes stand where three cells meet.',
    parameters: obj(
      {
        family: { type: 'string', enum: FAMILIES },
        level: { type: 'integer' },
        variant: { type: 'string' },
        stem: { type: 'string' },
        face: { type: 'string', enum: ['top', 'bottom'] },
        type: { type: 'string', description: 'Spike type (solid, mount, stud) or drawer style (classic, slide, swing, long, longbin).' },
        facing: { type: 'string', enum: ['up', 'down'] },
        capVariant: { type: 'string' },
        storeys: { type: 'integer', enum: [1, 2, 3] },
        key: { type: 'string', description: 'Drawer key, as an earlier offer gave it.' },
      },
      ['family'],
    ),
  },
  {
    name: 'find_props',
    description:
      'Search the props: things that stand on or in a build to show what it is for (a mug, a keyboard, tools, books, pots) ' +
      'and plug plants that go in soil. Props are staging, not parts: they are not in the parts list. ' +
      'Each has an id for addProp or plant, its sizes in mm (longest first) and what it is for.',
    parameters: obj({
      text: { type: 'string', description: 'Optional words to match in the id, label or kind.' },
      use: { type: 'string', enum: ['desk', 'dining', 'living', 'workshop', 'electronics', 'drone', 'printing', 'grow'] },
      kind: { type: 'string', description: 'Optional kind, e.g. herbs, pots, tools.' },
    }),
  },
  {
    name: 'find_surfaces',
    description:
      'Where a prop can go: the tops, floors, compartments and soil of one part (ref) or of the whole build, each with a token ' +
      '(f1, f2, ...) to pass to addProp as surface, its height, centre, size and clear headroom. With fits (a prop id), only ' +
      'surfaces the prop fits inside lying flat: a prop bigger than a top (a quad, a monitor) can still rest overhanging it, ' +
      'so when fits finds nothing, try addProp on the part with apply dryRun.',
    parameters: obj({
      ref: { type: 'string', description: 'Optional part ref from get_build.' },
      fits: { type: 'string', description: 'Optional prop id from find_props.' },
    }),
  },
  { name: 'measure', description: 'The build\'s size in mm (x and z across the bench, y up): the parts alone, and with its props.', parameters: obj({}) },
  {
    name: 'bom',
    description: 'The parts list (printed, stock and unmodelled lines with quantities), the print estimate (grams of filament, minutes) and notes.',
    parameters: obj({}),
  },
  {
    name: 'apply',
    description:
      'Change the build. Each item is either {"socket":"s12"} (an offer from find_sockets) or a full op object. ' +
      'Atomic by default: if any op is refused, the whole batch is taken back. Refusals carry a code, a message and ' +
      'nearby alternatives (also given socket ids). Never invent a ref: take refs from get_build or an outcome. ' +
      'Props: addProp with an id from find_props, on a part ref or "bench" (atMm moves it off the centre), or on a surface token ' +
      'from find_surfaces (surface or on, not both); several props can go in one apply (atomic false keeps the ones that rest); ' +
      'moveProp and removeProp take a prop ref from get_build. Soil: fillSoil a bin or pot part, then plant a plant id in it. ' +
      `Ops and their fields (? = optional): ${OP_TABLE}. ` +
      `Named values: ${Object.entries(VALUES).filter(([k]) => k !== 'variant').map(([k, v]) => `${k}: ${v.join('|')}`).join('; ')}. ` +
      'Cover magnets are setCoverMagnets on a fitted cover, not a cover type.',
    parameters: obj(
      {
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: LIMITS.opsPerCall,
          items: { type: 'object', description: '{"socket":"sN"} or a hexAPI op such as {"op":"place","at":{"q":1,"r":0,"level":0},"variant":"full"}' },
        },
        atomic: { type: 'boolean', description: 'Default true. False keeps the ops that succeed and reports the rest.' },
        dryRun: { type: 'boolean', description: 'Try ONE op and report what would happen, changing nothing.' },
      },
      ['ops'],
    ),
  },
  { name: 'undo', description: 'Take back the last change (one apply is one step).', parameters: obj({}) },
  { name: 'redo', description: 'Put back the change undo took back.', parameters: obj({}) },
  {
    name: 'check_build',
    description: 'Run the configurator checks: rule issues (errors, warnings) and the browser mesh-collision gate.',
    parameters: obj({}),
  },
  {
    name: 'finish',
    description: 'End the session. Say, for each requirement in the brief, whether the build meets it and why. Be honest: unmet is a valid answer.',
    parameters: obj(
      {
        requirements: {
          type: 'array',
          items: obj(
            {
              requirement: { type: 'string' },
              status: { type: 'string', enum: ['met', 'partial', 'unmet'] },
              evidence: { type: 'string', description: 'Which parts (refs or families) meet it, or why not.' },
            },
            ['requirement', 'status', 'evidence'],
          ),
        },
        summary: { type: 'string' },
      },
      ['requirements', 'summary'],
    ),
  },
];

export function createTools(hex, { onEvent = () => {} } = {}) {
  const sockets = new Map();
  let nextSocket = 1;
  const surfaces = new Map();
  let nextSurface = 1;
  let propIds = null;
  let opsTotal = 0;
  let refusalStreak = 0;
  const counters = { applied: 0, refused: 0, refusalCodes: {} };

  const remember = (op) => {
    const id = `s${nextSocket++}`;
    sockets.set(id, op);
    return id;
  };

  async function liveRefs() {
    const s = await hex.call('getState');
    return { node: new Set(s.nodes.map((n) => n.ref)), prop: new Set((s.staging?.props ?? []).map((p) => p.ref)) };
  }

  async function knownProps() {
    propIds ??= new Set((await hex.call('listProps')).map((p) => p.id));
    return propIds;
  }

  async function resolve(item, refs) {
    if (item && typeof item.socket === 'string') {
      const op = sockets.get(item.socket);
      if (!op) throw new Error(`unknown socket id ${item.socket}: call find_sockets again`);
      return op;
    }
    if (!item || typeof item.op !== 'string') throw new Error('each item needs "socket" or "op"');
    if (!BUILD_OPS.has(item.op)) throw new Error(`op ${item.op} is not allowed here`);
    checkOpShape(item);
    // Each ref field takes what its contract type names: part refs, prop refs, or a literal such as 'bench'.
    for (const [k, type] of Object.entries(CONTRACT.fieldTypes[item.op])) {
      const kinds = refKinds(type);
      if (!kinds || !(k in item) || kinds.literals.includes(item[k])) continue;
      if ((kinds.node && refs.node.has(item[k])) || (kinds.prop && refs.prop.has(item[k]))) continue;
      const what = [kinds.node && 'part', kinds.prop && 'prop'].filter(Boolean).join(' or ');
      const also = kinds.literals.length ? ` or ${kinds.literals.map((l) => `"${l}"`).join(', ')}` : '';
      throw new Error(`${item.op}.${k} ${JSON.stringify(item[k])} is not on the build: it must be a ${what} ref from get_build${also}`);
    }
    if ((item.op === 'addProp' || item.op === 'plant') && !(await knownProps()).has(item.id)) {
      throw new Error(`${item.op}.id "${item.id}" is not a prop: take ids from find_props`);
    }
    // The page refuses both at once (INVALID_INPUT); the contract types cannot say so.
    if (item.op === 'addProp' && 'surface' in item && 'on' in item) throw new Error('addProp takes surface or on, not both');
    if (item.op === 'addProp' && 'surface' in item) {
      const id = surfaces.get(item.surface);
      if (!id) throw new Error(`unknown surface ${item.surface}: take tokens from find_surfaces`);
      return { ...item, surface: id };
    }
    return item;
  }

  function summarizeOutcome(o) {
    if (o.ok) return { ok: true, op: o.op.op, added: o.added, removed: o.removed, warnings: o.warnings.map((w) => w.code) };
    return {
      ok: false,
      op: o.op,
      code: o.code,
      message: o.message,
      alternatives: o.validAlternatives.map((a) => ({ socket: remember(a.op), at: a.at, slot: a.slot, op: a.op })),
    };
  }

  const handlers = {
    async get_build() {
      const s = await hex.call('getState');
      const counts = {};
      for (const n of s.nodes) counts[n.family] = (counts[n.family] ?? 0) + 1;
      return {
        nodes: s.nodes.slice(0, LIMITS.nodesShown).map((n) => ({ ref: n.ref, family: n.family, at: n.at, stem: n.stem })),
        total: s.nodes.length,
        counts,
        props: (s.staging?.props ?? []).map((p) => ({
          ref: p.ref, id: p.id, label: p.label, atMm: p.posMm.map(mm), yawDeg: mm(p.yawDeg), ...(p.pot ? { pot: p.pot } : {}),
        })),
        soil: s.staging?.soil ?? [],
      };
    },

    async find_props({ text, use, kind } = {}) {
      const all = await hex.call('listProps');
      const words = (text ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);
      const score = (p) => words.filter((w) => `${p.id} ${p.label} ${p.kind}`.toLowerCase().includes(w)).length;
      const hits = all
        .filter((p) => (!use || p.uses.includes(use)) && (!kind || p.kind === kind))
        .map((p) => ({ p, s: words.length ? score(p) : 1 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p);
      return {
        total: hits.length,
        props: hits.slice(0, LIMITS.propsShown).map((p) => ({
          id: p.id, label: p.label, kind: p.kind, uses: p.uses,
          sizeMm: p.sizeMm ? [p.sizeMm.long, p.sizeMm.mid, p.sizeMm.short].map(mm) : [mm(p.longMm)],
          ...(p.plant ? { plant: true, stage: p.stage } : {}), ...(p.pot ? { pot: true } : {}),
        })),
      };
    },

    async find_surfaces({ ref, fits } = {}) {
      const all = await hex.call('surfaces', ...(fits ? [ref, { fits }] : ref ? [ref] : []));
      const size = (o) => {
        const xs = o.map((p) => p[0]), zs = o.map((p) => p[1]);
        return { x: mm(Math.max(...xs) - Math.min(...xs)), z: mm(Math.max(...zs) - Math.min(...zs)) };
      };
      const out = {
        total: all.length,
        surfaces: all.slice(0, LIMITS.surfacesShown).map((f) => {
          const token = `f${nextSurface++}`;
          surfaces.set(token, f.id);
          return {
            surface: token, label: f.label, kind: f.kind, yMm: mm(f.yMm), centreMm: [mm(f.centreMm.x), mm(f.centreMm.z)],
            sizeMm: size(f.outlineMm), headroomMm: f.headroomMm == null ? null : mm(f.headroomMm),
          };
        }),
      };
      // fits lists only surfaces the prop fits inside; a bigger prop can still rest overhanging a top.
      if (!all.length) out.note = fits ? `No surface here is as big as ${fits}. It may still rest overhanging a top: try addProp on the part with dryRun.` : 'No surfaces here.';
      return out;
    },

    async measure() {
      const m = await hex.call('measure');
      const box = (b) => b && { x: mm(b.sizeMm.x), y: mm(b.sizeMm.y), z: mm(b.sizeMm.z) };
      return { parts: box(m.parts), withProps: box(m.withProps) };
    },

    async bom() {
      // The pack link stays out: long, and nothing the model can use.
      const b = await hex.call('bom');
      return {
        lines: b.lines.map((l) => ({ key: l.key, qty: l.qty, kind: l.kind, label: l.label })),
        printedInstances: b.printedInstances,
        print: { grams: mm(b.print.grams), minutes: mm(b.print.minutes) },
        ...(b.print.unmeasured.length ? { unmeasured: b.print.unmeasured } : {}),
        notes: b.notes,
        ...(b.pack.why ? { noPack: b.pack.why } : {}),
      };
    },

    async find_parts({ family, text } = {}) {
      const all = await hex.call('listParts');
      // Any word may match; parts matching more of the words come first. (Requiring
      // every word made "louvre vent grate" find nothing, though hex-port-louvre exists.)
      const words = (text ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);
      const score = (p) => words.filter((w) => `${p.value} ${p.name} ${p.use ?? ''}`.toLowerCase().includes(w)).length;
      const hits = all
        .filter((p) => !family || p.family === family)
        .map((p) => ({ p, s: words.length ? score(p) : 1 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p);
      return {
        total: hits.length,
        parts: hits.slice(0, LIMITS.partsShown).map((p) => ({
          value: p.value, op: p.op, field: p.field, family: p.family, name: p.name,
          use: p.use && p.use.length > 160 ? p.use.slice(0, 157) + '...' : p.use,
          boxMm: p.box,
          // Only an unreleased part says so: the common case costs nothing (A59).
          ...(p.released ? {} : { released: false }),
        })),
      };
    },

    async find_sockets(query) {
      const offers = await hex.call('openSockets', query);
      const out = {
        total: offers.length,
        // The op already names the cell and the face, bearing or slot: no need to repeat them (A59).
        sockets: offers.slice(0, LIMITS.socketsShown).map((o) => ({ socket: remember(o.op), op: o.op })),
      };
      if (!offers.length) out.note = NO_OFFERS;
      return out;
    },

    async apply({ ops, atomic = true, dryRun = false }) {
      if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops must be a non-empty array');
      if (dryRun) {
        // One op, nothing changes, nothing counts against the budget.
        if (ops.length !== 1) throw new Error('a dry run tries one op at a time');
        const o = await hex.call('apply', await resolve(ops[0], await liveRefs()), { dryRun: true });
        return { dryRun: true, outcomes: [summarizeOutcome(o)] };
      }
      if (ops.length > LIMITS.opsPerCall) throw new Error(`at most ${LIMITS.opsPerCall} ops per call`);
      if (opsTotal + ops.length > LIMITS.opsTotal) throw new Error(`op budget of ${LIMITS.opsTotal} reached: finish now`);
      const refs = await liveRefs();
      const resolved = [];
      for (const item of ops) resolved.push(await resolve(item, refs));
      opsTotal += resolved.length;
      const tally = (outcomes) => {
        for (const o of outcomes) {
          if (o.ok) counters.applied++;
          else {
            counters.refused++;
            counters.refusalCodes[o.code] = (counters.refusalCodes[o.code] ?? 0) + 1;
          }
        }
      };
      const options = atomic ? {} : { keepGoing: true };
      let batch = resolved;
      let r = await hex.call('applyAll', batch, options);
      await hex.call('settle');
      tally(r.outcomes);
      onEvent({ type: 'apply', ops: batch, outcomes: r.outcomes, rolledBack: r.rolledBack, atomic });

      // An atomic batch undone only because some ops were ALREADY_FITTED (e.g.
      // both ends of one joint bolt) wanted a state that already holds: apply
      // it again without them, and say which were dropped.
      const dropped = [];
      for (let pass = 0; pass < 3 && atomic && r.rolledBack; pass++) {
        const refused = r.outcomes.filter((o) => !o.ok);
        if (!refused.length || !refused.every((o) => o.code === 'ALREADY_FITTED')) break;
        const drop = new Set(refused.map((o) => JSON.stringify(o.op)));
        dropped.push(...refused.map((o) => o.op));
        batch = batch.filter((op) => !drop.has(JSON.stringify(op)));
        if (!batch.length) break;
        r = await hex.call('applyAll', batch, options);
        await hex.call('settle');
        tally(r.outcomes);
        onEvent({ type: 'apply', ops: batch, outcomes: r.outcomes, rolledBack: r.rolledBack, atomic, retryWithout: dropped.length });
      }
      const out = { rolledBack: r.rolledBack, outcomes: r.outcomes.map(summarizeOutcome) };
      // Consecutive refusals across calls: past the limit, say so plainly.
      for (const o of r.outcomes) refusalStreak = o.ok ? 0 : refusalStreak + 1;
      if (refusalStreak >= STREAK_LIMIT) {
        out.warning = `${refusalStreak} refusals in a row. Stop guessing: read the refusal messages, change the build so find_sockets offers the part, or report the requirement as unmet.`;
      }
      if (dropped.length) {
        out.droppedAlreadyFitted = dropped;
        out.note = 'These ops were refused ALREADY_FITTED (that state already holds), so the batch was applied again without them.';
      }
      return out;
    },

    async undo() {
      const ok = await hex.call('undo');
      await hex.call('settle');
      return { undone: ok };
    },

    async redo() {
      const ok = await hex.call('redo');
      await hex.call('settle');
      return { redone: ok };
    },

    async check_build() {
      const v = await hex.call('validate');
      return {
        ok: v.ok,
        meshClash: v.meshClash,
        issues: v.issues.map((i) => ({ severity: i.severity, code: i.code, refs: i.refs, message: i.message })),
        note: 'ok covers rule errors only. meshClash must read "clear" for the meshes to be checked and clear.',
      };
    },
  };

  async function run(name, rawArgs) {
    const handler = handlers[name];
    if (!handler) return { error: `unknown tool ${name}` };
    let args;
    try {
      args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs ?? {};
    } catch {
      return { error: 'arguments were not valid JSON' };
    }
    try {
      return await handler(args);
    } catch (e) {
      return { error: String(e.message ?? e) };
    }
  }

  return { run, counters, opsUsed: () => opsTotal };
}
