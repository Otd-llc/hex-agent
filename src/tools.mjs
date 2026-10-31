// The model's tools. Everything the model asks for passes through here:
// arguments are checked in code, ops are allowlisted, refs must exist in the
// live build, and socket ids map back to the exact op the configurator offered.
// The model never gets load(), so it cannot replace the build.

import { CONTRACT, checkerFor, refKinds } from './contract.mjs';
import { BUILD_TESTS } from './checks.mjs';
import { runPlan, rebind, planLookup, ZONE_KINDS } from './plan.mjs';

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
// Which value list governs which field of which op, from the contract (A86).
const VALUE_OF = CONTRACT.valueOf;

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
    const list = VALUE_OF[`${item.op}.${k}`];
    if (!list || item[k] == null) continue;
    if (!VALUES[list].includes(item[k])) throw new Error(`${item.op}.${k} "${item[k]}" is not a ${list}: use one of ${VALUES[list].join(', ')}`);
  }
  // The contract's cross-field rules (A86 over A77), with its own words. forbids
  // turns on a field's value (atMm only when in is a pot), so the page judges it.
  for (const c of CONTRACT.constraints[item.op] ?? []) {
    const [a, b] = c.fields;
    const broken =
      c.kind === 'xor' ? a in item && b in item
      : c.kind === 'requires' ? a in item && !(b in item)
      : c.kind === 'differs' ? a in item && b in item && item[a] === item[b]
      : false;
    if (broken) throw new Error(`${item.op}: ${c.says}`);
  }
  // Every other field as its contract type says: numbers, booleans, literal
  // unions, small objects. Refs are checked against the live build in resolve().
  for (const [k, type] of Object.entries(CONTRACT.fieldTypes[item.op])) {
    if (!(k in item) || k in SHAPES || refKinds(type)) continue;
    const check = checkerFor(type);
    if (check && !check[0](item[k])) throw new Error(`${item.op}.${k} must be ${check[1]}`);
  }
}
// The families find_sockets can ask for: the contract's placeable ones.
const FAMILIES = CONTRACT.placeableFamilies;

// validate()'s prop warnings, and what fixes each: the dressing loop is
// dress -> check -> fix what it flags (A99).
const PROP_FIX = {
  PROP_FLOATING: 'rests on nothing: moveProp it onto a surface from find_surfaces, or removeProp it',
  PROP_INSIDE: 'overlaps a part or another prop: moveProp it to a clear spot (another atMm or surface), or removeProp it',
  PLANT_NOT_IN_SOIL: 'stands in no soil: fillSoil the part first, then plant again',
  PROP_BLOCKS_DRAWER: 'stands where a drawer opens, so it would stop the drawer: moveProp it clear of the pull, or removeProp it',
  PROP_BELOW_RIM: 'sits under the rim of what holds it, hard to see from the side: a taller prop, a shallower compartment (depthMm), or pose stand',
};
const PROP_CODES = new Set(Object.keys(PROP_FIX));

export const LIMITS = { opsPerCall: 30, opsTotal: 250, socketsShown: 40, partsShown: 40, nodesShown: 200, propsShown: 40, surfacesShown: 40 };
const mm = (v) => Math.round(v);
// A refusal's details, kept to a few hundred characters: the field or limit and the numbers.
function clipDetails(d) {
  const text = JSON.stringify(d);
  if (text.length <= 400) return d;
  return { clipped: text.slice(0, 400) };
}

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// The tests set_requirements takes, for its description and its check.
const TEST_FORMS = '{"family":"drawer","min":2} (parts of a family), {"drawers":2} (any drawers), {"bom":"hex-acc-hook","min":3} ' +
  '(parts-list lines containing the text), {"levels":2} (storeys used), {"maxParts":30}, {"noIssue":"OPEN_CAP_FACE"}, ' +
  '{"props":3}, {"prop":"basil","min":2}, {"soil":2} (parts filled with soil)';

export const TOOL_SPECS = [
  {
    name: 'set_requirements',
    description:
      'Before the first change: the brief as 3-6 acceptance tests, each a requirement a person could check on the finished ' +
      'build, with an id (R1, R2, ...) and, where code can check it, one test: ' + TEST_FORMS + '. List every requirement ' +
      'the brief states, also those you expect not to meet. Call it again to revise the list. Code runs the tests at finish.',
    parameters: obj(
      {
        requirements: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: obj(
            {
              id: { type: 'string', description: 'R1, R2, ...' },
              requirement: { type: 'string' },
              test: { type: 'object', description: 'Optional: one code check, as listed above.' },
            },
            ['id', 'requirement'],
          ),
        },
      },
      ['requirements'],
    ),
  },
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
      'A handle needs a cover on its face; spikes stand where three cells meet. ' +
      'A spool axle (family axle) seats in a rod socket (a hex-acc-rod accessory) that faces another rod socket across an ' +
      'empty cell; it is refused NO_PARTNER without one. A filament spool then HANGS on it: addProp {id:"filament-spool", ' +
      'on:"axle:..."} with the axle ref from get_build, no atMm (hang_spools does every axle at once). ' +
      'Each open bay is offered twice, once from each rod socket: either one seats the axle, so count bays, not offers.',
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
        near: { type: 'string', description: 'Only sites at or beside this part ref (same storey, within one cell).' },
        side: { type: 'string', description: 'Only sites on this face (cover, cap, insert, handle).' },
        bearingDeg: { type: 'number', description: 'Only sites at this bearing (cap, insert).' },
        max: { type: 'integer', description: 'Only the first N sites.' },
      },
      ['family'],
    ),
  },
  {
    name: 'find_props',
    description:
      'Search the props: things that stand on or in a build to show what it is for (a mug, a keyboard, tools, books, pots) ' +
      'and plug plants that go in soil. Props are staging, not parts: they are not in the parts list. ' +
      'Each has an id for addProp or plant, its sizes in mm (longest first) and what it is for; where it has authored poses ' +
      '(stand, lie), addProp pose sets it so (a mug stands mouth up) and facingDeg turns its front: prefer that over orient.',
    parameters: obj({
      text: { type: 'string', description: 'Optional words to match in the id, label or kind.' },
      use: { type: 'string', enum: ['desk', 'dining', 'living', 'workshop', 'electronics', 'drone', 'printing', 'grow'] },
      kind: { type: 'string', description: 'Optional kind, e.g. herbs, pots, tools.' },
    }),
  },
  {
    name: 'find_surfaces',
    description:
      'Where a prop can go: the tops, floors, compartments and soil of one part or prop (ref) or of the whole build, each with a token ' +
      '(f1, f2, ...) to pass to addProp as surface, its height, centre, size and clear headroom. With no ref it also lists ' +
      'DECKS (flush neighbouring covers or lids offered as one surface, parts: the refs under it): a wide flat prop (a magazine, ' +
      'a laptop, a plate, a keyboard) goes on a deck, not on one cover; and the surfaces of placed props (the well of a mug: ' +
      'a pencil with pose stand in an empty mug is kept leaning up to 30 degrees, as in a deep bin, compartment, notch, bay or drawer; ' +
      'a shallow tray refuses it where it would tip). With fits "filament-spool" it also lists spool axles (kind mount): a ' +
      'spool hangs on one with surface set to that token. A floor or compartment gives depthMm, how far its ' +
      'rim stands over it: a prop lower than that hides under the rim (addProp warns PROP_BELOW_RIM). With fits (a prop id), ' +
      'the surfaces the prop fits, a top it fits only by overhanging marked overhangs (its centre still over the top); a wall hook ' +
      'is a mount too. When fits finds nothing, try addProp on the part with apply dryRun. Hold a pose against a surface with the ' +
      'poseHeightMm of the prop from find_props: under depthMm it hides below the rim, over headroomMm it does not fit.',
    parameters: obj({
      ref: { type: 'string', description: 'Optional part or prop ref from get_build.' },
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
    name: 'plan_build',
    description:
      'Build from a role graph (A50): site, zones and roles, bound to offers by the configurator and placed role by role, ' +
      'each op tagged with its role. A refused offer rebinds that role only. Returns the refs of each role and the roles left short. ' +
      'With rebind: a role id, takes that role off and binds it again elsewhere (a role others stand on cannot be rebound).',
    parameters: obj({
      plan: {
        type: 'object',
        description:
          'site: {userSide, wallSide} as axial steps such as {"q":0,"r":1}; zones: [{id, kind: ' + ZONE_KINDS.join('|') + ', side: user|wall (depth) or cells}] ' +
          '(work_clear stays empty); roles in build order: [{id, serves (a requirement id), need: {family, variant, stem, level, face, type} or {prop}, ' +
          'count, zone, relations: [{rel: on|above|beside (a part) or on|in (a prop), of: an earlier role}]}].',
      },
      rebind: { type: 'string', description: 'A role id of the last plan to place again.' },
      reason: { type: 'string', description: 'Why it is rebound (a refusal or warning code).' },
    }),
  },
  {
    name: 'look',
    description:
      'Look at the build as a person would: the camera at az (degrees around the build from the front, +z, towards +x; 45) and polar ' +
      '(degrees down from straight up; 62, and 10 is from above), framing the whole build, the props, or one part or prop ref. ' +
      'Says which props the view sees and which are hidden (by a rim, a lid, another prop, or out of shot). Changes nothing on the build.',
    parameters: obj({
      az: { type: 'number' },
      polar: { type: 'number' },
      fit: { type: 'string', description: "'build' (default), 'props', or a part or prop ref." },
    }),
  },
  {
    name: 'apply',
    description:
      'Change the build. Each item is either {"socket":"s12"} (an offer from find_sockets) or a full op object. ' +
      'Atomic by default: if any op is refused, the whole batch is taken back. Refusals carry a code, a message and ' +
      'nearby alternatives (also given socket ids). Never invent a ref: take refs from get_build or an outcome. ' +
      'Props: addProp with an id from find_props, on a part ref or "bench" (atMm moves it off the centre), or on a surface token ' +
      'from find_surfaces (surface or on, not both); several props can go in one apply (atomic false keeps the ones that rest); ' +
      'moveProp and removeProp take a prop ref from get_build. A filament spool hangs on a spool axle: on "axle:..." (an axle ref), no atMm. ' +
      'pose stand on a prop (a pencil in an empty mug: on the mug ref, not its floor surface) is kept leaning up to 30 degrees; the pencil-cup prop already holds its own pencils and takes no more. Soil: fillSoil a bin or pot part, then plant a plant id in it. ' +
      'A refused prop may carry tryInstead (a socket id for the same op varied so it places): apply that socket as it is. ' +
      'After dressing, call check_build and fix the prop warnings it lists. ' +
      `Ops and their fields (? = optional): ${OP_TABLE}. ` +
      `Named values: ${Object.entries(VALUES).filter(([k]) => k !== 'variant').map(([k, v]) => `${k}: ${v.join('|')}`).join('; ')}. ` +
      'Cover magnets are setCoverMagnets on a fitted cover, not a cover type. ' +
      'House rules as ops: capOpenFaces caps every open face with solid end caps (skip: faces to leave open), lockJoints bolts the ' +
      'joints so nothing slides apart; run both once the parts are settled, before dressing. A wall hook (hex-acc-hook accessory) is a ' +
      'hang point: addProp on its ref hangs a cable coil, a roll of gaffer tape or FPV goggles. Every applied op reports the print ' +
      'budget (grams, minutes, parts), so bom is not needed for it. A refusal of a malformed op carries details: read them.',
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
  // Compound helpers (A85): one call for what took a lookup, an apply and a
  // check. Each is a thin wrapper: it builds addProp/fillSoil/plant ops, runs
  // them through apply (atomic false: the ones that rest stay), then reports
  // the prop warnings check_build would give.
  {
    name: 'dress',
    description:
      'Place several props in one call, then check them. Each item is an addProp: id from find_props, and where: on (a part, ' +
      'prop or axle ref, or "bench"), surface (a token from find_surfaces), or in (a part or prop ref: the prop goes on the ' +
      'first surface of it that it fits and that this call has not used yet, so three items in one bin take three compartments; ' +
      'in a prop such as a mug, all aim at its centre and a second is refused as overlapping the first, so give each its own atMm). ' +
      'atMm, yawDeg, pose and facingDeg as addProp takes them. Returns each outcome and the prop warnings left (flagged, each ' +
      'with its fix): fix those, then check_build before finish.',
    parameters: obj(
      {
        props: {
          type: 'array',
          minItems: 1,
          maxItems: LIMITS.opsPerCall,
          items: { type: 'object', description: '{"id":"mug","on":"cover:..."} or {"id":"pencil","in":"bin:...","pose":"stand"} or {"id":"magazine","surface":"f3"}' },
        },
      },
      ['props'],
    ),
  },
  {
    name: 'hang_spools',
    description: 'Hang a filament spool (or the prop id given) on every spool axle of the build that has none, in one call, then check them.',
    parameters: obj({ id: { type: 'string', description: 'Default filament-spool.' }, role: { type: 'string', description: 'Optional: the requirement id these serve.' } }),
  },
  {
    name: 'fill_and_plant',
    description:
      'Fill bins with soil and plant them in one call: each bed is a part ref (a bin, bolt-on bin, notch or bay bin) and a plug ' +
      'plant id from find_props (plant: true). Leave plant out and the configurator picks one of the stage the soil depth suits ' +
      '(a tray seedlings, one storey young, deeper harvest size). A part that already holds soil is not filled again. Then checks PLANT_NOT_IN_SOIL.',
    parameters: obj(
      {
        beds: {
          type: 'array',
          minItems: 1,
          maxItems: 15,
          items: obj({ part: { type: 'string' }, plant: { type: 'string' }, role: { type: 'string' } }, ['part']),
        },
      },
      ['beds'],
    ),
  },
  {
    name: 'fill_compartments',
    description:
      'Put one prop in every open floor and compartment of the given parts (bins, trays, drawers; soil is skipped), taking the ' +
      'props in turn and giving each surface the next one that fits it, in one call; then check them.',
    parameters: obj(
      {
        parts: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' }, description: 'Part refs from get_build.' },
        props: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' }, description: 'Prop ids from find_props, in the order to use them.' },
        role: { type: 'string', description: 'Optional: the requirement id these serve.' },
      },
      ['parts', 'props'],
    ),
  },
  { name: 'undo', description: 'Take back the last change (one apply is one step).', parameters: obj({}) },
  { name: 'redo', description: 'Put back the change undo took back.', parameters: obj({}) },
  {
    name: 'check_build',
    description:
      'Run the configurator checks: rule issues (errors, warnings), the browser mesh-collision gate, and the prop warnings: ' +
      'PROP_FLOATING (a prop rests on nothing), PROP_INSIDE (a prop overlaps a part or another prop), PLANT_NOT_IN_SOIL. ' +
      'Each prop warning comes back in props with its prop ref and the fix; fix every one before finish.',
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

// The tool list a session offers: set_requirements and a finish keyed by
// requirement id only with acceptance tests (A64), an outcome only with
// abstention (A58). Neither on is the interactive default as it was.
export function toolSpecsFor({ acceptance = false, abstain = false, rolegraph = false } = {}) {
  return TOOL_SPECS.filter((t) => (acceptance || t.name !== 'set_requirements') && (rolegraph || t.name !== 'plan_build')).map((t) => {
    if (t.name !== 'finish') return acceptance ? t : withoutRole(t);
    if (!acceptance && !abstain) return t;
    const req = {
      ...(acceptance ? { id: { type: 'string', description: 'The id from set_requirements.' } } : {}),
      requirement: { type: 'string' },
      status: { type: 'string', enum: acceptance ? ['met', 'partial', 'unmet', 'unverified'] : ['met', 'partial', 'unmet'] },
      evidence: { type: 'string', description: 'Which parts (refs or families) meet it, or why not.' },
    };
    return {
      ...t,
      description: t.description + (acceptance ? ' Give every id from set_requirements a status; unverified: it may hold but nothing here can check it.' : ''),
      parameters: obj(
        {
          requirements: { type: 'array', items: obj(req, [...(acceptance ? ['id'] : []), 'requirement', 'status', 'evidence']) },
          summary: { type: 'string' },
          ...(abstain ? { outcome: { type: 'string', enum: ['built', 'compromise', 'declined'], description: 'built: the brief as asked; compromise: a safe or feasible part of it; declined: nothing built, and why.' } } : {}),
        },
        ['requirements', 'summary', ...(abstain ? ['outcome'] : [])],
      ),
    };
  });
}

// The helpers' role fields, left out of the schema when roles are off.
function withoutRole(t) {
  const strip = (o) => {
    if (!o || typeof o !== 'object') return o;
    if (Array.isArray(o)) return o.map(strip);
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'properties' && v && 'role' in v) {
        const { role, ...rest } = v;
        out[k] = strip(rest);
      } else out[k] = strip(v);
    }
    return out;
  };
  return JSON.stringify(t).includes('"role"') ? strip(t) : t;
}

// Tools that change the build: with acceptance tests on, none runs before set_requirements.
const MUTATING = new Set(['plan_build', 'apply', 'dress', 'hang_spools', 'fill_and_plant', 'fill_compartments', 'undo', 'redo']);

export function createTools(hex, { onEvent = () => {}, acceptance = false } = {}) {
  const sockets = new Map();
  let nextSocket = 1;
  const surfaces = new Map();
  let nextSurface = 1;
  let propIds = null;
  let partNames = null;
  let opsTotal = 0;
  let refusalStreak = 0;
  const counters = { applied: 0, refused: 0, refusalCodes: {} };
  // A64: the brief as acceptance tests. A63: the requirement each placed
  // object serves, by ref, so a change that drops a purpose says so.
  let requirements = null;
  let changed = false;
  const roles = new Map();
  // A50: the last role-graph plan run, so one role can be rebound.
  let lastPlan = null;

  function takeRole(item) {
    if (!item || typeof item !== 'object' || !('role' in item)) return [item, null];
    const { role, ...rest } = item;
    if (role == null || !acceptance) return [rest, null];
    if (typeof role !== 'string') throw new Error('role must be a requirement id such as "R2"');
    if (requirements && !requirements.some((r) => r.id === role)) {
      throw new Error(`role ${role} is not a requirement id: use one of ${requirements.map((r) => r.id).join(', ')}`);
    }
    return [rest, role];
  }

  const roleCounts = (live) => {
    const n = {};
    for (const [ref, role] of roles) if (live.has(ref)) n[role] = (n[role] ?? 0) + 1;
    return n;
  };
  const liveSet = (s) => new Set([...s.nodes.map((n) => n.ref), ...(s.staging?.props ?? []).map((p) => p.ref)]);

  // After a change: which tagged objects went, and which roles have none left.
  function roleChange(before, after) {
    const removed = [...roles].filter(([ref]) => before.has(ref) && !after.has(ref)).map(([ref, role]) => ({ ref, role }));
    const was = roleCounts(before), now = roleCounts(after);
    const lost = Object.keys(was).filter((r) => !now[r]);
    if (!removed.length && !lost.length) return null;
    const what = (id) => requirements?.find((r) => r.id === id)?.requirement;
    return {
      ...(removed.length ? { removed } : {}),
      ...(lost.length ? {
        lost: lost.map((id) => ({ role: id, ...(what(id) ? { requirement: what(id) } : {}) })),
        note: 'Nothing on the build serves these roles any more: put one back, serve the role another way, or report it unmet in finish.',
      } : {}),
    };
  }

  const remember = (op) => {
    const id = `s${nextSocket++}`;
    sockets.set(id, op);
    return id;
  };

  async function liveRefs() {
    const s = await hex.call('getState');
    return { node: new Set(s.nodes.map((n) => n.ref)), prop: new Set((s.staging?.props ?? []).map((p) => p.ref)) };
  }

  async function partValues() {
    const list = await hex.call('listParts', { compact: true });
    partNames ??= (Array.isArray(list) ? list : list.parts).map((p) => p.value ?? p.part);
    return partNames;
  }

  async function knownProps() {
    propIds ??= new Set((await hex.call('listProps')).map((p) => p.id));
    return propIds;
  }

  async function resolve(item, refs) {
    if (item && typeof item.socket === 'string') {
      const op = sockets.get(item.socket);
      if (!op) throw new Error(`unknown socket id ${item.socket}: call find_sockets again`);
      return { ...op };
    }
    if (!item || typeof item.op !== 'string') throw new Error('each item needs "socket" or "op"');
    if (!BUILD_OPS.has(item.op)) throw new Error(`op ${item.op} is not allowed here`);
    checkOpShape(item);
    // Each ref field takes what its contract type names: part refs, prop refs, or a literal such as 'bench'.
    for (const [k, type] of Object.entries(CONTRACT.fieldTypes[item.op])) {
      const kinds = refKinds(type);
      if (!kinds || !(k in item) || kinds.literals.includes(item[k])) continue;
      if (k === 'on' && surfaces.has(item[k])) continue; // a surface token, mapped below
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
    // on takes a surface too (A95): a token from find_surfaces becomes its surface id.
    if ((item.op === 'addProp' || item.op === 'moveProp') && typeof item.on === 'string' && surfaces.has(item.on)) {
      return { ...item, on: surfaces.get(item.on) };
    }
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
      // Which field or limit broke and by how much (A32, A60); kept short.
      ...(o.details && Object.keys(o.details).length ? { details: clipDetails(o.details) } : {}),
      alternatives: o.validAlternatives.map((a) => ({ socket: remember(a.op), at: a.at, slot: a.slot, op: a.op })),
      // A refused prop may come with the same op varied (its other pose, a turn, a small shift) that does place.
      ...(o.details?.tryInstead ? { tryInstead: { socket: remember(o.details.tryInstead), op: o.details.tryInstead } } : {}),
    };
  }

  const roleOf = (ref) => (roles.has(ref) ? { role: roles.get(ref) } : {});

  const handlers = {
    async plan_build({ plan, rebind: roleId, reason } = {}) {
      // Lookups see every offer (ranked and filtered in code); changes go through apply and its checks.
      const lookup = planLookup((name, args) => (name === 'apply' ? run(name, args) : handlers[name](args, { all: true }).catch((e) => ({ error: String(e.message ?? e) }))));
      if (roleId) {
        if (!lastPlan?.state) throw new Error('rebind needs a plan placed by plan_build first');
        lastPlan = await rebind(lastPlan, roleId, lookup, { reason });
      } else {
        // With acceptance tests, a role serves a declared requirement or none.
        const ids = new Set((requirements ?? []).map((r) => r.id));
        const stray = acceptance ? (plan?.roles ?? []).filter((r) => r.serves != null && !ids.has(r.serves)) : [];
        if (stray.length) throw new Error(`serves must be a requirement id (${[...ids].join(', ')}): ${stray.map((r) => r.id).join(', ')}`);
        // A new plan over a placed one would stack on its objects and lose the way to rebind them.
        if (lastPlan?.state) {
          const live = liveSet(await hex.call('getState'));
          const still = [...lastPlan.state.placed.values()].flat().flatMap((b) => b.refs).filter((r) => live.has(r));
          if (still.length) throw new Error(`the last plan still has ${still.length} objects on the build: rebind its roles, or take them off (undo or remove) before a new plan`);
        }
        lastPlan = await runPlan(plan, lookup, { families: FAMILIES });
      }
      return planSummary(lastPlan);
    },

    async set_requirements({ requirements: list }) {
      if (!Array.isArray(list) || !list.length || list.length > 8) throw new Error('requirements must be 1 to 8 items');
      const ids = new Set();
      const out = [];
      const notes = [];
      for (const r of list) {
        if (!r || typeof r.id !== 'string' || !r.id || typeof r.requirement !== 'string') throw new Error('each requirement needs an id and a requirement');
        if (ids.has(r.id)) throw new Error(`id ${r.id} is used twice`);
        ids.add(r.id);
        if (r.test != null) {
          const keys = Object.keys(r.test);
          const main = keys.filter((k) => BUILD_TESTS.includes(k));
          if (main.length !== 1 || keys.some((k) => k !== main[0] && k !== 'min')) {
            throw new Error(`${r.id}: test ${JSON.stringify(r.test)} is not one of ${TEST_FORMS}`);
          }
        }
        // A test naming nothing that exists can only fail: say so now, not at finish.
        const t = r.test ?? {};
        if (typeof t.bom === 'string' && /\s/.test(t.bom.trim())) {
          throw new Error(`${r.id}: bom "${t.bom}" is matched against part names such as hex-acc-hook: one word of a part name, no spaces`);
        }
        if (typeof t.family === 'string' && !CONTRACT.placeableFamilies.includes(t.family)) {
          throw new Error(`${r.id}: family "${t.family}" is not one of ${CONTRACT.placeableFamilies.join(', ')}`);
        }
        if (typeof t.prop === 'string' && ![...(await knownProps())].some((id) => id.includes(t.prop))) {
          throw new Error(`${r.id}: no prop id contains "${t.prop}": take it from find_props`);
        }
        if (typeof t.bom === 'string' && !(await partValues()).some((v) => v.includes(t.bom))) {
          notes.push(`${r.id}: no catalog part contains "${t.bom}" (covers, caps and magnets show only in bom once placed): check it with bom`);
        }
        out.push({ id: r.id, requirement: r.requirement, ...(r.test != null ? { test: r.test } : {}) });
      }
      // Once the build has changed, a revision may add requirements but not drop one or change its test:
      // the tests are set before the work, not fitted to it.
      if (changed && requirements) {
        for (const old of requirements) {
          const now = out.find((r) => r.id === old.id);
          if (!now) throw new Error(`${old.id} cannot be dropped after the build has changed: report it unmet in finish instead`);
          if (JSON.stringify(now.test ?? null) !== JSON.stringify(old.test ?? null)) throw new Error(`${old.id}'s test cannot change after the build has changed`);
        }
      }
      for (const [ref, role] of roles) if (!ids.has(role)) roles.delete(ref);
      requirements = out;
      return {
        ok: true,
        requirements: out.length,
        note: 'Tag each op with the id it serves: role "R2" on an apply item or a dress prop, role on the helpers. ' +
          'In finish, give every id a status. Code runs the tests at finish.',
        ...(notes.length ? { check: notes } : {}),
      };
    },

    async get_build() {
      const s = await hex.call('getState');
      const counts = {};
      for (const n of s.nodes) counts[n.family] = (counts[n.family] ?? 0) + 1;
      return {
        nodes: s.nodes.slice(0, LIMITS.nodesShown).map((n) => ({ ref: n.ref, family: n.family, at: n.at, stem: n.stem, ...roleOf(n.ref) })),
        total: s.nodes.length,
        counts,
        props: (s.staging?.props ?? []).map((p) => ({
          ref: p.ref, id: p.id, label: p.label, atMm: p.posMm.map(mm), yawDeg: mm(p.yawDeg), ...(p.pot ? { pot: p.pot } : {}), ...roleOf(p.ref),
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
          // its authored poses (A49): addProp pose stand or lie sets it so, facingDeg turns its front
          ...(p.poses?.length ? { poses: p.poses, defaultPose: p.defaultPose } : {}),
          // how tall it stands in each pose, to hold against a surface's depthMm or headroomMm
          ...(p.poseHeightMm && Object.keys(p.poseHeightMm).length ? { poseHeightMm: Object.fromEntries(Object.entries(p.poseHeightMm).map(([k, v]) => [k, mm(v)])) } : {}),
        })),
      };
    },

    // all: every surface, not the first LIMITS.surfacesShown (the planner's path, never the model's).
    async find_surfaces({ ref, fits } = {}, { all: every = false } = {}) {
      const all = await hex.call('surfaces', ...(fits ? [ref, { fits }] : ref ? [ref] : []));
      const size = (o) => {
        const xs = o.map((p) => p[0]), zs = o.map((p) => p[1]);
        return { x: mm(Math.max(...xs) - Math.min(...xs)), z: mm(Math.max(...zs) - Math.min(...zs)) };
      };
      const out = {
        total: all.length,
        surfaces: (every ? all : all.slice(0, LIMITS.surfacesShown)).map((f) => {
          const token = tokenFor(f.id);
          return {
            surface: token, label: f.label, kind: f.kind, yMm: mm(f.yMm), centreMm: [mm(f.centreMm.x), mm(f.centreMm.z)],
            sizeMm: size(f.outlineMm), headroomMm: f.headroomMm == null ? null : mm(f.headroomMm),
            // a deck names the lids under it; a floor or compartment how deep its rim stands
            ...(f.parts ? { deckOf: f.parts } : {}), ...(f.depthMm != null ? { depthMm: mm(f.depthMm) } : {}),
            // With fits: the prop goes on this top only by overhanging it (A75).
            ...(f.overhangs ? { overhangs: true } : {}),
          };
        }),
      };
      // fits lists only surfaces the prop fits inside; a bigger prop can still rest overhanging a top.
      if (!all.length) out.note = fits ? `No surface here is as big as ${fits}. It may still rest overhanging a top: try addProp on the part with dryRun.` : 'No surfaces here.';
      return out;
    },

    async look({ az, polar, fit } = {}) {
      const opts = Object.fromEntries(Object.entries({ az, polar, fit }).filter(([, v]) => v != null));
      const v = await hex.call('view', opts);
      if (!v.ok) return { error: `${v.code}: ${v.message}` };
      const s = await hex.call('still', { width: 960, height: 600 });
      if (!s.ok) return { error: `${s.code}: ${s.message}` };
      // The picture goes to the trace (for people and the critic); the model reads what it shows.
      onEvent({ type: 'still', az: v.az, polar: v.polar, fit: v.fit, png: s.png });
      const hidden = s.seen.filter((p) => p.samples === 0).map((p) => p.ref);
      return {
        az: v.az, polar: v.polar, fit: v.fit,
        seen: s.seen.filter((p) => p.samples > 0).map((p) => ({ ref: p.ref, of27: p.samples })),
        ...(hidden.length ? { hidden, note: 'Hidden props cannot be seen from here: move them up, out, or try another view.' } : {}),
        ...(v.outOfFrame.length ? { outOfFrame: v.outOfFrame } : {}),
      };
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

    async find_sockets(query, { all = false } = {}) {
      // compact: the ops alone (each holds its cell, family and slot), about half the text (A59).
      // A page before A59 answers full offers: take the op out of each.
      const offers = (await hex.call('openSockets', { ...query, compact: true })).map((o) => ({ op: typeof o.op === 'string' ? o : o.op }));
      const out = {
        total: offers.length,
        // The op already names the cell and the face, bearing or slot: no need to repeat them (A59).
        sockets: (all ? offers : offers.slice(0, LIMITS.socketsShown)).map((o) => ({ socket: remember(o.op), op: o.op })),
      };
      if (!offers.length) out.note = NO_OFFERS;
      return out;
    },

    async apply({ ops, atomic = true, dryRun = false }) {
      if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops must be a non-empty array');
      if (dryRun) {
        // One op, nothing changes, nothing counts against the budget.
        if (ops.length !== 1) throw new Error('a dry run tries one op at a time');
        const o = await hex.call('apply', await resolve(takeRole(ops[0])[0], await liveRefs()), { dryRun: true });
        return { dryRun: true, outcomes: [summarizeOutcome(o)] };
      }
      if (acceptance && !requirements) throw new Error('Call set_requirements first: the brief as acceptance tests, before the first change.');
      if (ops.length > LIMITS.opsPerCall) throw new Error(`at most ${LIMITS.opsPerCall} ops per call`);
      if (opsTotal + ops.length > LIMITS.opsTotal) throw new Error(`op budget of ${LIMITS.opsTotal} reached: finish now`);
      const refs = await liveRefs();
      const before = new Set([...refs.node, ...refs.prop]);
      const resolved = [];
      const roleFor = new Map();
      for (const item of ops) {
        const [rest, role] = takeRole(item);
        const op = await resolve(rest, refs);
        resolved.push(op);
        if (role) roleFor.set(op, role);
      }
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
      if (!r.rolledBack) tagRoles(batch, r.outcomes, roleFor);
      const out = { rolledBack: r.rolledBack, outcomes: r.outcomes.map(summarizeOutcome) };
      // The running print cost after this call (A51): the last applied op's.
      const budget = r.outcomes.filter((o) => o.ok && o.budget).at(-1)?.budget;
      if (budget && !r.rolledBack) out.budget = { grams: mm(budget.grams), minutes: mm(budget.minutes), parts: budget.parts, ...(budget.unmeasured?.length ? { unmeasured: budget.unmeasured } : {}) };
      const change = roles.size ? roleChange(before, liveSet(await hex.call('getState'))) : null;
      if (change) out.roles = change;
      // Consecutive refusals across calls: past the limit, say so plainly.
      for (const o of r.outcomes) refusalStreak = o.ok ? 0 : refusalStreak + 1;
      if (refusalStreak >= STREAK_LIMIT) {
        out.warning = `${refusalStreak} refusals in a row. Stop guessing: read the refusal messages, change the build so find_sockets offers the part, or report the requirement as unmet.`;
      }
      // A prop warning on an outcome (PROP_BELOW_RIM) comes with its fix.
      const propWarned = [...new Set(r.outcomes.flatMap((o) => (o.ok ? o.warnings.map((w) => w.code) : [])).filter((c) => PROP_CODES.has(c)))];
      if (propWarned.length) out.fix = Object.fromEntries(propWarned.map((c) => [c, PROP_FIX[c]]));
      if (dropped.length) {
        out.droppedAlreadyFitted = dropped;
        out.note = 'These ops were refused ALREADY_FITTED (that state already holds), so the batch was applied again without them.';
      }
      return out;
    },

    async undo() {
      const before = roles.size ? liveSet(await hex.call('getState')) : null;
      const ok = await hex.call('undo');
      await hex.call('settle');
      const change = before && roleChange(before, liveSet(await hex.call('getState')));
      return { undone: ok, ...(change ? { roles: change } : {}) };
    },

    async redo() {
      const before = roles.size ? liveSet(await hex.call('getState')) : null;
      const ok = await hex.call('redo');
      await hex.call('settle');
      const change = before && roleChange(before, liveSet(await hex.call('getState')));
      return { redone: ok, ...(change ? { roles: change } : {}) };
    },

    async check_build() {
      const v = await hex.call('validate');
      const props = v.issues.filter((i) => PROP_CODES.has(i.code)).map(propFlag);
      return {
        ok: v.ok,
        meshClash: v.meshClash,
        issues: v.issues.filter((i) => !PROP_CODES.has(i.code)).map((i) => ({ severity: i.severity, code: i.code, refs: i.refs, message: i.message })),
        ...(props.length ? { props } : {}),
        note: 'ok covers rule errors only. meshClash must read "clear" for the meshes to be checked and clear.' +
          (props.length ? ' Fix each prop warning (props) before finish.' : ''),
      };
    },

    async dress({ props }) {
      if (!Array.isArray(props) || !props.length) throw new Error('props must be a non-empty array');
      const used = new Set();
      const ops = [];
      for (const p of props) {
        if (!p || typeof p.id !== 'string') throw new Error('each prop needs an id from find_props');
        const { in: holder, role, ...rest } = p;
        const tag = role != null ? { role } : {};
        if (holder == null) { ops.push({ op: 'addProp', ...rest, ...tag }); continue; }
        if ('on' in rest || 'surface' in rest) throw new Error(`${p.id}: give in, on or surface, one of them`);
        // In a prop (a pencil in a mug): on the prop itself, aimed at its middle, else its well's floor. Neither
        // always places: on 5310 (viz 9e448f92) a pencil stands in a mug only through the floor, in a pencil cup
        // only on the cup. So the dry run picks; nothing changes and nothing counts against the budget.
        if (holder.startsWith('prop:')) {
          const viaOn = { op: 'addProp', ...rest, on: holder };
          const well = !('atMm' in rest) && (await hex.call('surfaces', holder)).find((f) => f.kind === 'floor');
          const onOk = !well || (await hex.call('apply', viaOn, { dryRun: true })).ok;
          ops.push(onOk ? { ...viaOn, ...tag } : { op: 'addProp', ...rest, surface: tokenFor(well.id), ...tag });
          continue;
        }
        // The first surface of the holder this prop fits that this call has not taken yet.
        const free = (await hex.call('surfaces', holder, { fits: p.id })).filter((f) => f.kind !== 'soil' && !used.has(f.id));
        if (!free.length) { ops.push({ op: 'addProp', ...rest, on: holder, ...tag }); continue; }
        used.add(free[0].id);
        ops.push({ op: 'addProp', ...rest, ...alongFor(free[0], rest), surface: tokenFor(free[0].id), ...tag });
      }
      return withPropCheck(await handlers.apply({ ops, atomic: false }));
    },

    async hang_spools({ id = 'filament-spool', role } = {}) {
      const s = await hex.call('getState');
      const axles = s.nodes.filter((n) => n.family === 'axle');
      if (!axles.length) return { hung: 0, note: 'The build has no spool axles: find_sockets family axle offers where one seats.' };
      // An axle already holding this prop refuses a second one; those come back as refusals, nothing changes.
      return withPropCheck(await handlers.apply({ ops: axles.map((a) => ({ op: 'addProp', id, on: a.ref, ...(role != null ? { role } : {}) })), atomic: false }));
    },

    async fill_and_plant({ beds }) {
      if (!Array.isArray(beds) || !beds.length) throw new Error('beds must be a non-empty array');
      const soil = new Set(((await hex.call('getState')).staging?.soil ?? []).map((x) => x.part));
      const ops = [];
      for (const b of beds) {
        const tag = b.role != null ? { role: b.role } : {};
        let plant = b.plant;
        if (plant == null) {
          // The house rule for this soil depth (A19).
          const s = await hex.call('suggestPlants', b.part);
          if (!s?.plants?.length) throw new Error(`${b.part}: no plant to suggest (${s?.why ?? 'not fillable'})`);
          plant = s.plants[0].id;
        }
        if (!soil.has(b.part)) { ops.push({ op: 'fillSoil', part: b.part, ...tag }); soil.add(b.part); }
        ops.push({ op: 'plant', id: plant, in: b.part, ...tag });
      }
      return withPropCheck(await handlers.apply({ ops, atomic: false }));
    },

    async fill_compartments({ parts, props, role }) {
      if (!Array.isArray(parts) || !parts.length || !Array.isArray(props) || !props.length) throw new Error('parts and props must be non-empty arrays');
      const ops = [];
      let k = 0;
      for (const part of parts) {
        const open = (await hex.call('surfaces', part)).filter((f) => f.kind === 'floor' || f.kind === 'compartment');
        for (const f of open) {
          // The next prop in turn that fits this surface; none fits: the next in turn anyway, and the page decides.
          let pick = null;
          for (let j = 0; j < props.length && !pick; j++) {
            const id = props[(k + j) % props.length];
            if ((await hex.call('surfaces', part, { fits: id })).some((g) => g.id === f.id)) { pick = id; k += j + 1; }
          }
          const id = pick ?? props[k++ % props.length];
          ops.push({ op: 'addProp', id, ...alongFor(f, { id }), surface: tokenFor(f.id), ...(role != null ? { role } : {}) });
        }
      }
      if (!ops.length) return { placed: 0, note: 'None of these parts has an open floor or compartment.' };
      if (ops.length > LIMITS.opsPerCall) throw new Error(`${ops.length} compartments: at most ${LIMITS.opsPerCall} per call, pass fewer parts`);
      return withPropCheck(await handlers.apply({ ops, atomic: false }));
    },
  };

  // A narrow compartment takes a prop only with its long side along the
  // compartment's (a 46 x 34 heap in a 44 mm strip of a div3 bin): turn it so,
  // unless the item already says how it turns or names an authored pose.
  function alongFor(surface, item) {
    if (['yawDeg', 'orient', 'pose', 'facingDeg'].some((k) => k in item) || !surface.outlineMm?.length) return {};
    const xs = surface.outlineMm.map((p) => p[0]), zs = surface.outlineMm.map((p) => p[1]);
    const mx = xs.reduce((a, b) => a + b) / xs.length, mz = zs.reduce((a, b) => a + b) / zs.length;
    let sxx = 0, szz = 0, sxz = 0;
    for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; szz += (zs[i] - mz) ** 2; sxz += (xs[i] - mx) * (zs[i] - mz); }
    // A round or square outline has no long side to follow.
    const spread = Math.sqrt((sxx - szz) ** 2 + 4 * sxz ** 2);
    if (spread < 0.15 * (sxx + szz)) return {};
    // The principal axis in x, z, as a bearing about up from +x (a yaw takes +x to (cos, -sin)).
    const deg = ((Math.atan2(-2 * sxz, sxx - szz) / 2) * 180) / Math.PI;
    const near = (a) => Math.abs(((deg - a + 540) % 180) - 0) < 15 || Math.abs(((deg - a + 540) % 180) - 180) < 15;
    return { orient: { longAlong: near(0) ? 'x' : near(90) ? 'z' : Math.round(deg) } };
  }

  // Each placed object takes the role of the op that placed it; an op that
  // replaces an object (moveProp, replace, planting a pot) passes its role on.
  function tagRoles(batch, outcomes, roleFor) {
    const aligned = outcomes.length === batch.length;
    outcomes.forEach((o, i) => {
      if (!o.ok) return;
      const role = (aligned ? roleFor.get(batch[i]) : null) ?? (o.removed ?? []).map((ref) => roles.get(ref)).find(Boolean);
      if (role) for (const ref of o.added ?? []) roles.set(ref, role);
    });
  }

  function planSummary(p) {
    if (p.errors) return { ok: false, errors: p.errors, note: 'Nothing was placed: fix the plan and call plan_build again.' };
    const refused = p.log.filter((l) => l.ok === false).map((l) => ({ role: l.role, code: l.code }));
    return {
      ok: p.ok,
      roles: Object.fromEntries(Object.entries(p.bindings).map(([id, bs]) => [id, bs.flatMap((b) => b.refs)])),
      ...(p.short.length ? { short: p.short, note: 'Short roles are unmet unless you serve them another way: apply, a looser plan, or report them in finish.' } : {}),
      ...(refused.length ? { refused } : {}),
    };
  }

  function tokenFor(id) {
    const token = `f${nextSurface++}`;
    surfaces.set(token, id);
    return token;
  }

  // A prop warning names its prop in refs (viz 0c9c13fe); before that only in the message: "(prop:...)".
  function propFlag(i) {
    const prop = i.refs?.find((r) => r.startsWith('prop:')) ?? i.message.match(/\((prop:[^)]+)\)/)?.[1] ?? null;
    return { code: i.code, prop, message: i.message, fix: PROP_FIX[i.code] };
  }

  // A compound helper's last step: the prop warnings validate() gives now.
  async function withPropCheck(out) {
    const v = await hex.call('validate');
    const flagged = v.issues.filter((i) => PROP_CODES.has(i.code)).map(propFlag);
    const placed = out.outcomes.filter((o) => o.ok).length;
    return { placed, refused: out.outcomes.length - placed, ...out, flagged, ...(flagged.length ? {} : { note: 'No prop warnings.' }) };
  }

  async function run(name, rawArgs) {
    const handler = handlers[name];
    if (!handler) return { error: `unknown tool ${name}` };
    let args;
    try {
      args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : rawArgs ?? {};
    } catch {
      return { error: 'arguments were not valid JSON' };
    }
    if (acceptance && !requirements && MUTATING.has(name) && !(name === 'apply' && args?.dryRun)) {
      return { error: 'Call set_requirements first: the brief as acceptance tests, before the first change.' };
    }
    if (MUTATING.has(name) && !(name === 'apply' && args?.dryRun)) changed = true;
    try {
      return await handler(args);
    } catch (e) {
      return { error: String(e.message ?? e) };
    }
  }

  return { run, counters, opsUsed: () => opsTotal, requirements: () => requirements, roles: () => Object.fromEntries(roles) };
}
