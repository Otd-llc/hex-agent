// The model's tools. Everything the model asks for passes through here:
// arguments are checked in code, ops are allowlisted, refs must exist in the
// live build, and socket ids map back to the exact op the configurator offered.
// The model never gets load(), so it cannot replace the build.

// Fields each op takes, from the public contract (hex-api.d.ts, hash 9bb662c8…):
// [required, optional]. Checked before anything reaches the page.
const OP_FIELDS = {
  place: [['at', 'variant'], ['storeys']],
  remove: [['ref'], ['sweepOrphans']],
  rotate: [['ref', 'stepDeg'], []],
  addSnap: [['at', 'variant'], []],
  addBin: [['at', 'stem'], []],
  addSpike: [['level', 'junction'], ['variant', 'facing']],
  setSpikeAccessory: [['level', 'junction', 'accessory'], []],
  addCover: [['at', 'variant', 'face'], ['type']],
  setCoverType: [['at', 'variant', 'face', 'type'], []],
  setCoverMagnets: [['at', 'variant', 'face', 'on'], []],
  addCap: [['at', 'face', 'bearingDeg'], ['capVariant', 'storeys']],
  addInsert: [['at', 'variant', 'face', 'bearingDeg', 'stem'], ['chain']],
  addHandle: [['at', 'face'], ['chain']],
  addCoverHub: [['at', 'variant', 'face'], []],
  addConnector: [['level', 'edge', 'kind'], []],
  addJointBolt: [['at', 'slot'], []],
  addAccessory: [['at', 'slot', 'stem'], []],
  addPort: [['at', 'slot', 'stem'], []],
  addBinBolt: [['at', 'slot', 'stem'], []],
  addNotch: [['at', 'k', 'stem'], []],
  setNotchOpen: [['at', 'k', 'open'], []],
  addDrawer: [['at', 'key'], ['style', 'storeys']],
  setDrawerOpen: [['at', 'open'], ['west']],
  addRun: [['level', 'start', 'entryEdge', 'through'], ['mode']],
  setRunMode: [['id', 'mode'], []],
  addRiser: [['at'], []],
  setFootBolt: [['mm'], []],
};
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

export function checkOpShape(item) {
  const [required, optional] = OP_FIELDS[item.op];
  const takes = `${item.op} takes ${required.join(', ')}${optional.length ? ` (optional: ${optional.join(', ')})` : ''}`;
  const missing = required.filter((k) => !(k in item));
  if (missing.length) throw new Error(`${item.op} is missing ${missing.join(', ')}: ${takes}`);
  const extra = Object.keys(item).filter((k) => k !== 'op' && !required.includes(k) && !optional.includes(k));
  if (extra.length) throw new Error(`${extra.join(', ')} is not a field of ${item.op}: ${takes}`);
}
const FAMILIES = ['piece', 'snap', 'spike', 'cover', 'cap', 'insert', 'handle', 'accessory', 'port', 'bin', 'binBolt',
  'connector', 'run', 'riser', 'coverHub', 'drawer', 'jointBolt', 'notch', 'bay'];

export const LIMITS = { opsPerCall: 30, opsTotal: 250, socketsShown: 40, partsShown: 40, nodesShown: 200 };

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
      'Offers are valid one at a time: applying one can make others stale (a joint bolt is offered from both cells of the same joint, so take one of the pair), so ask again after a change. ' +
      'Drawers sit on the cut face of a half base; a handle needs a cover on its face; spikes stand where three cells meet.',
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
    name: 'apply',
    description:
      'Change the build. Each item is either {"socket":"s12"} (an offer from find_sockets) or a full op object. ' +
      'Atomic by default: if any op is refused, the whole batch is taken back. Refusals carry a code, a message and ' +
      'nearby alternatives (also given socket ids). Never invent a ref: take refs from get_build or an outcome. ' +
      `Ops and their fields (? = optional): ${OP_TABLE}.`,
    parameters: obj(
      {
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: LIMITS.opsPerCall,
          items: { type: 'object', description: '{"socket":"sN"} or a hexAPI op such as {"op":"place","at":{"q":1,"r":0,"level":0},"variant":"full"}' },
        },
        atomic: { type: 'boolean', description: 'Default true. False keeps the ops that succeed and reports the rest.' },
      },
      ['ops'],
    ),
  },
  { name: 'undo', description: 'Take back the last change (one apply is one step).', parameters: obj({}) },
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
    return new Set(s.nodes.map((n) => n.ref));
  }

  function resolve(item, refs) {
    if (item && typeof item.socket === 'string') {
      const op = sockets.get(item.socket);
      if (!op) throw new Error(`unknown socket id ${item.socket}: call find_sockets again`);
      return op;
    }
    if (!item || typeof item.op !== 'string') throw new Error('each item needs "socket" or "op"');
    if (!BUILD_OPS.has(item.op)) throw new Error(`op ${item.op} is not allowed here`);
    checkOpShape(item);
    for (const k of ['ref', 'part']) {
      if (k in item && !refs.has(item[k])) throw new Error(`${k} ${JSON.stringify(item[k])} is not on the build: take refs from get_build`);
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
      };
    },

    async find_parts({ family, text } = {}) {
      const all = await hex.call('listParts');
      const words = (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const hits = all.filter(
        (p) =>
          (!family || p.family === family) &&
          words.every((w) => `${p.value} ${p.name} ${p.use ?? ''}`.toLowerCase().includes(w)),
      );
      return {
        total: hits.length,
        parts: hits.slice(0, LIMITS.partsShown).map((p) => ({
          value: p.value, op: p.op, field: p.field, family: p.family, name: p.name,
          use: p.use && p.use.length > 160 ? p.use.slice(0, 157) + '...' : p.use,
          boxMm: p.box, released: p.released,
        })),
      };
    },

    async find_sockets(query) {
      const offers = await hex.call('openSockets', query);
      const out = {
        total: offers.length,
        sockets: offers.slice(0, LIMITS.socketsShown).map((o) => ({ socket: remember(o.op), at: o.at, slot: o.slot, op: o.op })),
      };
      if (!offers.length) out.note = NO_OFFERS;
      return out;
    },

    async apply({ ops, atomic = true }) {
      if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops must be a non-empty array');
      if (ops.length > LIMITS.opsPerCall) throw new Error(`at most ${LIMITS.opsPerCall} ops per call`);
      if (opsTotal + ops.length > LIMITS.opsTotal) throw new Error(`op budget of ${LIMITS.opsTotal} reached: finish now`);
      const refs = await liveRefs();
      const resolved = ops.map((item) => resolve(item, refs));
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
