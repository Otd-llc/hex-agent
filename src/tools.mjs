// The model's tools. Everything the model asks for passes through here:
// arguments are checked in code, ops are allowlisted, refs must exist in the
// live build, and socket ids map back to the exact op the configurator offered.
// The model never gets load(), so it cannot replace the build.

const BUILD_OPS = new Set([
  'place', 'remove', 'rotate', 'addSnap', 'addBin', 'addSpike', 'setSpikeAccessory', 'addCover', 'setCoverType',
  'setCoverMagnets', 'addCap', 'addInsert', 'addHandle', 'addCoverHub', 'addConnector', 'addJointBolt',
  'addAccessory', 'addPort', 'addBinBolt', 'addNotch', 'setNotchOpen', 'addDrawer', 'setDrawerOpen', 'addRun',
  'setRunMode', 'addRiser', 'setFootBolt',
]);
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
      'nearby alternatives (also given socket ids). Never invent a ref: take refs from get_build or an outcome.',
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
      return {
        total: offers.length,
        sockets: offers.slice(0, LIMITS.socketsShown).map((o) => ({ socket: remember(o.op), at: o.at, slot: o.slot, op: o.op })),
      };
    },

    async apply({ ops, atomic = true }) {
      if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops must be a non-empty array');
      if (ops.length > LIMITS.opsPerCall) throw new Error(`at most ${LIMITS.opsPerCall} ops per call`);
      if (opsTotal + ops.length > LIMITS.opsTotal) throw new Error(`op budget of ${LIMITS.opsTotal} reached: finish now`);
      const refs = await liveRefs();
      const resolved = ops.map((item) => resolve(item, refs));
      opsTotal += resolved.length;
      const r = await hex.call('applyAll', resolved, atomic ? {} : { keepGoing: true });
      await hex.call('settle');
      for (const o of r.outcomes) {
        if (o.ok) counters.applied++;
        else {
          counters.refused++;
          counters.refusalCodes[o.code] = (counters.refusalCodes[o.code] ?? 0) + 1;
        }
      }
      onEvent({ type: 'apply', ops: resolved, outcomes: r.outcomes, rolledBack: r.rolledBack });
      return { rolledBack: r.rolledBack, outcomes: r.outcomes.map(summarizeOutcome) };
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
