// Spend ledger: every model call is appended to a local JSONL file, priced
// from the published rates, so the credit balance is known across runs.
// A reserve is held back for judging: dev and eval runs may not touch it.
// The provider's billing page is the source of truth; reconcile against it.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PURPOSES = ['dev', 'eval', 'demo'];

// The repo root, from this file and not the working directory: a run started
// anywhere else reads the same ledger, so it can never see a fresh cap.
export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const ledgerPath = (p) => (isAbsolute(p) ? p : resolve(ROOT, p));

export function openLedger({
  path = process.env.SPEND_LEDGER || '.spend/meta.jsonl',
  creditUsd = Number(process.env.SPEND_CREDIT_USD ?? 150),
  reserveUsd = Number(process.env.SPEND_RESERVE_USD ?? 50),
  caps = {
    dev: Number(process.env.SPEND_CAP_DEV_USD ?? 45),
    eval: Number(process.env.SPEND_CAP_EVAL_USD ?? 40),
  },
} = {}) {
  path = ledgerPath(path);
  const read = () =>
    existsSync(path)
      ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];

  const spent = (purpose) =>
    read()
      .filter((e) => !purpose || e.purpose === purpose)
      .reduce((s, e) => s + (e.costUsd ?? 0), 0);

  return {
    path,
    creditUsd,
    reserveUsd,
    caps,
    spent,
    add(entry) {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
    },
    // Dollars this purpose may still spend. Demo may use the reserve; nothing else may.
    headroom(purpose) {
      const total = spent();
      const left = creditUsd - total;
      if (purpose === 'demo') return left;
      const cap = caps[purpose] ?? 0;
      return Math.min(cap - spent(purpose), left - reserveUsd);
    },
    summary() {
      const by = Object.fromEntries(PURPOSES.map((p) => [p, round(spent(p))]));
      return { creditUsd, reserveUsd, spentUsd: round(spent()), byPurpose: by, caps };
    },
  };
}

const round = (x) => Math.round(x * 10000) / 10000;
