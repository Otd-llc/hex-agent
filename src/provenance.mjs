// Where a run came from, for its trace: this repo's commit and whether the tree
// had local changes, and which viz commit the live site was announced at. The
// page carries only its hashed entry script (pageBuild), and catalog-only
// deploys keep it, so the viz commit comes from lane 1's latest "live" note, and
// the trace says whether that note names the same pageBuild the run loaded.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { ROOT } from './ledger.mjs';

export const NOTES = process.env.LANE1_NOTES || 'C:/zzz/_premades/lane1-notes.jsonl';

let agent = null;
export function agentCommit() {
  if (agent) return agent;
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    // Untracked files (run output) do not count: only changes to tracked files make a run's code differ.
    agent = { commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--untracked-files=no') !== '' };
  } catch {
    agent = { commit: null, dirty: null };
  }
  return agent;
}

// The newest "live" note: { viz, at, pageBuild, contract } or null.
export function liveNote(path = NOTES) {
  if (!existsSync(path)) return null;
  const notes = readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
  const n = notes.filter((x) => x.kind === 'live').at(-1);
  return n ? { viz: n.viz ?? null, at: n.at ?? null, pageBuild: n.pageBuild ?? null, contract: n.contract ?? null } : null;
}

export function vizCommit(pageBuild, path = NOTES) {
  const n = liveNote(path);
  if (!n) return { commit: null, source: 'no live note' };
  return { commit: n.viz, source: `lane 1 live note ${n.at}`, notePageBuild: n.pageBuild, pageBuildMatches: !!pageBuild && n.pageBuild === pageBuild };
}
