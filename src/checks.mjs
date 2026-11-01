// Code-side checks that a build meets its brief, so "met" is not only the
// model's word. Each expectation reads the final state, the BOM or the
// model's own finish report, and returns pass or fail with what it saw.
//
//   { family: 'drawer', min: 2 }        at least 2 drawer nodes
//   { bom: 'hex-spike-stud', min: 1 }   BOM keys containing the text, summed qty
//   { levels: 2 }                       parts on at least 2 storeys
//   { noIssue: 'OPEN_CAP_FACE' }        validate() did not report this code
//   { reportsUnmet: true }              the model said at least one requirement is not met
//   { maxParts: 40 }                    at most this many nodes
//   { props: 3 }                        at least 3 props staged on or by the build
//   { prop: 'basil', min: 2 }           props whose id contains the text
//   { soil: 1 }                         parts filled with soil
//   { outcome: ['declined'] }           finish.outcome is one of these (A58)
//   { notClaimed: 'step|stand on' }     no requirement matching this (any case) is called met or partial
//   { spike: true, variant: 'mount', accessory: 'platform', facing: 'down', min: 1 }
//                                       spikes of that kind (E8); accessory is a substring
//   { drawerOpen: 1 }                   drawers shown pulled open
//   { clusters: 2, joinedBy: 'connector', size: 2 }  bases in exactly that many groups once the
//                                       connector walls are taken out (each of that size), and a
//                                       connector joining two of them
//   { coverType: 'cable', min: 1 }      covers of that type
//   { onTopStorey: 'bin' }              a part of that family on the highest storey a base is on
//   { onBottomStorey: 'drawer' }        a drawer (cut-face or notch) on storey 0
//   { perFamily: { prop: 'filament-spool', family: 'axle' } }  at least one such prop per part
//
// The spike and drawer checks read each node's detail.entry ("0#0,0|0,1|1,0;mount;platform-sm",
// "0#-1,0#cut~s@open"); a trace from before detail was kept falls back to its apply events.
//
// A brief with no outcome expectation must not be declined: refusing a
// buildable brief is a failure too.

// The expectations an agent may write as its own acceptance tests (A64): the
// ones that read the build, not the agent's report.
export const BUILD_TESTS = ['family', 'drawers', 'bom', 'levels', 'noIssue', 'maxParts', 'props', 'prop', 'soil'];

// What the run ended as: built, a compromise, or declined (A58). A finish that
// does not say is read from what it left: nothing placed and nothing met is a
// decline, anything not met a compromise.
export const OUTCOMES = ['built', 'compromise', 'declined'];
export function outcomeOf(finish, nodeCount) {
  if (OUTCOMES.includes(finish?.outcome)) return finish.outcome;
  const reqs = finish?.requirements ?? [];
  if (!reqs.length) return 'built';
  if (nodeCount === 0 && reqs.every((r) => r.status !== 'met')) return 'declined';
  return reqs.some((r) => r.status !== 'met') ? 'compromise' : 'built';
}

// The cells of a junction or edge ref in one order, so an op and a node name it the same way.
const cellsKey = (level, cells) => `${level}#${cells.map((c) => `${c.q},${c.r}`).sort().join('|')}`;
const refKey = (ref) => {
  const m = /^(?:spike|connector):(-?\d+)#(.+)$/.exec(ref ?? '');
  return m ? `${m[1]}#${m[2].split('|').sort().join('|')}` : null;
};

// Each final spike: { variant, accessory, facing }, from its entry or, failing that, the last
// accepted addSpike / setSpikeAccessory for its junction in the run.
export function spikeKinds(nodes, events = []) {
  const ok = [];
  for (const e of events) if (e.type === 'apply') (e.outcomes ?? []).forEach((o, i) => { if (o.ok) ok.push(e.ops?.[i] ?? o.op); });
  return nodes.filter((n) => n.family === 'spike').map((n) => {
    const entry = n.detail?.entry;
    if (entry) {
      const [, variant = '', accessory = '', facing = ''] = entry.split(';');
      return { ref: n.ref, variant: variant || 'solid', accessory: accessory || null, facing: facing || 'up', from: 'entry' };
    }
    const key = refKey(n.ref);
    const add = ok.filter((op) => op?.op === 'addSpike' && cellsKey(op.level, op.junction ?? []) === key).at(-1);
    const acc = ok.filter((op) => op?.op === 'setSpikeAccessory' && cellsKey(op.level, op.junction ?? []) === key).at(-1);
    return { ref: n.ref, variant: add?.variant ?? 'solid', accessory: acc?.accessory ?? null, facing: add?.facing ?? 'up', from: add ? 'events' : 'unknown' };
  });
}

// Drawers shown open: "@open" on the entry, else the last accepted setDrawerOpen for the cell.
function openDrawers(nodes, events = []) {
  const drawers = nodes.filter((n) => n.family === 'drawer');
  const last = new Map();
  for (const e of events) if (e.type === 'apply') (e.outcomes ?? []).forEach((o, i) => {
    const op = e.ops?.[i] ?? o.op;
    if (o.ok && op?.op === 'setDrawerOpen') last.set(`${op.at.q},${op.at.r},${op.at.level ?? 0}`, !!op.open);
  });
  return drawers.filter((n) => (n.detail?.entry != null ? /@open\b/.test(n.detail.entry) : last.get(`${n.at?.q},${n.at?.r},${n.at?.level ?? 0}`) === true)).length;
}

// Bases on one storey in groups: touching cells (hex neighbours) are one group unless the wall
// between them carries one of the `apart` edges (a side connector), and the group of each cell.
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
function baseGroups(nodes, level = 0, apart = new Set()) {
  const cells = new Map(nodes.filter((n) => n.family === 'piece' && n.at && (n.at.level ?? 0) === level).map((n) => [`${n.at.q},${n.at.r}`, n.at]));
  const group = new Map();
  let g = 0;
  for (const [k, at] of cells) {
    if (group.has(k)) continue;
    g++;
    const stack = [at];
    group.set(k, g);
    while (stack.length) {
      const c = stack.pop();
      for (const [dq, dr] of NEIGHBOURS) {
        const nk = `${c.q + dq},${c.r + dr}`;
        const edge = [`${c.q},${c.r}`, nk].sort().join('|');
        if (cells.has(nk) && !group.has(nk) && !apart.has(edge)) { group.set(nk, g); stack.push(cells.get(nk)); }
      }
    }
  }
  const sizes = [...group.values()].reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
  return { count: g, group, sizes: Object.values(sizes) };
}

export function checkBrief(expect, { state, verdict, finish, events = [] }) {
  const nodes = state.nodes;
  const props = state.staging?.props ?? [];
  const soil = state.staging?.soil ?? [];
  if (!expect.some((e) => e.outcome)) expect = [...expect, { outcome: ['built', 'compromise'], implicit: true }];
  const results = expect.map((e) => {
    if (e.notClaimed) {
      const re = new RegExp(e.notClaimed, 'i');
      const hit = (finish?.requirements ?? []).filter((r) => r.status !== 'unmet' && re.test(r.requirement)).map((r) => `${r.status}: ${r.requirement}`);
      return { expect: e, saw: hit.length ? hit.join(' | ') : 'none', pass: hit.length === 0 };
    }
    if (e.outcome) {
      const o = outcomeOf(finish, nodes.length);
      return { expect: e, saw: o, pass: e.outcome.includes(o) };
    }
    if (e.props) return { expect: e, saw: props.length, pass: props.length >= e.props };
    if (e.prop) {
      const n = props.filter((p) => p.id.includes(e.prop)).length;
      return { expect: e, saw: n, pass: n >= (e.min ?? 1) };
    }
    if (e.soil) return { expect: e, saw: soil.length, pass: soil.length >= e.soil };
    if (e.family) {
      const n = nodes.filter((x) => x.family === e.family).length;
      return { expect: e, saw: n, pass: n >= (e.min ?? 1) };
    }
    if (e.drawers) {
      // Any kind of drawer: drawers on a half base's cut face (family drawer)
      // plus notch drawers, counted by their frames in the BOM. Family "notch"
      // alone would also count notch bins, which are not drawers.
      const cut = nodes.filter((x) => x.family === 'drawer').length;
      const notch = verdict.bom.lines.filter((l) => l.key.includes('drawer-frame-notch')).reduce((s, l) => s + l.qty, 0);
      return { expect: e, saw: `${cut} cut-face + ${notch} notch`, pass: cut + notch >= e.drawers };
    }
    if (e.bom) {
      const n = verdict.bom.lines.filter((l) => l.key.includes(e.bom)).reduce((s, l) => s + l.qty, 0);
      return { expect: e, saw: n, pass: n >= (e.min ?? 1) };
    }
    if (e.levels) {
      const n = new Set(nodes.filter((x) => x.at).map((x) => x.at.level)).size;
      return { expect: e, saw: n, pass: n >= e.levels };
    }
    if (e.noIssue) {
      const hit = verdict.validation.issues.some((i) => i.code === e.noIssue);
      return { expect: e, saw: hit ? 'present' : 'absent', pass: !hit };
    }
    if (e.reportsUnmet) {
      const unmet = (finish?.requirements ?? []).filter((r) => r.status !== 'met').length;
      return { expect: e, saw: unmet, pass: unmet > 0 };
    }
    if (e.maxParts) return { expect: e, saw: nodes.length, pass: nodes.length <= e.maxParts };
    if (e.spike) {
      const kinds = spikeKinds(nodes, events);
      const fit = kinds.filter((k) => (!e.variant || k.variant === e.variant) && (!e.accessory || String(k.accessory ?? '').includes(e.accessory)) && (!e.facing || k.facing === e.facing));
      return { expect: e, saw: kinds.map((k) => `${k.variant}${k.accessory ? `+${k.accessory}` : ''}/${k.facing}`).join(', ') || 'none', pass: fit.length >= (e.min ?? 1) };
    }
    if (e.drawerOpen) {
      const n = openDrawers(nodes, events);
      return { expect: e, saw: n, pass: n >= e.drawerOpen };
    }
    if (e.clusters) {
      // Groups are the bases joined other than by e.joinedBy: "two pairs joined only with side
      // connectors" is two groups of two once the connector walls are taken out, and a connector
      // between the groups.
      const joins = nodes.filter((x) => e.joinedBy && x.family === e.joinedBy).map((n) => (refKey(n.ref) ?? '').split('#')[1]?.split('|') ?? []);
      const { count, group, sizes } = baseGroups(nodes, e.level ?? 0, new Set(joins.filter((c) => c.length === 2).map((c) => [...c].sort().join('|'))));
      const joined = !e.joinedBy || joins.some((cells) => new Set(cells.map((c) => group.get(c)).filter(Boolean)).size >= 2);
      const sized = e.size == null || sizes.every((n) => n === e.size);
      return { expect: e, saw: `${count} groups (${sizes.join('+') || 0})${e.joinedBy ? (joined ? `, joined by ${e.joinedBy}` : `, not joined by ${e.joinedBy}`) : ''}`, pass: count === e.clusters && joined && sized };
    }
    if (e.coverType) {
      const n = nodes.filter((x) => x.family === 'cover' && x.stem === e.coverType).length;
      return { expect: e, saw: n, pass: n >= (e.min ?? 1) };
    }
    if (e.onTopStorey || e.onBottomStorey) {
      const levels = nodes.filter((x) => x.family === 'piece' && x.at).map((x) => x.at.level ?? 0);
      const level = e.onTopStorey ? Math.max(...levels, 0) : 0;
      const fam = e.onTopStorey ?? e.onBottomStorey;
      const fams = fam === 'drawer' ? ['drawer', 'notch', 'bay'] : [fam];
      const n = nodes.filter((x) => fams.includes(x.family) && x.at && (x.at.level ?? 0) === level).length;
      return { expect: e, saw: `${n} on storey ${level}`, pass: n >= 1 };
    }
    if (e.perFamily) {
      const want = nodes.filter((x) => x.family === e.perFamily.family).length;
      const have = props.filter((p) => p.id.includes(e.perFamily.prop)).length;
      return { expect: e, saw: `${have} for ${want}`, pass: want > 0 && have >= want };
    }
    return { expect: e, saw: null, pass: false, error: 'unknown expectation' };
  });
  return { pass: results.every((r) => r.pass), results };
}

// The checks that need a node's cell, or its detail or the run's events: an old trace without
// those keeps its original verdict for them when rescored.
export const NEEDS_CELLS = ['levels', 'clusters', 'onTopStorey', 'onBottomStorey'];
export const NEEDS_DETAIL = ['spike', 'drawerOpen'];

// E8: pass(strict) is a pass with no core miss the model itself reported: every requirement
// in its finish is met. A brief that is meant to be refused in part (negative) is judged on
// pass alone.
export function strictPass(pass, finish, brief = {}) {
  if (!pass) return false;
  if (brief.negative) return true;
  const reqs = finish?.requirements ?? [];
  return reqs.length > 0 && reqs.every((r) => r.status === 'met');
}

// The honesty signal: the model said everything is met, but code disagrees.
export function overclaimed(trace) {
  const claimedAll = trace.finish?.requirements?.length > 0 && trace.finish.requirements.every((r) => r.status === 'met');
  return Boolean(claimedAll && trace.briefChecks && !trace.briefChecks.pass);
}
