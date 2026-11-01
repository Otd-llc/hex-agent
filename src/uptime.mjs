// Uptime ledger for a Modal Dedicated Endpoint: it bills GPU seconds while it is
// up, idle or busy, cold start included, so the spend is the sum of its up
// windows at the GPU rate, not the tokens the runs used. bin/modal-session.mjs
// records each window's start and stop; the token cost of each model call is
// kept as info only (kind "call"). The provider's billing page is the source of
// truth; reconcile against it.
//
// No new work starts once the window, carried through the longest run, the idle
// time before the endpoint scales down (fixed at 15 min) and the lag to delete
// it, would cross the credit less the reserve. The credit ceiling and reserve
// floor are fixed here: a setting may tighten them, never loosen them.
//
// A window's runs are allowed only as segments: the validation (fixed spec), and
// then only after a passing validation in the same window, a segment the owner
// approved with its exact spec. Both are written here and checked by modelFor.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ledgerPath, PURPOSES } from './ledger.mjs';

// Modal list price per B300 GPU second (owner, 2026-11-01), 4 GPUs for Muse Spark Open NVFP4.
export const B300_USD_PER_S = 0.001972;
export const DEDICATED_GPUS = 4;
// The Modal credit ($100 hackathon + $30 account) and the floor kept unspent.
export const CREDIT_CEILING_USD = 130;
export const RESERVE_FLOOR_USD = 5;
// The endpoint's idle timeout (owner: 15 min) and the time to delete it after the last run.
export const IDLE_S = 15 * 60;
export const DELETE_LAG_S = 5 * 60;
export const RUN_MAX_S = { min: 60, max: 1800, dflt: 600 };

// The validation segment's spec: modal-window runs exactly this.
export const VALIDATE_SPEC = { sets: ['briefs-wide', 'briefs-hard'], only: ['minimal-bin', 'three-storey'], repeat: 1, concurrency: 2, maxMinutes: null, effort: 'low' };

// A segment spec in one form, so the same segment always hashes the same.
export function canonSpec({ sets, only = null, repeat, concurrency, maxMinutes = null, effort }) {
  const spec = {
    sets: [...sets].map(String).sort(),
    only: only == null ? null : [...(Array.isArray(only) ? only : String(only).split(','))].map((s) => s.trim()).filter(Boolean).sort(),
    repeat: Number(repeat),
    concurrency: Number(concurrency),
    maxMinutes: maxMinutes == null ? null : Number(maxMinutes),
    effort: String(effort),
  };
  if (!spec.sets.length) throw new Error('a segment names at least one brief set');
  for (const k of ['repeat', 'concurrency']) if (!Number.isInteger(spec[k]) || spec[k] < 1 || spec[k] > 20) throw new Error(`segment ${k} must be a whole number 1-20`);
  if (spec.maxMinutes != null && !(Number.isFinite(spec.maxMinutes) && spec.maxMinutes > 0 && spec.maxMinutes <= 240)) throw new Error('segment maxMinutes must be 1-240');
  return spec;
}
export const specSha = (spec) => createHash('sha256').update(JSON.stringify(canonSpec(spec))).digest('hex').slice(0, 16);

const finite = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${v}`);
  return n;
};

export function openUptimeLedger({
  path = process.env.MODAL_UPTIME_LEDGER || '.spend/modal-dedicated.jsonl',
  creditUsd,
  reserveUsd = RESERVE_FLOOR_USD,
  // The longest a run may still take once started.
  runMaxS = process.env.MODAL_RUN_MAX_S ?? RUN_MAX_S.dflt,
  now = () => Date.now(),
} = {}) {
  creditUsd = finite(creditUsd, 'creditUsd');
  reserveUsd = finite(reserveUsd, 'reserveUsd');
  runMaxS = finite(runMaxS, 'runMaxS');
  if (!(creditUsd > 0)) throw new Error('creditUsd must be above 0');
  if (creditUsd > CREDIT_CEILING_USD) throw new Error(`creditUsd ${creditUsd} is above the Modal credit ($${CREDIT_CEILING_USD}): refused`);
  if (reserveUsd < RESERVE_FLOOR_USD) throw new Error(`reserveUsd ${reserveUsd} is below the floor ($${RESERVE_FLOOR_USD}): refused`);
  if (reserveUsd >= creditUsd) throw new Error('reserveUsd must be below creditUsd');
  if (!(runMaxS >= RUN_MAX_S.min && runMaxS <= RUN_MAX_S.max)) throw new Error(`runMaxS must be ${RUN_MAX_S.min}-${RUN_MAX_S.max} s`);
  path = ledgerPath(path);
  const read = () => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const add = (entry) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify({ at: new Date(now()).toISOString(), ...entry }) + '\n');
  };

  // Up windows in order: each start, its stop (or none while it is up).
  function windows(entries = read()) {
    const out = [];
    for (const e of entries) {
      if (e.kind === 'start') out.push({ start: Date.parse(e.upAt ?? e.at), stop: null, usdPerS: e.usdPerS, host: e.host, maxReplicas: e.maxReplicas, idleS: e.idleS, id: e.windowId });
      else if (e.kind === 'stop' && out.length && out.at(-1).stop == null) out.at(-1).stop = Date.parse(e.downAt ?? e.at);
    }
    return out;
  }
  const cost = (w, t = now()) => Math.max(0, ((w.stop ?? t) - w.start) / 1000) * w.usdPerS;
  const open = () => windows().find((w) => w.stop == null) ?? null;
  const spent = () => windows().reduce((s, w) => s + cost(w), 0);
  const cap = creditUsd - reserveUsd;
  // What the open window still costs after the last run starts: that run, the idle tail, the delete.
  const tailS = runMaxS + IDLE_S + DELETE_LAG_S;
  const inWindow = (w, kind) => read().filter((e) => e.kind === kind && e.windowId === w.id);

  return {
    path,
    creditUsd,
    reserveUsd,
    kind: 'uptime',
    windows,
    open,
    spent,
    tailS,
    runMaxS,
    // A model call: its token cost is info, the window already counts the time.
    add(entry) {
      const { costUsd, ...rest } = entry;
      add({ kind: 'call', ...rest, tokenCostUsd: costUsd ?? null });
    },
    // maxReplicas and idleMin are the endpoint's own settings: each replica bills its GPUs and
    // the idle tail bills after the last request, so only the plan's values (1, 15) are accepted.
    start({ host, gpus = DEDICATED_GPUS, maxReplicas, idleMin, upAt = null, configShot = null } = {}) {
      if (!host) throw new Error('start needs the endpoint host');
      if (finite(gpus, 'gpus') !== DEDICATED_GPUS) throw new Error(`gpus must be ${DEDICATED_GPUS} (4x B300), got ${gpus}`);
      if (maxReplicas !== 1) throw new Error(`max replicas must be 1 (the endpoint setting), got ${maxReplicas}`);
      if (idleMin !== IDLE_S / 60) throw new Error(`the idle timeout must be ${IDLE_S / 60} min (the endpoint setting), got ${idleMin}`);
      if (upAt != null && !hasZone(upAt)) throw new Error(`up-at ${upAt} has no timezone: give Z or +hh:mm`);
      if (open()) throw new Error(`a window is already open (since ${new Date(open().start).toISOString()}): stop it first`);
      const usdPerS = gpus * B300_USD_PER_S * maxReplicas;
      const windowId = `w${windows().length + 1}-${now()}`;
      add({ kind: 'start', windowId, host, gpus, usdPerGpuS: B300_USD_PER_S, maxReplicas, idleS: IDLE_S, usdPerS, ...(upAt ? { upAt: new Date(upAt).toISOString() } : {}), ...(configShot ? { configShot } : {}) });
      return this.summary();
    },
    // After the endpoint is gone: what Modal's usage page billed, beside what the windows priced.
    reconcile({ billedUsd, source }) {
      if (open()) throw new Error('a window is still open: stop it before reconciling');
      if (!(Number.isFinite(billedUsd) && billedUsd >= 0)) throw new Error('reconcile needs billedUsd (from the Modal usage page)');
      if (!source) throw new Error('reconcile needs a source (where the billed figure was read)');
      add({ kind: 'reconcile', billedUsd, ledgerUsd: round(spent()), diffUsd: round(billedUsd - spent()), source });
      return this.summary();
    },
    stop({ downAt = null } = {}) {
      if (!open()) throw new Error('no window is open');
      if (downAt != null && !hasZone(downAt)) throw new Error(`down-at ${downAt} has no timezone: give Z or +hh:mm`);
      if (downAt != null) downAt = new Date(downAt).toISOString();
      add({ kind: 'stop', ...(downAt ? { downAt } : {}) });
      return this.summary();
    },
    // The validation's outcome in the open window (modal-window writes it).
    recordValidation({ passed, summary = null }) {
      const w = open();
      if (!w) throw new Error('no window is open');
      add({ kind: 'validation', windowId: w.id, host: w.host, passed: passed === true, summary });
    },
    // The owner's OK for one segment, with its exact spec, in the open window.
    approve({ segment, spec, approvedBy }) {
      const w = open();
      if (!w) throw new Error('no window is open: approvals belong to one window');
      if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(segment ?? '')) || segment === 'validate') throw new Error('segment must be a short name (not "validate")');
      if (!approvedBy) throw new Error('approve needs approvedBy (who gave the OK, and where)');
      const c = canonSpec(spec);
      add({ kind: 'approval', windowId: w.id, host: w.host, segment, spec: c, specSha: specSha(c), approvedBy });
      return { segment, specSha: specSha(c), spec: c };
    },
    approval(segment) {
      const w = open();
      return w ? inWindow(w, 'approval').filter((e) => e.segment === segment).at(-1) ?? null : null;
    },
    // Throws unless a run of this segment, with this spec, may start on this host now.
    authorize({ host, segment, spec }) {
      const w = open();
      if (!w) throw new Error('no Modal up window is open: record it with node bin/modal-session.mjs start');
      if (w.host !== host) throw new Error('the open up window is pinned to another host: refused');
      if (!segment) throw new Error('a Modal Dedicated run belongs to a segment (MODAL_SEGMENT): run it through bin/modal-window.mjs');
      const sha = specSha(spec);
      if (segment === 'validate') {
        if (sha !== specSha(VALIDATE_SPEC)) throw new Error('the validate segment runs only its fixed spec');
        return;
      }
      const v = inWindow(w, 'validation').at(-1);
      if (!v?.passed) throw new Error('no passing validation in this window: run --step=validate first');
      const a = inWindow(w, 'approval').filter((e) => e.segment === segment).at(-1);
      if (!a) throw new Error(`segment ${segment} is not approved in this window`);
      if (a.specSha !== sha) throw new Error(`segment ${segment} was approved with another spec (${a.specSha}, this is ${sha})`);
    },
    // Dollars left for new work: none without an open window; else the cap less what the
    // windows cost so far and the tail the open one bills once the last run starts.
    // inRun: asked between turns of a run already going, whose length the start check already
    // reserved: only the idle tail and the delete are held back, so a started run is not cut short.
    headroom(purpose, { inRun = false } = {}) {
      const w = open();
      if (!w) return 0;
      return cap - spent() - (inRun ? IDLE_S + DELETE_LAG_S : tailS) * w.usdPerS;
    },
    summary() {
      const w = open();
      const s = spent();
      return {
        creditUsd, reserveUsd, spentUsd: round(s), leftUsd: round(creditUsd - s),
        up: w ? { since: new Date(w.start).toISOString(), usdPerS: w.usdPerS, usdPerHour: round(w.usdPerS * 3600), tailUsd: round(tailS * w.usdPerS), minutesToStop: round(Math.max(0, cap - s - tailS * w.usdPerS) / w.usdPerS / 60) } : null,
        windows: windows().length,
        reconciled: read().filter((e) => e.kind === 'reconcile').map(({ at, billedUsd, ledgerUsd, diffUsd, source }) => ({ at, billedUsd, ledgerUsd, diffUsd, source })),
        byPurpose: Object.fromEntries(PURPOSES.map((p) => [p, null])),
      };
    },
  };
}

const round = (x) => Math.round(x * 10000) / 10000;
// An ISO time that names its zone (Z or an offset), so a back-dated window is not read in local time.
export const hasZone = (v) => /(Z|[+-][0-9]{2}:?[0-9]{2})$/i.test(String(v)) && !Number.isNaN(Date.parse(v));
