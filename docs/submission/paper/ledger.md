<!-- CLASSIFICATION: public -->

# Claim ledger: hex-agent results paper

Ledger for `green-paper.md` and `green-report.md`, written before the prose
(otd-scientific-writing step 4). As of 2026-11-02. Every claim the paper or the
report makes has a row; a row marked `cut` or `needs evidence` does not appear in
either document.

Data files (the only number sources):

- `D1` C:/zzz/hex-agent/docs/data/presentation.json, written by `node bin/presentation-data.mjs --write` (generatedAt 2026-11-02T08:30:57.879Z; re-run read-only on 2026-11-02 and every printed figure matched).
- `D2` scratchpad/green-extra.json, written by `node scratchpad/green-extra.mjs` (read-only over the same suite folders, same scoring rules as D1; adds the same-commit effort pair, batch pairs, power, ranges, cost ratios, abstention). It belongs in `bin/presentation-data.mjs` before anything ships (owner item O3).
- `D3` C:/zzz/_premades/provider-page/facts-compute-2026-11-02.yaml (facts registry; owner attestation pending).
- `D4` C:/zzz/hex-agent/docs/data/suite-index.md, written by `node bin/index-suites.mjs --write`.
- `H1` C:/zzz/hex-agent/docs/plans/2026-11-02-modal-review.md and `H2` C:/zzz/hex-agent/EVALUATION.md: hand-written from tally output. Numbers that trace only to H1 or H2 are marked "hand-tabulated" in the status column and carry that label in the text.

Comparison key (step 6): provider, model, effort, contract, page build, agent commit.

## Claims

| id | claim | kind | evidence | interval | status |
|---|---|---|---|---|---|
| C1 | In each of seven default batches of the 36 briefs ×5, Muse Spark Open passed 89.4 to 93.9% of runs (range of group rates; one row per batch, no pooled rate). | measured | D1 `points[p1..p4,p6..p8].passed/completed/passRate`; D2 `rangeX5.passRate` | per batch, clustered by brief: lowest 82.4 to 96.5 (p3), highest 88.8 to 99.0 (p7); D1 `passClustered.ci` | supported |
| C2 | All seven batch intervals overlap, and no paired difference between consecutive batches, or between the first and last batch, excludes 0. First against last: 0.0 points, 95% CI −6.2 to 6.2, 36 briefs; smallest resolvable difference about 8.9 points. | measured, exploratory (8 pairs looked at, chosen after the data) | D2 `batchPairs.*` | as stated | supported; worded "not distinguishable at this n"; labelled exploratory |
| C3 | Overclaim rate (model reported every requirement met while a check failed; a lower bound, src/checks.mjs `overclaimed()`) per ×5 batch was 3.3 to 6.1%; every clustered interval reaches 0. | measured | D1 `points[*].overclaimRate`, `overclaimClustered.ci`; D2 `rangeX5.overclaimRate` | e.g. p1 0 to 12.5 | supported |
| C4 | Consistency: 25 to 29 of the 36 briefs passed all five repeats in a batch (pass^5). | measured | D1 `passAllRepeats.allPassed`; D2 `rangeX5.passAllRepeats` | none (count) | supported |
| C5 | Strict pass (passed, and the model reported every requirement met) was 86.7 to 90% per ×5 batch. | measured | D1 `strictRate`; D2 `rangeX5.strictRate` | not computed | supported (no interval; reported as a range only) |
| C6 | One grader for every result: all suites rescored from their traces; the first score is kept. Rescoring lowered the ×5 batches by 0 to 9 passes each. | measured | D1 `graders` (c7533b7), `firstScored`; D2 `firstScoredMinusRescored`; D4 rescored column (grader a914d49) | n/a | supported; grader id differs between D1 (c7533b7) and D4 (a914d49), see O6 |
| C7 | Effort, like with like (Modal, deploy 14, agent 7b9b48a, 36 briefs ×5): not distinguishable at this n (difference +1.1, 95% CI −2.7 to 4.9, r 0.77, smallest resolvable 5.4). Overclaims −1.1 points (−4.2 to 2.0). | measured | D2 `effortSameCommit` | as stated | supported |
| C8 | High effort cost 2.35× the token-equivalent cost per run of low (same commit) and 1.47× on an estimated GPU-time basis. | measured | D2 `costRatios`; GPU per-run figures from H1 section 1 via D1 `gpuSource` | none | supported; GPU per run is hand-tabulated in H1 (suite wall × rate × GPUs / runs) |
| C9 | Pooling the three low batches (three guard-only agent commits) against high gives +3.7 points (0.6 to 6.8), which excludes 0; this pools across the agent-commit key. | measured | D1 `effortPaired.modalHighMinusLow` | as stated | weaken: reported in the report only, as the pooled variant, beside C7; never as the headline effort result |
| C10 | Baseten 10-27 ablation (20 briefs ×3): high minus low −11.7 points (−26.9 to 3.5): not distinguishable. | measured | D1 `effortPaired.basetenHighMinusLow` | as stated | supported; replaces the draft claim "low effort beat high" (X3) |
| C11 | Two effort comparisons were looked at; neither supports a difference in pass rate, and both support high costing more per run. | measured + interpretation | C7, C8, C10 | as above | supported |
| C12 | Abstention on against off (6 safety briefs ×3, Baseten, contract d2fd3dad): 17/18 against 7/18 under the current grader, +55.6 points, 95% CI 15.4 to 95.7, 6 briefs, paired, r 0.06; five of six briefs named in the prompt; the unnamed one is the failure on. | measured | D2 `abstention`; D4 rows 2026-10-31T23-19 and 23-27 | as stated; 6 briefs make the normal interval rough | weaken: label 6 briefs; the two arms show different inferred agent commits in D4 (~3460cd6, ~826848e), so "differ only by the feature flag" (H2) is not confirmed (O7) |
| C13 | Deploy-14 control on Baseten (31 briefs ×1, agent 83f3748): 30/31, Wilson 83.8 to 99.4. | measured | D1 `points[p5]`; D2 `basetenD14Wilson`; D3 `baseten-control-d14` | Wilson (one run per brief) | supported |
| C14 | Fireworks F1 (36 briefs ×1, deploy 15, agent 1e98dbf with Modal fixes 1 to 4 on): 31/31 of the runs that finished (Wilson 89.0 to 100); 5 runs lost to host hangs and left out of the rate. | measured | D1 `points[p9]`; D2 `fireworksF1Wilson`; D3 `fireworks-f1` | Wilson | supported; descriptive; the fixes have no before/after measure of their own |
| C15 | In the Modal window, 66 of 875 runs failed under the grader then in use; the largest classes were two-clusters topology (18, MODEL), the e/w half-base drawer dead end (16, AGENT) and same-corner-conflict (10, MODEL). | measured (hand-classified) | H1 section 1 failure table | none | weaken: hand-tabulated, classes overlap, counted before the G0 rescore; label all three in text (O4) |
| C16 | 17 of the 18 two-clusters fails claimed the pairs met, and all 10 same-corner fails were overclaims: most overclaims come from a claimed spatial relation the build lacks. | measured (hand) + interpretation | H1 section 2 items 3 and 5 | none | weaken: interpretation in its own sentence; hand-tabulated |
| C17 | Spend by host: Baseten $94.32 (ledger, 1,690 runs, 26,214 calls); Modal $105.01 (billed, 876 runs, 12,332 calls); Fireworks $1.75 (ledger, 39 runs, 460 calls; bill may be higher); Meta $0. Claude development $99.50 ledger (1,325 runs, 12,927 calls, $89.94, plus 1,101 critic calls, $9.56). | measured | D3 ids baseten-*, modal-*, fireworks-*, meta-spend-usd, claude-* | none | supported pending the owner's attestation of D3 (O2) |
| C18 | Token-equivalent cost per run of the ×5 batches was $0.038 to $0.057; Modal bills GPU time, so its token figure is for comparison only. | measured | D1 `tokenCostPerRun`; H1 section 1 note | none | supported |
| C19 | Host reliability: Fireworks failed to answer 45 calls (36 timeouts, 9 HTTP 5xx; 8.9% of calls) and cut 6 runs in its 3 suites; Modal answered every call in its eval and smoke suites, but no call succeeded from 00:35 to 01:05 UTC (one dead-end suite); Baseten recorded no failed call. | measured | D1 `hosts`; D3 `modal-outage`; D4 class "dead end" | none | supported |
| C20 | Call latency p50 / p95: Modal 0.85 / 5.3 s, Fireworks 2.5 / 8.7 s, Baseten 1.8 / 4.5 s (Baseten from the deploy-14 control only; older traces carry no timing). | measured | D1 `hosts.*.p50Ms/p95Ms` | none | supported; Baseten caveat stated (from results-draft.html note) |
| C21 | Nothing was trained; every change is to the agent's tools, prompt and guards, or to the configurator. | statement of method | data-presentation plan framing rules; HACKATHON_DELTA.md | n/a | supported |
| C22 | The Meta Model API has not been called; every Muse result is Muse Spark Open (open weights) on Baseten, Modal or Fireworks. | measured | D3 `meta-spend-usd`; KNOWN_LIMITATIONS.md | n/a | supported (review by 2026-11-04) |
| C23 | The 18 held-out briefs have not been run, so every rate is in-distribution; nine briefs are named in the prompt, and several briefs and checks were reworded after runs. | measured | Fireworks plan step 3; H1 section 4 ("Prompt-named briefs"); H2 grader-error notes | n/a | supported |
| C24 | Grader errors found and fixed by reading traces (sewing-vague bar, gap-drawer wording and notch check, bay-bins wording, claimsInScope disclaimers twice, tool-caddy handle, the E8 tightening, G0 batch); each was fixed and every suite rescored. | measured | H2 sections "Runs so far", "The 36 briefs on the live release", "Claude spend-down", "Audit fixes"; H1 section 4 | n/a | supported (listed by name, not counted) |
| C25 | The configurator, its rules, collision gate, API and print packs pre-existed and are One Thousand Drones' work; configurator fixes during the event (some prompted by the agent's runs) are credited to it. | statement | HACKATHON_DELTA.md; D1 `changes` | n/a | supported |
| C26 | A run passes only when every code check passes (placement rules, mesh collision gate, parts list, print pack, share link reloaded in a fresh tab, the brief's coded checks); a check that did not run counts as not passed; requirements with no coded check rest on the model's statement. | design | README.md "How it decides"; D3 page "Terms" | n/a | supported |
| C27 | Fit only: no check rates strength, heat, food safety or print fit; a run that claims such a property as met fails (claimsInScope). | design | KNOWN_LIMITATIONS.md | n/a | supported |
| C28 | Interpretation: across the event, changes went to failure classes that touch a few briefs each, and with 36 briefs a change smaller than about 9 points cannot be resolved, so a flat headline is the expected outcome of this design rather than evidence the changes did nothing. | interpretation | C2 power (D2); D1 `changes` | n/a | supported as interpretation, in its own sentences |
| C29 | Model as served: Baseten `meta-models/muse-spark-open-1026` (816B-A42B, NVFP4); Modal Dedicated endpoint, NVFP4 on 4 B300 GPUs, at most 1 replica; Fireworks `accounts/fireworks/models/muse-spark-open`. Effort low was sent; Modal did not echo it; Fireworks reasoning tokens averaged 92 per call against Modal low 117 and high 432. | measured | H2 first table and "Fireworks F0 and F1"; D3 `modal-window`, `modal-effort-echo` | n/a | supported (reasoning-token figures hand-tabulated in H2) |
| C30 | Calls per run in the ×5 batches: 13.4 to 16.9. | measured | D1 `callsPerRun` | none | supported |

## Draft claims this paper does not repeat

| id | draft claim (source) | why | status |
|---|---|---|---|
| X1 | "170/180" on the live release (WRITEUP.md, README.md) | first score under an older grader; under the one grader it is 165/180 (D1 p2) | cut; owner updates WRITEUP and README (O5) |
| X2 | "172/180" earlier site version (WRITEUP.md) | first score; rescored 163/180 (D1 p1) | cut |
| X3 | "Low reasoning effort beat high (58/60 vs 52/60)" (WRITEUP.md) | paired interval −26.9 to 3.5 includes 0 (C10) | cut |
| X4 | "The difference is within the spread between repeated runs, so we kept low" (provider page, Modal) | the pooled pair excludes 0 (C9); the like-with-like pair does not (C7). The sentence should cite C7 | weaken (O8) |
| X5 | "Our checks were wrong as often as the model" (WRITEUP.md) | not measured as a ratio | cut; replaced by the named list (C24) |
| X6 | "35/35 honesty and injection briefs" as a current result (WRITEUP.md, README.md) | measured 2026-10-27 on contract 2b45909b with an older agent; true as of then (Wilson 90.1 to 100, D2 `honesty7`) | report only, dated, as an earlier measure |
| X7 | Claude results (abstention 6/12 to 12/12, etc.) in the results table (WRITEUP.md) | development models; checklist item 24 | cut from results; named in disclosure only |
| X8 | What a do-nothing agent would score | not measured | needs evidence (O9) |
| X9 | Brief-set file hash | recorded per rescore (E10) but not in any file read here | needs evidence (O10) |

## Open items for the owner

- O1 Judging rubric: not in any file read. The paper uses the skill's default hackathon skeleton at about two pages. Paste the rubric and the headings get mirrored.
- O2 Classification: Axis A `public`, Axis B `none` is this draft's own assessment (a consumer storage configurator; nothing on the BCI, swarm or defense side). The owner decides whether these quantitative results may go out, and attests the facts file D3 (its 14-claim table, including the credit amounts in claim 13).
- O3 Move D2's figures into `bin/presentation-data.mjs` and regenerate `presentation.json`, so the paper cites one generated file.
- O4 Failure classes (C15, C16) are hand-tabulated and counted under the grader before G0. A generated failure-class file, rescored, would let them stand unlabelled.
- O5 WRITEUP.md and README.md still carry 170/180, 172/180 and "low beat high"; replace them with C1, C7 and C10 before submission.
- O6 Grader id: presentation.json names c7533b7, suite-index.md names a914d49 (git log: a914d49 added per-grader rescores, c7533b7 records overclaims under the current grader). State one id in the submission.
- O7 Abstention arms show different inferred agent commits (D4 ~3460cd6 off, ~826848e on); confirm whether they differ only by `--features`.
- O8 The provider page's effort sentence (X4) should cite the same-commit pair (C7).
- O9 Do-nothing baseline: not measured. Without it, the share of passes a builds-nothing agent would get on the honesty-only negatives is unknown.
- O10 Brief-set hash, temperature, and why five repeats: not found in the files read; add to the report or say not recorded.
- O11 Figure 1: results-draft.html draws Wilson whiskers over runs for ×5 batches; statistics.md requires clustered intervals there. Switch the whiskers to `passClustered.ci` (Wilson only for the ×1 points), then export it for the paper.
- O12 Links: the repo (github.com/Otd-llc/hex-agent) visibility and license are undecided (README "to be decided"); the report needs a public URL; the Meta Model API demo runs are still to be recorded (review-by 2026-11-04).
- O13 Review: the fresh-reader test and one adversarial lens round ran on this draft (see the report's validation log); the owner's attestation and a rendered preview remain.
- O14 Citations in the report (Miller 2024; Brown, Cai and DasGupta 2001; Yao et al. 2024) come from the skill's source list and were not re-opened this session; otd-content-writing requires each to be opened and checked before shipping.
- O15 Commit the Modal and Fireworks suite folders, every `rescore-*.json` and the companion script, then cite that commit; at 6a79067 they are untracked.
- O16 Do-nothing baseline: it needs no model calls (score an empty finish with code); worth running before submission. The held-out run is the owner's call.
- O17 Review exposure: one review agent's grep printed a single theme line of evals/briefs-heldout.json (it did not open the file or use the line). The owner decides whether that matters for the held-out set.
- O18 Demo video link and public URLs for the repo and the report go where the paper shows "not yet available".

## Validation log

Round 1 (2026-11-02): fresh-reader test plus five read-only lens agents (P1 claims, P2 provenance with L9 meta, P3 statistics, P4 validity with P5 reviewer). Verified by hand before folding: the overclaim definition (src/checks.mjs `overclaimed()` needs every requirement claimed met), the untracked suite folders (git status), the prompt-named safety briefs (H1 section 4). Folded: title unit (runs, not briefs); overclaim and pass definitions; effort wording; abstention caveats (prompt-named briefs, commit mismatch, r, power); 10-31 batch pooling; power range 4.1 to 9.5; "estimated" GPU basis; host and release counts in the abstract; a cherry-picked rerun cut; "mostly" replaced by 28 of 66; reproduction caveat; Modal credit source; inferred p1 contract. Not folded: P3's objection to "every interval overlaps" (the skill's quick reference allows it beside a range); P5's request to shrink Table 1 (kept for the host-cut and effort rows). P5 score on the first draft: soundness 2, presentation 3, contribution 2, overall 5 of 10. A second round has not run, so the gate (one round with zero material findings) is not met.
