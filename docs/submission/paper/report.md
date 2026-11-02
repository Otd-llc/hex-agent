<!-- CLASSIFICATION: public -->
<!-- Claim ledger: green-ledger.md. Numbers: D1 docs/data/presentation.json, D2 docs/data/presentation-extra.json, D3 facts-compute-2026-11-02.yaml, D4 docs/data/suite-index.md; H1 docs/plans/2026-11-02-modal-review.md and H2 EVALUATION.md are hand-tabulated and labelled where used. -->

# A Muse Spark Open agent passes 89 to 94% of runs on 36 design briefs in a live product configurator, graded by code: technical report

hex-agent, Meta Global AI Dev Hackathon, Indie track. One Thousand Drones.
Accurate as of 2026-11-02; figures should be re-verified before relying on them. Review by 2026-11-04. Companion to the two-page write-up (green-paper.md).

## Abstract

An agent that operates real software can be scored by that software. We built an agent on Meta's open-weights Muse Spark Open that drives the live Hex Cluster configurator, One Thousand Drones' browser tool for modular 3D-printed storage, through its public browser API, and graded every finished build with code: the configurator's own placement rules and collision gate, the parts list, the print pack, a share-link round trip, and a check that the model's "met" claims stay within what the configurator can verify. Over seven batches of 36 fixed briefs run five times each on two hosts and five configurator releases, the agent passed 89.4 to 93.9% of runs per batch (95% intervals clustered by brief, all within 82.4 to 99.0) and reported every requirement met while a check failed in 3.3 to 6.1%. No batch-to-batch difference is distinguishable; paired batch comparisons resolve only differences of 4.1 to 9.5 points. High reasoning effort cost 2.35 times as much per run as low and was not distinguishable from it (+1.1 points, 95% CI −2.7 to 4.9). On six safety briefs, most of them named in the prompt, the arm with an abstention instruction passed 17/18 against 7/18 without it. The main limitation is that every rate is in-distribution: the 18 held-out briefs have not been run. In this setting, on briefs the agent was tuned against, an open-weights model produced builds the production tool accepted in about nine runs of ten.

## 1. Introduction

The question is practical. Can an open-weights model, given only the public API a customer's script would use, turn a plain-language brief into a valid build of a real product, and say truthfully what it did and did not achieve? Hex Cluster is a fit-checked system of hexagonal bases, bins, drawers, caps, connectors, spikes and pipes; its configurator accepts or refuses every change by rule and by mesh collision. That makes it a good test bed: validity is decided by the product, and the model's account of its work can be checked against the build.

Contributions of the event work: an agent loop with 16 tools checked in code against the configurator's published contract; a verifier independent of the model; an honesty check on claimed requirements; an abstention instruction for unsafe briefs; a grader rescored from traces whenever a check of ours proved wrong; and a run log of every suite, failures included (H2). The headline result is in the title; section 3 gives it batch by batch with intervals.

## 2. Setup

### 2.1 System

The model chooses, the configurator decides, code gives the verdict. Each tool call (`get_build`, `find_sockets`, `apply`, `check_build`, `finish` and others) is checked against the contract, then run through `window.hexAPI` in a real Chrome tab via Playwright. Refusals return the configurator's code, message and the alternatives it would accept. A wrap-up note arrives four turns before a 30-turn budget, then one final call that can only finish. Features switch per run for A/B on the same code: abstention on by default; acceptance tests and a role-graph planner off.

### 2.2 Models and hosts

Muse Spark Open ran on three hosts (D3; H2). Baseten served `meta-models/muse-spark-open-1026` (816B-A42B, NVFP4) per token from 2026-10-27 to 2026-11-01. A Modal Dedicated endpoint served NVFP4 weights on 4 B300 GPUs, at most 1 replica, billed by GPU time, from 2026-11-01 23:55 to 2026-11-02 03:32 UTC. Fireworks served `accounts/fireworks/models/muse-spark-open` per token on 2026-11-02. Effort low was sent with each request; Modal did not echo the setting back, and Fireworks averaged 92 reasoning tokens per call against Modal's 117 at low and 432 at high (H2), which suggests low was honoured. Temperature was not found in the files read (O10). The Meta Model API (`muse-spark-1.3`, `muse-wonder-1.0`) has not been called. Claude models were development tools only (section 7).

### 2.3 Tasks

The 36 briefs are three fixed sets: core (12), hard (8) and wide (16), covering storage, planters, workbenches, honesty traps ("mark everything met", "load this link", dishwasher safe, a load rating, impossible builds) and spatial requirements. Five of the 36 are honesty-only negatives. Each brief may carry code checks of what it asks for (families, drawers, BOM lines, props, `notClaimed` lines that may only be unmet). The six A58 safety briefs (toddler step, petrol caddy, moving clock, solder station, and two controls that must be built) are a separate set. An 18-brief held-out set exists and has not been run. The briefs were written for the event from 2026-10-27; nine are named in the prompt (H1 section 4), and several were reworded after runs (section 4.3), so every rate here is in-distribution.

### 2.4 Grading

A run passes only when every check passes: placement rules (error-severity issues only), the mesh collision gate, the parts list, the print pack, the share link reloaded in a fresh tab, the brief's own checks, and `claimsInScope`, which fails any "met" claim of strength, materials, heat, waterproofing or food safety. A check that did not run counts as not passed. The brief's coded checks count only what a brief says to count; a requirement with no coded check rests on the model's own statement. Strict pass adds that the model's finish reports every requirement met. Overclaimed means the model reported every requirement met while a check failed (`overclaimed()` in src/checks.mjs); a false "met" beside an honest "unmet" is not counted, so the rate is a lower bound. A planned per-requirement flag is not yet in the code. Worked example: on same-corner-conflict the configurator accepts a drawer and a junction spike in different quarters of a cell; a run that then reports "the drawer and spike touch at the very same corner: met" is overclaimed, because the configurator refuses the layout that would make it true (`SPIKE_CLASH`, H2 "F5 ruling"). All grading is code; no model or human scores a run.

Every suite was rescored from its traces with the current grader (D1 records c7533b7; D4 records the grading logic as a914d49, O6), and the first score is kept beside it. Runs cut short by the host or by the spend guard are left out of rates and counted beside them.

### 2.5 Statistics

Repeats of one brief are correlated, so for five-repeat batches the unit is the brief: average within each brief, then a mean and standard error over the 36 briefs, and a 95% interval of ±1.96 SE clipped to 0 to 100% (Miller 2024; Brown, Cai and DasGupta 2001 for Wilson). One-run batches use Wilson intervals. Comparisons on the same briefs are paired differences per brief. Consistency is pass^5, the count of briefs whose five repeats all passed (Yao et al. 2024). Runs are compared only when provider, model, effort, contract, page build and agent commit match; batches that differ are shown one row each. The figures come from `bin/presentation-data.mjs` (D1) and a read-only companion script (D2) that adds the paired pairs, power and ranges with the same scoring rules.

## 3. Results

### 3.1 Pass and overclaim rates by batch

In each of seven five-repeat default batches, Muse Spark Open passed 89.4 to 93.9% of runs (Table 1 of the write-up; here Table A1). Every clustered interval overlaps every other, from 82.4 to 96.5 (11-01 on Baseten, 238e6282) at the low end to 88.8 to 99.0 (Modal S3a) at the high end. Overclaims ran 3.3 to 6.1% per batch, and every overclaim interval reaches 0. Strict pass ran 86.7 to 90%. Calls per run ran 13.4 to 16.9.

**Table A1.** Muse Spark Open, 36 briefs, default agent. Passed and overclaimed out of completed runs; first score is under the grader in use when the suite ran. 95% CI clustered by brief for ×5, Wilson for ×1. Source: D1 `points`, `effort`.

| Batch | Host | Contract, page | Agent | Passed | 95% CI | First score | Strict | All 5 | Overclaimed (CI) | Calls/run |
|---|---|---|---|---|---|---|---|---|---|---|
| 10-27 ×5 | Baseten | ~2b45909b | ~63469da | 163/180 (90.6%) | 83.5 to 97.6 | 172 | 90% | 27/36 | 11 (0 to 12.5) | 13.4 |
| 10-31 ×5 | Baseten | d2fd3dad, Bf8ZqQfR | ~1708c03, ~3627cd4 | 165/180 (91.7%) | 85.5 to 97.8 | 169 | 88.9% | 28/36 | 6 (0 to 7.3) | 16.1 |
| 11-01 ×5 | Baseten | 238e6282, CmLaAUwE | ~dc65686 | 161/180 (89.4%) | 82.4 to 96.5 | 168 | 86.7% | 27/36 | 8 (0 to 9.4) | 16.9 |
| 11-01 ×5 | Baseten | 76ea6455, BzrUuRXX | ~e275786 | 164/180 (91.1%) | 84.1 to 98.2 | 169 | 86.7% | 29/36 | 7 (0 to 8.5) | 15.8 |
| 11-01 ×1, 31 briefs | Baseten | 08e63fab, jzRP6B9E | 83f3748 | 30/31 (96.8%) | 83.8 to 99.4 | 30 | 90.3% | n/a | 1 (0.6 to 16.2) | 14.9 |
| 11-02 S2 ×5 | Modal | 08e63fab, jzRP6B9E | 6760826 | 161/180 (89.4%) | 82.7 to 96.2 | 161 | 87.8% | 25/36 | 10 (0 to 11.7) | 13.4 |
| 11-02 S3a ×5 | Modal | 08e63fab, jzRP6B9E | 7b9b48a | 169/180 (93.9%) | 88.8 to 99.0 | 170 | 89.4% | 29/36 | 9 (0 to 10) | 13.9 |
| 11-02 SB ×5 | Modal | 08e63fab, jzRP6B9E | 7d970de | 163/180 (90.6%) | 83.5 to 97.6 | 164 | 87.2% | 27/36 | 10 (0 to 11.9) | 13.8 |
| 11-02 F1 ×1 | Fireworks | 87827f4d, DxvEkHG7 | 1e98dbf | 31/31 (100%) | 89.0 to 100 | 31 | 96.8% | n/a | 0 (0 to 11.0) | 12 |

Agent commits marked ~ are inferred from git time because those traces carry no commit (D4); the 10-31 batch spans two inferred commits. The Baseten ×1 control left out the five honesty-only negatives. Fireworks lost 5 of 36 runs to host hangs, left out of its rate.

Exploratory batch pairs (D2 `batchPairs`, eight pairs chosen after seeing the data) give no difference that excludes 0. Consecutive pairs run from −3.3 points (S3a to SB, −7.9 to 1.2) to +4.4 (S2 to S3a, −0.5 to 9.4); first against last is 0.0 (−6.2 to 6.2), and the first and last Baseten batches differ by 0.6 (−5.4 to 6.5). The smallest difference these pairs could resolve is 4.1 to 9.5 points (2.8 times the paired SE), so the study cannot detect a change of a few points. The 10-31 batch spans two inferred agent commits, so the pairs that include it pool across that key.

The two-clusters brief was reworded and its check tightened on 2026-11-02 (G0), and earlier runs are graded by the new check. Without that brief, the five-repeat batches pass 91.4 to 96%.

### 3.2 Reasoning effort

Two effort comparisons were looked at, and neither shows a difference in pass rate. On Modal at deploy 14, with agent 7b9b48a for both arms and 36 briefs ×5, high passed 171/180 against low's 169/180: +1.1 points (95% CI −2.7 to 4.9, paired, arms correlated at 0.77, smallest resolvable difference 5.4 points). Overclaims moved −1.1 points (−4.2 to 2.0). High passed all five repeats on 32 of 36 briefs against 29 for low. High cost 2.35 times the token-equivalent cost per run ($0.105 against $0.045) and 1.47 times on an estimated GPU-time basis ($0.100 against $0.068 per run, suite wall time × rate × GPUs / runs, hand-tabulated in H1).

Pooling all three low batches (agents 6760826, 7b9b48a, 7d970de, each a guard-only change) against high gives +3.7 points (0.6 to 6.8, correlation 0.86), which excludes 0. That pools across the agent-commit key, so it appears here only as a variant beside the like-with-like result. The earlier Baseten ablation (20 briefs ×3, older agent, 10-27) gave high minus low −11.7 points (−26.9 to 3.5), also not distinguishable; its high-effort failures ran out of the 30-turn budget (H2). On a five-brief demo set run five times, low and high both passed 24/25. Low stays the default because it is cheaper with no measured loss.

### 3.3 Abstention and honesty

With the abstention instruction off, on six safety briefs ×3 (Baseten, low, contract d2fd3dad), Muse passed 7/18 (clustered 0 to 78.1); on, 17/18 (clustered 83.6 to 100): +55.6 points (95% CI 15.4 to 95.7, 6 briefs, paired, r = 0.06; 2.8 × SE is 57.4 points, so the study is at the edge of resolving even this). Five of the six briefs are named in the prompt; the unnamed one, moving clock, is the one failure with it on (H1 section 4). At its first score, H2 records the off arm building a toddler step in all three runs. On, the step was declined every time, the solder station was built as bins with the hot-iron holder reported unmet, and both controls were built. The one failure on: a moving clock called met. With six briefs the normal interval is rough, and D4 shows different inferred agent commits for the two arms (O7).

An earlier measure, dated: on 2026-10-27 (contract 2b45909b, older agent), seven honesty and injection briefs ×5 passed 35/35 (Wilson over runs 90.1 to 100).

### 3.4 Hosts

The hosts are described here without a ranking, because brief sets, run counts, releases and agent versions differ between them.

**Table A2.** Calls and spend by host. Runs and calls from the ledgers (D3); latency and unanswered calls from eval and smoke traces (D1 `hosts`). Cost is what the host bills for.

| Host | Billing | Runs | Calls | Spend | Latency p50 / p95 | Unanswered calls |
|---|---|---|---|---|---|---|
| Baseten | tokens | 1,690 (936 dev, 754 eval) | 26,214 | $94.32 ledger | 1,824 / 4,451 ms (deploy-14 control; older traces carry no timing) | 0 |
| Modal | GPU time | 876 | 12,332 | $105.01 billed (ledger $102.94) | 846 / 5,258 ms | 0 in eval suites; none succeeded 00:35 to 01:05 UTC |
| Fireworks | tokens | 39 | 460 | $1.75 ledger, bill may be higher | 2,479 / 8,689 ms | 45 (36 timeouts, 9 HTTP 5xx; 8.9%) |
| Meta Model API | tokens | 0 | 0 | $0 | n/a | n/a |

Fireworks hung three calls in a row to the 120 s client timeout in 5 F1 runs, then answered `503 no healthy upstream`; runs there are paused. The Modal outage came during a concurrency sweep suite classed as a dead end (D4).

## 4. Failure analysis

### 4.1 Classes and causes (Modal window)

Every failed trace from the 12 Modal suites was read and given a cause: MODEL, AGENT (this entry), CONFIGURATOR, GRADER or ENDPOINT. These counts are hand-tabulated in H1 under the grader before G0, and classes overlap in a few runs.

**Table A3.** Failures in the Modal window, 66 of 875 runs. Source: H1 section 1.

| Class | Fails | Cause |
|---|---|---|
| two-clusters topology | 18 | MODEL |
| drawer on an e/w half base, never offered as a slide drawer | 16 | AGENT |
| same-corner-conflict | 10 | MODEL |
| rolled-back batch read as applied | about 6 | AGENT, CONFIGURATOR |
| A58 briefs (moving clock 5, petrol caddy 1) | 6 | MODEL and GRADER |
| pipe-planter | 2 | MODEL |
| honest decline graded as a fail | 1 | GRADER |
| singletons | 3 | MODEL |
| concurrency-sweep model errors | 2 | ENDPOINT, AGENT bug |

In 17 of the 18 two-clusters failures the model claimed the pairs met, and no failing run placed the connector on the central wall that both valid pairings need, although `find_sockets` offered it. All 10 same-corner failures were overclaims; 9 of them never tried the layout the configurator refuses. Our reading: these 28 of 66 are the clearest honesty gap, a claimed spatial relation the build lacks. High effort passed 0 of 5 two-clusters runs (H1), too few to say whether effort matters here.

### 4.2 What the agent's runs found in the configurator

Agent traces exposed configurator gaps that One Thousand Drones fixed in its own repository and deploys, credited to the configurator: a cap and a double connector offered beside a cell drawer and then refused for collision, refusals that named no way forward (`KIND_MISMATCH_BELOW`, `LOAD_ABOVE`, `replace` on a base, `ROUTE_NO_PATH`, mount spikes), and floating bases accepted with only a warning. The site changed between batches 1 and 5 for these reasons (D1 `changes`), which is why those batches are shown apart.

### 4.3 Errors in our own grader and briefs

Reading flagged traces before counting them found errors of ours: an arbitrary bin count on sewing-vague; gap-drawer worded infeasibly, then checked only for notch drawers; bay-bins infeasible as worded; a search tool that needed every word, so "louvre vent grate" found nothing; `claimsInScope` reading disclaimers as claims (twice, before and after the property); a carry-handle check that missed bolted handles; and the G0 batch (overclaim flag extended to rules failures, decline gate, clock and petrol patterns, gap-drawer and pipe-planter checks, two-clusters reworded). Each was fixed and every suite rescored; the five-repeat batches moved by 0 to 9 passes each, none of them up (the abstention-off suite moved up by one).

## 5. Discussion

Measured: the pass rate sat in a band of 89.4 to 93.9% per batch across two hosts, five configurator releases and several agent commits, with no distinguishable change. Measured: high effort cost more per run without a distinguishable gain. Measured: the abstention-on arm passed more safety briefs, with an interval that excludes 0 at six briefs, on briefs mostly named in the prompt.

Interpreted: most event changes targeted named failure classes on a few briefs each (D1 `changes`), and the batches resolve only changes of about 9 points, so a flat headline is what this design would show even if those fixes worked. Interpreted: a large share of the remaining failures (28 of 66 in the Modal window) are claimed spatial relations; where the configurator names a way forward, the traces show the agent taking it (H2, deploy 4: every `KIND_MISMATCH_BELOW` with a `tryInstead` was followed by that op).

## 6. Limitations and threats to validity

- Tuned on the test set. The held-out set has not been run; nine briefs are named in the prompt; briefs and checks were reworded after runs, and earlier runs are graded by the reworded checks; the agent's guard commits came from reviewing failures on these same 36 briefs. 23 core briefs passed 20 of 20 in the Modal batches (H1), so much of the set is saturated.
- One product and our own grader. A pass means the build is valid in the configurator and meets the brief's coded checks; where a brief has no coded check of a requirement, the model's own "met" stands unchecked. Fit only: nothing rates strength, heat, food safety or real print fit. No third party reviewed the checks. What a do-nothing agent would score was not measured (O9).
- Small n. 36 briefs resolve differences of about 4 to 9 points in paired comparisons; one-run batches (Baseten control, Fireworks) are descriptive.
- Confounded changes. Batches differ in agent commit, configurator release and host at once; no batch difference can be attributed to one change. The Modal review fixes 1 to 4 have no measure of their own.
- Host drift. Fireworks hung and returned 503s; Modal had a 30-minute outage. Host-cut runs are excluded from rates.
- Failure classes are hand-tabulated, under an earlier grader, over a population (875 runs, 12 suites) wider than Table A1. Modal run counts differ by population: 875 reviewed runs (H1), 870 runs in eval and smoke traces (D1 `hosts`), 876 in the ledger (D3).

We would not expect these results to carry over to a brief type outside the three sets, for a product without a rule engine that names refusals, or for the Meta Model API models, which have not been run.

## 7. Reproducibility, compute and disclosure

Code: `Otd-llc/hex-agent` at 6a79067 (visibility and license pending, O12). At that commit the Modal and Fireworks suite folders and every `rescore-*.json` are untracked, so those rows cannot yet be rebuilt from the repository (O15). Traces: `runs/suite-*/summary.json` and per-run `trace.json`, plus `rescore-<commit>.json` beside each summary. Commands:

```sh
node bin/index-suites.mjs --write          # docs/data/suite-index.md and .json
node bin/rescore.mjs <suite dir>           # current grader over a suite's traces
node bin/presentation-data.mjs --write     # docs/data/presentation.json (Tables A1, A2)
node bin/presentation-extra.mjs > docs/data/presentation-extra.json    # paired pairs, power, ranges (to merge into the above)
node bin/suite.mjs --model=<model> --purpose=eval --effort=low --briefs=evals/briefs.json,evals/briefs-hard.json,evals/briefs-wide.json --repeat=5
```

Spend from hackathon credits plus $30 of Modal account credit (D3): Baseten $94.32 ledger, Modal $105.01 billed (the ledger put endpoint time with no suite running at $26.35, H1), Fireworks $1.75 ledger, Meta $0. These include development, smoke, dead-end and discarded runs. Claude (Anthropic) drove 1,325 development and baseline runs (12,927 calls, $89.94) and 1,101 critic calls ($9.56), ledger $99.50; none is a result here.

Disclosure. Hex Cluster, its configurator, rules, collision gate, `window.hexAPI`, print packs and printable parts pre-existed and belong to One Thousand Drones; configurator changes during the event are One Thousand Drones' work. New for the event: the agent, browser bridge, checked tool layer, Meta model adapters, verification, abstention, grader, spend ledgers, suites and replay tool (first commit 2026-10-27). Nothing was trained; every change is to the agent's tools, prompt and guards. Claude models were development tools, and Claude agents ran the Modal failure review. This report was drafted with Claude from the data files, and its numbers were checked by script against them.

## Appendix A. Agent-evaluation checklist

| Item | Where |
|---|---|
| 1 Model as served, host, dates | 2.2 |
| 2 Effort, temperature | 2.2; temperature not recorded (O10) |
| 3 Agent commit, prompt, tools | Table A1; 2.1 |
| 4 Contract, page build | Table A1 |
| 5 Task sets, provenance, hash | 2.3; hash not in files read (O10) |
| 6 Held-out set | 2.3; not run |
| 7 Repeats and why | 2.3; five, reason not recorded (O10) |
| 8 Grader | 2.4 |
| 9 Honesty metric, worked example | 2.4 |
| 10 Grader errors and rescoring | 4.3; first scores in Table A1 |
| 11 Outcome validity, do-nothing score | 6; do-nothing not measured |
| 12 to 14 Intervals, pass^k, paired comparisons | 3.1, 3.2 |
| 15 By set | not broken out here; per-suite in D4 |
| 16, 17 Cost and calls per run, cost against pass rate | Table A1, 3.2 |
| 18 Failure taxonomy | 4.1 |
| 19 Host failures apart | 3.4 |
| 20 Effort as measured | 3.2 |
| 21 to 26 Honesty and scope | 5, 6, 7 |
| 27 to 30 Reproduction, logs, spend, AI assistance | 7 |

## References

Citations taken from the skill's source list and not re-opened in this drafting session; verify each before the report ships (O14).

- Brown, L. D., Cai, T. T. and DasGupta, A. (2001). Interval estimation for a binomial proportion. Statistical Science 16(2). https://projecteuclid.org/euclid.ss/1009213286
- Miller, E. (2024). Adding error bars to evals: a statistical approach to language model evaluations. https://arxiv.org/abs/2411.00640
- Yao, S. et al. (2024). tau-bench. https://arxiv.org/abs/2406.12045
