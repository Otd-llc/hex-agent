// The Modal window's validation checks over one suite (minimal-bin + three-storey),
// kept apart from bin/modal-window.mjs so they can be tested without a window.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEDICATED_WEIGHTS } from './hosted.mjs';

// Each check: { check, ok, gate } (gate false: reported only). validationPassed: every gated check ok.
export const validationPassed = (checks) => checks.filter((c) => c.gate !== false).every((c) => c.ok);

export function validationChecks(summaryPath, note) {
  if (!summaryPath) return [{ check: 'summary written', ok: false }];
  const dir = summaryPath.replace(/[\\/]summary\.json$/, '');
  const s = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const out = [];
  for (const id of ['minimal-bin', 'three-storey']) {
    const r = s.rows.find((x) => x.id === id);
    if (!r || r.error) {
      out.push({ check: `${id} ran`, ok: false, saw: r?.error ?? 'no row' });
      continue;
    }
    const t = JSON.parse(readFileSync(join(dir, r.trace), 'utf8'));
    const models = t.events.filter((e) => e.type === 'model');
    const errs = t.events.filter((e) => e.type === 'model_error');
    // three-storey's pass is reported, not gated: Muse misses it now and then on any host
    // (3/5-5/5 on Baseten). minimal-bin's pass gates.
    out.push({ check: `${id} passed`, ok: !!r.pass, gate: id === 'minimal-bin' });
    // A retried error the next call recovered from is the cold start, not a failure.
    out.push({ check: `${id} no unrecovered model error`, ok: !errs.some((e) => !e.retrying), saw: errs.length ? `${errs.length} errors, ${errs.filter((e) => e.retrying).length} retried` : 'none' });
    // The host's own answer must name the weights the endpoint was made with (any case), not just exist.
    const served = [...new Set(models.map((m) => m.servedBy))];
    const want = String(process.env.MODAL_DEDICATED_MODEL || DEDICATED_WEIGHTS).toLowerCase();
    const names = (x) => !!x && (String(x).toLowerCase() === want || String(x).toLowerCase().endsWith(want.split('/').pop()));
    out.push({ check: `${id} servedBy`, ok: models.length > 0 && models.every((m) => names(m.servedBy)), saw: served.join(',') || 'none', expected: want });
    out.push({ check: `${id} pageBuild = lane 1 live note`, ok: !!note && t.pageBuild === note.pageBuild, saw: t.pageBuild, expected: note?.pageBuild ?? null, vizCommit: note?.viz ?? null });
    if (id === 'three-storey') {
      const withTry = t.events.filter((e) => e.type === 'apply').flatMap((e) => e.outcomes).filter((o) => !o.ok && (o.details?.tryInstead ?? o.tryInstead));
      // Reported, not gated: Muse meets a refusal with a tryInstead in about 7 of 25 three-storey runs.
      out.push({ check: 'three-storey refusal with tryInstead', ok: withTry.length > 0, gate: false, saw: withTry.map((o) => o.code).join(',') || 'none' });
    }
  }
  return out;
}


// Tiny requests until one is a fast 200. A client error is final (waiting does not fix a bad
// token, host or model name); anything else is taken as the cold start, until maxMinutes.
const FINAL = new Set([400, 401, 403, 404]);
export async function warmup(probe, { maxMinutes, fastMs, everyMs, headroom, log = () => {}, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() }) {
  const until = now() + maxMinutes * 60_000;
  const tries = [];
  while (now() < until) {
    if (!(headroom() > 0)) return { ok: false, tries, why: 'headroom gone during warm-up' };
    const p = await probe();
    tries.push(p);
    log(p, tries.length);
    if (p.ok && p.ms <= fastMs) return { ok: true, tries };
    if (FINAL.has(p.status)) return { ok: false, tries, why: `HTTP ${p.status}: ${p.body ?? ''} (final: check the token, the host and the model name)` };
    await sleep(everyMs);
  }
  return { ok: false, tries, why: `no fast 200 in ${maxMinutes} min` };
}

// A suite line that is a harness failure (the browser or page, not the model). A segment stops at
// `limit` of them: the endpoint bills while browsers hang, and their runs score nothing.
export const HARNESS_TRIP_LIMIT = 3;
export const isHarnessFailure = (line) => /harness error|page[.]goto: Timeout|hexAPI settle did not answer/.test(line) && /^FAIL /.test(line);

// Free memory for the browsers a segment opens: each configurator page takes ~0.6 GB.
export const GB_PER_BROWSER = 0.6;
export function memoryOk(freeBytes, concurrency, perGb = GB_PER_BROWSER) {
  const freeGb = Math.round((freeBytes / 2 ** 30) * 10) / 10;
  const needGb = Math.round(concurrency * perGb * 10) / 10;
  return { ok: freeGb >= needGb, freeGb, needGb };
}
