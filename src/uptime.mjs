// Uptime ledger for a Modal Dedicated Endpoint: it bills GPU seconds while it is
// up, idle or busy, cold start included, so the spend is the sum of its up
// windows at the GPU rate, not the tokens the runs used. bin/modal-session.mjs
// records each window's start and stop; a run is refused when the open window,
// carried to the end of the longest run, would cross the credit less the reserve.
// The token cost of each model call is kept as info only (kind "call").
// The provider's billing page is the source of truth; reconcile against it.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ledgerPath, PURPOSES } from './ledger.mjs';

// Modal list price per B300 GPU second (owner, 2026-11-01), 4 GPUs for Muse Spark Open NVFP4.
export const B300_USD_PER_S = 0.001972;
export const DEDICATED_GPUS = 4;

export function openUptimeLedger({
  path = process.env.MODAL_UPTIME_LEDGER || '.spend/modal-dedicated.jsonl',
  creditUsd,
  reserveUsd = 0,
  // The longest a run may still take once started: a run is refused unless the window can cover it.
  runMaxS = Number(process.env.MODAL_RUN_MAX_S ?? 600),
  now = () => Date.now(),
} = {}) {
  if (!(creditUsd > 0)) throw new Error('uptime ledger needs creditUsd');
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
      if (e.kind === 'start') out.push({ start: Date.parse(e.upAt ?? e.at), stop: null, usdPerS: e.usdPerS, host: e.host, maxReplicas: e.maxReplicas ?? 1 });
      else if (e.kind === 'stop' && out.length && out.at(-1).stop == null) out.at(-1).stop = Date.parse(e.downAt ?? e.at);
    }
    return out;
  }
  const cost = (w, t = now()) => Math.max(0, ((w.stop ?? t) - w.start) / 1000) * w.usdPerS;
  const open = () => windows().find((w) => w.stop == null) ?? null;
  const spent = () => windows().reduce((s, w) => s + cost(w), 0);
  const cap = creditUsd - reserveUsd;

  return {
    path,
    creditUsd,
    reserveUsd,
    kind: 'uptime',
    windows,
    open,
    spent,
    // A model call: its token cost is info, the window already counts the time.
    add(entry) {
      const { costUsd, ...rest } = entry;
      add({ kind: 'call', ...rest, tokenCostUsd: costUsd ?? null });
    },
    // maxReplicas is the endpoint's own setting: each replica bills its GPUs, and the plan
    // allows one, so any other number is refused rather than priced.
    start({ host, gpus = DEDICATED_GPUS, usdPerGpuS = B300_USD_PER_S, maxReplicas, upAt = null, configShot = null } = {}) {
      if (!host) throw new Error('start needs the endpoint host');
      if (maxReplicas !== 1) throw new Error(`max replicas must be 1 (the endpoint setting), got ${maxReplicas}`);
      if (upAt != null && !hasZone(upAt)) throw new Error(`up-at ${upAt} has no timezone: give Z or +hh:mm`);
      if (open()) throw new Error(`a window is already open (since ${new Date(open().start).toISOString()}): stop it first`);
      const usdPerS = gpus * usdPerGpuS * maxReplicas;
      add({ kind: 'start', host, gpus, usdPerGpuS, maxReplicas, usdPerS, ...(upAt ? { upAt: new Date(upAt).toISOString() } : {}), ...(configShot ? { configShot } : {}) });
      return this.summary();
    },
    // After the endpoint is gone: what Modal's usage page billed, beside what the windows priced.
    reconcile({ billedUsd, source }) {
      if (open()) throw new Error('a window is still open: stop it before reconciling');
      if (!(billedUsd >= 0)) throw new Error('reconcile needs billedUsd (from the Modal usage page)');
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
    // Dollars left for a run of this purpose. No open window: nothing (the endpoint is not up,
    // or its start was not recorded). Otherwise the cap less what the windows cost so far and
    // what the open one will cost if a run started now takes the longest.
    headroom(purpose) {
      const w = open();
      if (!w) return 0;
      const left = (purpose === 'demo' ? creditUsd : cap) - spent();
      return left - runMaxS * w.usdPerS;
    },
    summary() {
      const w = open();
      const s = spent();
      return {
        creditUsd, reserveUsd, spentUsd: round(s), leftUsd: round(creditUsd - s),
        up: w ? { since: new Date(w.start).toISOString(), usdPerS: w.usdPerS, usdPerHour: round(w.usdPerS * 3600), minutesToCap: round(Math.max(0, cap - s) / w.usdPerS / 60) } : null,
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
