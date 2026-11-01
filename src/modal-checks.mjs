// The Modal window's validation checks over one suite (minimal-bin + three-storey),
// kept apart from bin/modal-window.mjs so they can be tested without a window.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEDICATED_WEIGHTS } from './hosted.mjs';

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
    out.push({ check: `${id} passed`, ok: !!r.pass });
    // A retried error the next call recovered from is the cold start, not a failure.
    out.push({ check: `${id} no unrecovered model error`, ok: !errs.some((e) => !e.retrying), saw: errs.length ? `${errs.length} errors, ${errs.filter((e) => e.retrying).length} retried` : 'none' });
    out.push({ check: `${id} servedBy`, ok: models.length > 0 && models.every((m) => m.servedBy), saw: [...new Set(models.map((m) => m.servedBy))].join(',') || 'none', expected: DEDICATED_WEIGHTS });
    out.push({ check: `${id} pageBuild = lane 1 live note`, ok: !!note && t.pageBuild === note.pageBuild, saw: t.pageBuild, expected: note?.pageBuild ?? null, vizCommit: note?.viz ?? null });
    if (id === 'three-storey') {
      const withTry = t.events.filter((e) => e.type === 'apply').flatMap((e) => e.outcomes).filter((o) => !o.ok && (o.details?.tryInstead ?? o.tryInstead));
      out.push({ check: 'three-storey refusal with tryInstead', ok: withTry.length > 0, saw: withTry.map((o) => o.code).join(',') || 'none' });
    }
  }
  return out;
}

