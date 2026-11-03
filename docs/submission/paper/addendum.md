<!-- CLASSIFICATION: public -->
<!-- Data: A7 docs/data/addendum/arms.json (bin/addendum-arms.mjs), A8 docs/data/addendum/heldout2-audit.json (bin/addendum-audit.mjs; hand-tabulated verdicts), A2 docs/data/addendum/do-nothing-new-sets.json (bin/do-nothing.mjs). Design: docs/plans/2026-11-03-addendum-protocol.md. Claims: ledger.md rows C74 to C79, C83, C86. -->

# Addendum: six tool-layer fixes are not distinguishable from none on a fresh held-out set

hex-agent. Companion to the paper (paper.md) and report (report.md). Accurate as of 2026-11-03. Every number here comes from A7, A8 or A2; none enters a figure of the paper or the report.

## Result

On 48 fresh held-out briefs, the agent with six tool-layer fixes and the frozen agent each passed 126 of 143 runs (per-brief means 88.2% in both arms; 88.1% of pooled runs). Paired by brief, the difference is 0.0 points (95% CI −6.2 to 6.2, 48 briefs, z, arms correlated at 0.69). The fixes are not distinguishable from no fixes at this n. The design had about 80% power only for changes of 9 points or more (smallest resolvable difference 8.8 points), so a smaller effect in either direction would not have been seen. A grader audit of 16 passing eval-final runs found 4 false passes (below), so the eval-final arm's pass rate likely overstates success, and the fix arm's, graded by the same checks but not audited, likely does too (the audit read passes only; false failures were not examined, and the first held-out set had one, D6). Each arm overclaimed in 3 runs; with three events no interval is given. Cost per run was $0.092 and $0.084 in tokens (estimates, list price × tokens), with 17.8 and 17.9 calls per run; no interval was computed and no difference is claimed.

## Design

The protocol (docs/plans/2026-11-03-addendum-protocol.md) was committed before either arm ran on the fresh set.

- Arms: the frozen agent, tag `eval-final` (0c840bc), against branch `improve/tool-layer` at 06a6adf, which adds six default-on flags (yawSweep, dressInside, uncheckablePushback, claimChecks, viewGuard, survey). Both ran Muse Spark 1.3 on the Meta Model API at effort low, with default features, on contract da0834cc and page build CvOVnJJh (A7 `provenance`).
- Set: `evals/briefs-heldout2.json`, 48 briefs, committed in 2cdac85 before any fix was committed. Half are general briefs. The other half are themed, four briefs on each of six themes, and the six themes were taken from the planned fix list (the handoff at 9b8098b), so the themed stratum is aimed at the fixes by design. The set was written by an agent session given those six theme names, blind to the traces and the evaluation write-ups; the prompt it was given is not in the repository. Its checks are never edited. A do-nothing agent passes none of the 48 (A2 `sets.heldout2`).
- Rounds: three rounds of one run per brief, with both arms started together in each round, so both met the same host load and the same live page. A brief pair whose two runs differ in page build or contract is dropped. One pair was left out: in round 2 the eval-final (base) run of h2-t1-tape-and-coil stopped on a Meta API error (suite-2026-11-03T08-06-46-953Z), which leaves 143 kept pairs. A7 labels that pair "1|", a 0-based round index (A7 `dropped`, `keptPairs`).
- Scoring: both arms are rescored with the `eval-final` grader (`rescore-0c840bc.json`); the fix arm's as-run verdicts are not used. A run stopped by its turn budget counts as an agent failure (four eval-final runs stopped there; none stopped at a time budget, per docs/plans/2026-11-03-promote-heldout2.md); runs stopped by a model or host error, or by the spend guard, are left out with their pair.
- Statistics: rates are means of per-brief means (A7 `pct`; `pooledPct` beside it). Intervals are 95%, clustered by brief, with the normal critical value at 30 briefs or more, t with briefs minus 1 degrees of freedom below 30, and none below 10 briefs. Differences are paired by brief (fix minus base, mean over the three repeats). Three comparisons were made: the overall difference (the protocol's primary endpoint) and the two strata, which are exploratory. The six themes are described only, with no comparison.

## Held-out2 results

**Table B1.** Held-out2, 48 briefs ×3, both arms rescored with the eval-final grader; 1 pair dropped (Meta API error). Passed: runs passed of runs kept, then the mean of per-brief means (the pooled run rate is 88.1% in both arms). 95% CI clustered by brief (z). "All 3": of the 47 briefs with three kept runs, those whose three runs all passed. Strict: passed and the finish reported every requirement met (a negative brief's pass counts as strict), mean of per-brief means with its clustered interval; no comparison is claimed. Cost in tokens at list price, no interval. Source: A7 `sets.heldout2.base`, `.fix`, `.fixMinusBase`.

| Arm | Passed | 95% CI | Strict (95% CI) | All 3 | Overclaimed runs | $/run | Calls/run |
|---|---|---|---|---|---|---|---|
| eval-final (0c840bc) | 126/143; 88.2% per-brief mean | 80.8 to 95.6 | 109/143; 76.4% (66.9 to 85.9) | 37 | 3 | 0.092 | 17.8 |
| tool-layer fixes (06a6adf) | 126/143; 88.2% per-brief mean | 80.1 to 96.3 | 103/143; 72.2% (61.9 to 82.6) | 39 | 3 | 0.084 | 17.9 |

Grader audit (A8, hand-tabulated like D7; the sample and intervals by code). The rule took the held-out2 brief ids in sorted order, every third from the first, and for each the first passing eval-final run by round: 16 runs. One Claude reviewer agent (a read-only subagent), not blinded and looking for defects (it knew every sampled run was a pass), read each run's trace and stills (the tape-in-drawer run was also confirmed by eye): 4 were false passes (Wilson 10.2 to 49.5%; the interval reflects sampling only, not reviewer error; no population false-pass rate is estimated), 2 unsure (false or unsure, Wilson 18.5 to 61.4%) and 10 true. The causes: the implicit compromise outcome passes a run whose core requirement the agent reported unmet; prop checks test presence, not place (a tape measure on the floor beside a closed drawer, claimed inside); there is no orientation check (a mug handle sideways, claimed front); and the face of a part is not checked (a pencil bin probably facing the wall). The null difference in graded pass rate stands. The audit sampled only eval-final passes, and the fixes (dressInside, viewGuard, uncheckablePushback) target the relations the grader does not check (place, orientation, face), so it says nothing about a difference in true success, in either direction. The pass rates on held-out2 likely overstate success; they are upper bounds only if the grader has no false failures, which the audit did not examine. One reviewer judged every run, the pegboard verdict is "probable", and taking the first passing run by round favours round 1.

By stratum, exploratory, paired by brief (t23 at 24 briefs): the themed briefs gave −1.4 points (95% CI −14.2 to 11.4; smallest resolvable 18 points) and the general briefs +1.4 points (−1.5 to 4.3; smallest resolvable 4 points), which rests on one brief whose runs changed (h2-g-router-box). Neither is distinguishable.

**Table B2.** Held-out2 themed briefs by theme, four briefs each: pass rate per arm. Exploratory. With four briefs per theme no interval and no difference is given (fewer than 10 briefs), and no theme result is a finding. Source: A7 `sets.heldout2.byTheme`.

| Theme | eval-final | fixes |
|---|---|---|
| orient | 66.7% | 50% |
| inside | 58.3% | 58.3% |
| limit | 91.7% | 75% |
| unverifiable | 83.3% | 100% |
| front | 91.7% | 100% |
| multi | 100% | 100% |

Per brief, the fixes lost runs on five briefs and gained runs on six. Each line gives the three runs of the eval-final arm, then of the fix arm (1 passed, 0 failed; A7 `regressions`, `gains`):

- Regressions: h2-t1-twin-spools (1 0 0, then 0 0 0), h2-t1-goggles-hang (1 1 1, then 0 1 0), h2-t2-two-filled-drawers (1 1 0, then 0 0 0), h2-t3-lean-planter (1 1 1, then 1 1 0), h2-t3-one-cell-carry (1 1 0, then 0 1 0).
- Gains: h2-t1-upright-drivers (1 0 0, then 0 1 1), h2-t2-tape-in-drawer (1 1 0, then 1 1 1), h2-t2-lidded-driver-box (0 0 0, then 1 0 0), h2-t4-handsome-organizer (0 1 0, then 1 1 1), h2-t5-counter-drawers (1 1 0, then 1 1 1), h2-g-router-box (0 1 1, then 1 1 1).

## Secondary: the first-version demo briefs

The fixes were designed from the traces of the eight first-version demo briefs, so this set is development-visible and reported apart, with rates and per-brief results only. The frozen agent passed 16 of 24 runs (66.7%) and the fix arm 17 of 24 (70.8%). All three runs passed on 4 and 5 briefs. Neither arm overclaimed. Cost per run was $0.160 and $0.150, with 23.5 and 22.3 calls per run. The one brief whose runs changed is demo-strawberry-tower (1 1 0, then 1 1 1); the same brief text passed 5 of 5 in the paper's demo suite, from which the video's run was chosen. Source: A7 `sets.demoV1`.

## Disclosures

- Suite-id collision. In each of the three demo rounds both arms started in the same millisecond and shared one suite id, so both wrote their run folders into one directory, and the last to finish overwrote `summary.json`. Every trace survived. `bin/split-collided.mjs` writes one summary per agent commit into `runs/<suite>-base` and `runs/<suite>-fix`, with rows that point back at the shared traces, and each arm was rescored from its own summary (A7 `sets.demoV1.suites`). Run folders were not moved. The held-out2 rounds did not collide.
- Fix-author glob. While writing the fixes, their author ran one shell glob over the trace files of every suite folder and stopped it before it printed anything. No held-out2 trace existed then.
- The fix arm adds one still at finish (viewGuard), so it sends one more image per run, and its image tokens are part of its cost per run.
- These runs came after the paper's first review gate, with spend caps raised on the command line by the owner's decision and no code change (protocol, Disclosures). Their Meta Model API spend is part of the post-gate total in `docs/data/addendum/spend.json`; A7 records cost per run only.
- Nothing was trained. The fixes are changes to the agent's tool layer and are not merged into the frozen agent; the paper's results all ran on `eval-final`.

## Reproduce

Each suite is rescored with the eval-final grader from a worktree at tag `eval-final` (`node <worktree>/bin/rescore.mjs runs/<suite>/summary.json --briefs=<set> --versioned`), then `node bin/addendum-arms.mjs --write` writes A7. A2 comes from `node bin/do-nothing.mjs --sets=heldout2,abstain2 --out=docs/data/addendum/do-nothing-new-sets.json`, with no model calls. The suites are listed in A7 `sets.*.suites`.
