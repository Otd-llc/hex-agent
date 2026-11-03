# Addendum protocol, 2026-11-03: tool-layer fixes on a fresh held-out set

Written and committed before either arm runs on the fresh set. Results go in an
addendum, never into the submitted paper numbers (D1 to D8 stay as they are).

## Sets

- Primary: `evals/briefs-heldout2.json`, 48 briefs (24 themed, 24 general), sha256
  109f1217ad5e4e24344baa780a0198e5036d00dcb2f1b4b4c3eae69b03e91fb2, committed in 2cdac85
  before any fix existed. Written by an agent session blind to traces, the evaluation
  write-ups and the fix list; it was given six theme names. Checks are never edited; a
  check later found wrong is reported both ways. A do-nothing agent passes 0 of 48
  (docs/data/addendum/do-nothing-new-sets.json).
- Secondary, development-visible: the eight first-version demo briefs in
  `evals/briefs-demo.json` (demo-tomato-patio, demo-salad-steps, demo-strawberry-tower,
  demo-kitchen-terrace, demo-kitchen-terrace-facing, demo-drone-pit, demo-print-station,
  demo-desk-centre). The fixes were designed from these traces; reported separately.

## Arms

- Baseline: tag `eval-final` (0c840bc), worktree C:/zzz/hex-agent-ef.
- Treatment: branch `improve/tool-layer` at 06a6adf (fixes yawSweep, dressInside,
  uncheckablePushback, claimChecks, viewGuard, survey; each a default-on flag),
  worktree C:/zzz/hex-agent-fix.
- Both: muse-spark-1.3, effort low, purpose eval, default features, concurrency 4,
  Meta Model API. Three rounds of `--repeat=1`; in each round both arms start together
  (same host load, same live page). A brief pair whose two runs differ in pageBuild or
  contract is dropped and rerun.

## Grading and reporting

- Both arms rescored with the eval-final grader (`bin/rescore.mjs --versioned` from the
  eval-final worktree); as-run verdicts of the treatment arm are not used.
- Primary endpoint: pass rate on all 48 briefs, paired difference by brief (treatment
  minus baseline, mean over three repeats), 95% interval by bin/stats.mjs. Secondary:
  the themed stratum, strict pass, overclaims, cost per run, calls per run.
- Per-brief table with every regression. A null or negative result is reported as is.
- No pooling with earlier runs or models.

## Disclosures

- The fix author ran one shell glob over `runs/suite-2026-1*/*/trace.json` and stopped
  it before output; no held-out2 traces existed then.
- The treatment adds one still at finish (viewGuard), so still counts per run differ.
- Spend caps raised on the command line by the owner's decision (SPEND_RESERVE_USD=0,
  SPEND_CAP_EVAL_USD=150, SPEND_CAP_DEV_USD=150); no code change.
