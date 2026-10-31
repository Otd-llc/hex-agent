// A50: a build planned as a role graph, compiled to ops. The plan names the
// site (which side the user is on, which side the wall), zones (work_clear is
// an explicit void; store and display hold things), and roles: what each
// object is for, what it needs, and how it relates to other roles. Binding
// turns each role into a concrete offer through an injected lookup (the
// configurator, or a fake in tests); every op carries its role; a refusal
// rebinds that one role and leaves every other binding as it was.
//
// Nothing here talks to the page. planLookup() is the thin glue onto the agent's
// tools, so the core follows the contract the tools are synced to.

export const ZONE_KINDS = ['work_clear', 'store', 'display'];
export const PART_RELATIONS = ['on', 'above', 'beside'];
export const PROP_RELATIONS = ['on', 'in'];
// The six axial neighbour steps: a side is one of them, in the plan's own frame.
export const SIDES = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const LIMITS = { roles: 16, count: 12, triesPerObject: 4 };

// Problems with a plan, as messages; empty when it can be bound.
export function checkPlan(plan, { families = null } = {}) {
  const errs = [];
  if (!plan || typeof plan !== 'object') return ['plan must be an object'];
  const { site = {}, zones = [], roles } = plan;
  for (const k of ['userSide', 'wallSide']) {
    if (site[k] != null && !isSide(site[k])) errs.push(`site.${k} must be an axial neighbour step such as {"q":0,"r":1}`);
  }
  const zoneIds = new Set();
  for (const z of zones) {
    if (!z?.id || zoneIds.has(z.id)) errs.push(`zone ids must be present and unique (${z?.id})`);
    zoneIds.add(z?.id);
    if (!ZONE_KINDS.includes(z?.kind)) errs.push(`zone ${z?.id}: kind must be one of ${ZONE_KINDS.join(', ')}`);
    const by = ['cells', 'side'].filter((k) => z?.[k] != null);
    if (by.length !== 1) errs.push(`zone ${z?.id}: give cells or side, one of them`);
    if (z?.side != null && !['user', 'wall'].includes(z.side)) errs.push(`zone ${z.id}: side is user or wall`);
    if (z?.side != null && !site[`${z.side}Side`]) errs.push(`zone ${z.id}: side ${z.side} needs site.${z.side}Side`);
  }
  if (!Array.isArray(roles) || !roles.length || roles.length > LIMITS.roles) return [...errs, `roles must be 1 to ${LIMITS.roles} items`];
  const seen = new Map();
  for (const r of roles) {
    const at = `role ${r?.id}`;
    if (!r?.id || seen.has(r.id)) errs.push(`role ids must be present and unique (${r?.id})`);
    const need = r?.need ?? {};
    const isProp = 'prop' in need, isPart = 'family' in need;
    if (isProp === isPart) errs.push(`${at}: need names a family (a part) or a prop, one of them`);
    if (isPart && families && !families.includes(need.family)) errs.push(`${at}: family ${need.family} is not placeable: ${families.join(', ')}`);
    const n = r?.count ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > LIMITS.count) errs.push(`${at}: count is 1 to ${LIMITS.count}`);
    if (r?.zone != null) {
      if (!zoneIds.has(r.zone)) errs.push(`${at}: no zone ${r.zone}`);
      else if (zones.find((z) => z.id === r.zone).kind === 'work_clear') errs.push(`${at}: work_clear is a void, nothing binds in it`);
    }
    const allowed = isProp ? PROP_RELATIONS : PART_RELATIONS;
    for (const rel of r?.relations ?? []) {
      if (!allowed.includes(rel?.rel)) errs.push(`${at}: relation ${rel?.rel} is not one of ${allowed.join(', ')}`);
      else if (!seen.has(rel.of)) errs.push(`${at}: ${rel.rel} ${rel.of} must name a role listed before it`);
      else if (seen.get(rel.of).isProp) errs.push(`${at}: ${rel.rel} ${rel.of} names a prop; relate to a part role`);
    }
    if (isProp && !(r?.relations ?? []).length) errs.push(`${at}: a prop role needs on or in a part role`);
    if (r?.id) seen.set(r.id, { isProp });
  }
  return errs;
}

const isSide = (s) => SIDES.some(([q, r]) => s?.q === q && s?.r === r);
const cube = (c) => [c.q, c.r, -c.q - c.r];
const dist = (a, b) => {
  const [x, y, z] = cube(a), [u, v, w] = cube(b);
  return (Math.abs(x - u) + Math.abs(y - v) + Math.abs(z - w)) / 2;
};
// How far a cell sits toward a side from the anchor, in cell steps (cube dot / 2).
const toward = (cell, side, anchor = { q: 0, r: 0 }) => {
  const c = cube({ q: cell.q - anchor.q, r: cell.r - anchor.r }), d = cube(side);
  return (c[0] * d[0] + c[1] * d[1] + c[2] * d[2]) / 2;
};

export function inZone(cell, zone, site = {}) {
  if (!cell) return false;
  if (zone.cells) return zone.cells.some((c) => c.q === cell.q && c.r === cell.r);
  const side = site[`${zone.side}Side`];
  const t = toward(cell, side, site.anchor);
  return t > 0 && (zone.depth == null || t <= zone.depth);
}

// A part candidate's fit to its role: null when it may not bind, else a rank (lower is better).
function partRank(cand, role, plan, placed) {
  const zones = plan.zones ?? [];
  const cell = cand.cell;
  if (cell && zones.some((z) => z.kind === 'work_clear' && inZone(cell, z, plan.site))) return null;
  if (role.zone && !inZone(cell, zones.find((z) => z.id === role.zone), plan.site)) return null;
  for (const rel of role.relations ?? []) {
    const under = (placed.get(rel.of) ?? []).map((b) => b.cell).filter(Boolean);
    if (!cell || !under.length) return null;
    const ok = {
      on: (u) => u.q === cell.q && u.r === cell.r && (cell.level ?? 0) >= (u.level ?? 0),
      above: (u) => u.q === cell.q && u.r === cell.r && (cell.level ?? 0) > (u.level ?? 0),
      beside: (u) => dist(u, cell) === 1 && (cell.level ?? 0) === (u.level ?? 0),
    }[rel.rel];
    if (!under.some(ok)) return null;
  }
  // Toward the wall first, so the user's side stays open; then the offer's own order.
  return plan.site?.wallSide && cell ? -toward(cell, plan.site.wallSide, plan.site.anchor) : 0;
}

// A prop role's surfaces: those of the parts its relations name, 'in' preferring floors and compartments.
async function propCandidates(role, lookup, placed) {
  const out = [];
  for (const rel of role.relations) {
    for (const b of placed.get(rel.of) ?? []) {
      for (const ref of b.refs) {
        const surfaces = await lookup.surfaces({ ref, prop: role.need.prop });
        for (const s of surfaces) {
          const inside = /floor|compartment/.test(s.kind ?? '');
          if (rel.rel === 'in' && !inside) continue;
          out.push({ ...s, rank: rel.rel === 'on' && inside ? 1 : 0 });
        }
      }
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

// The apply item for a candidate: the offer itself, tagged with its role.
const itemFor = (role, cand) => ({ ...cand.use, ...(role.serves ? { role: role.serves } : {}) });

// Bind and place every role in order. lookup: { sockets(need), surfaces({ref, prop}), apply(items) -> outcomes }.
// Returns the bindings (role -> objects placed), the roles left short, and a log of each try.
export async function runPlan(plan, lookup, { families = null } = {}) {
  const errs = checkPlan(plan, { families });
  if (errs.length) return { ok: false, errors: errs };
  const state = { plan, placed: new Map(), excluded: new Map(), short: [], log: [] };
  for (const role of plan.roles) await bindRole(state, role, lookup, role.count ?? 1);
  return report(state);
}

async function bindRole(state, role, lookup, want) {
  const { plan, placed, excluded, log } = state;
  const isProp = 'prop' in role.need;
  const bad = excluded.get(role.id) ?? new Set();
  excluded.set(role.id, bad);
  const have = placed.get(role.id) ?? [];
  placed.set(role.id, have);
  let tries = 0;
  while (have.length < want && tries < want * LIMITS.triesPerObject) {
    tries++;
    // Fresh offers each time: the last placement may have used or opened sockets.
    const cands = isProp
      ? await propCandidates(role, lookup, placed)
      : (await lookup.sockets(role.need))
          .map((c) => ({ ...c, rank: partRank(c, role, plan, placed) }))
          .filter((c) => c.rank != null)
          .sort((a, b) => a.rank - b.rank);
    const cand = cands.find((c) => !bad.has(c.key) && !have.some((h) => h.key === c.key));
    if (!cand) {
      state.short = state.short.filter((s) => s.role !== role.id);
      state.short.push({ role: role.id, placed: have.length, want, why: cands.length ? 'every offer was refused' : 'no offer fits the role' });
      return;
    }
    const item = itemFor(role, cand);
    const [o] = await lookup.apply([item]);
    log.push({ role: role.id, key: cand.key, item, ok: !!o?.ok, ...(o?.ok ? {} : { code: o?.code ?? 'ERROR' }) });
    if (o?.ok) have.push({ key: cand.key, cell: cand.cell ?? null, refs: o.added ?? [] });
    else bad.add(cand.key);
  }
  state.short = state.short.filter((s) => s.role !== role.id);
  if (have.length < want) state.short.push({ role: role.id, placed: have.length, want, why: 'out of tries' });
}

function report(state) {
  const bindings = Object.fromEntries([...state.placed].map(([id, bs]) => [id, bs.map((b) => ({ key: b.key, refs: b.refs, ...(b.cell ? { cell: b.cell } : {}) }))]));
  return { ok: !state.short.length, bindings, short: state.short, log: state.log, state };
}

// Repair: take one role's objects off and bind it again, every other binding
// kept. A role something else stands on or in is not rebound: rebind those first.
export async function rebind(result, roleId, lookup, { remove = removeOps, reason = null } = {}) {
  const { state } = result;
  const role = state.plan.roles.find((r) => r.id === roleId);
  if (!role) throw new Error(`no role ${roleId}`);
  const carried = state.plan.roles.filter((r) => (r.relations ?? []).some((x) => x.of === roleId) && (state.placed.get(r.id) ?? []).length);
  if (carried.length) throw new Error(`role ${roleId} carries ${carried.map((r) => r.id).join(', ')}: rebind those first`);
  const old = state.placed.get(roleId) ?? [];
  const isProp = 'prop' in role.need;
  const refs = old.flatMap((b) => b.refs);
  if (refs.length) {
    const outs = await lookup.apply(remove(refs, isProp));
    if (outs.some((o) => !o.ok)) throw new Error(`could not take ${roleId} off: ${outs.find((o) => !o.ok).code}`);
  }
  for (const b of old) state.excluded.get(roleId).add(b.key);
  state.placed.set(roleId, []);
  state.log.push({ role: roleId, rebind: true, ...(reason ? { reason } : {}), removed: refs });
  await bindRole(state, role, lookup, role.count ?? 1);
  return report(state);
}

// The ops that take objects off: removeProp for a prop, remove for a part.
export const removeOps = (refs, isProp) => refs.map((ref) => (isProp ? { op: 'removeProp', ref } : { op: 'remove', ref }));

// Glue onto the agent's tools (createTools().run): offers from find_sockets,
// surfaces from find_surfaces, changes through apply, so every check the tools
// make (op shapes, refs, roles, budgets) holds for a plan too.
export function planLookup(run) {
  const call = async (name, args) => {
    const r = await run(name, args);
    if (r?.error) throw new Error(`${name}: ${r.error}`);
    return r;
  };
  return {
    async sockets(need) {
      const { family, variant, stem, level, face, type } = need;
      const query = Object.fromEntries(Object.entries({ family, variant, stem, level, face, type }).filter(([, v]) => v != null));
      const r = await call('find_sockets', query);
      return r.sockets.map((s) => ({ key: JSON.stringify(s.op), cell: s.op.at ?? null, use: { socket: s.socket } }));
    },
    async surfaces({ ref, prop }) {
      const r = await call('find_surfaces', { ref, fits: prop });
      return r.surfaces.map((s) => ({
        key: `${ref}|${s.label}|${s.centreMm.join(',')}`,
        kind: s.kind,
        use: { op: 'addProp', id: prop, surface: s.surface },
      }));
    },
    async apply(items) {
      const r = await run('apply', { ops: items, atomic: false });
      if (r.error) return items.map(() => ({ ok: false, code: 'TOOL_ERROR', message: r.error }));
      return r.outcomes;
    },
  };
}
