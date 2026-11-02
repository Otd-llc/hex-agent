<!-- CLASSIFICATION: public -->
<!-- Claim ledger and data sources: ledger.md beside this file. Review by 2026-11-04. -->

# A Muse Spark Open agent passes 89 to 94% of runs per batch on 36 development briefs in a live product configurator, checked by the product's rules and our code

hex-agent. Meta Global AI Developer Hackathon, Startup track, problem statement Push the Frontier. One Thousand Drones. Accurate as of 2026-11-02.

hex-agent lets Meta's open-weights Muse Spark Open design hardware in One Thousand Drones' live Hex Cluster configurator: builds that pass the configurator's placement and collision rules, made from its catalog of printable parts, with a statement of which requirements were met. In seven effort-low batches of the 36 briefs, five runs per brief, the agent passed 89.4 to 93.9% of runs per batch and overclaimed in 3.3 to 6.1% (a lower bound). None of eight exploratory batch comparisons is distinguishable at this n. Muse Spark 1.3, Meta's hosted model, passed 35 of 36 briefs through the Meta Model API in one run each (Wilson 85.8 to 99.5%); it is a different model on a later release, shown beside those batches, never pooled or compared with them. These are development-set rates: the same briefs were used to find and fix failures.

## What was built during the hackathon

One Thousand Drones' existing product, before the event (2026-10-27): Hex Cluster, its [configurator](https://hex.onethousanddrones.com/), placement rules, collision check, the public `window.hexAPI`, print packs and printable parts; none of that source is in this repository, which holds a vendored copy of the public API contract and test fixtures. The configurator releases One Thousand Drones shipped during the event (every contract in Table 1), some prompted by the agent's runs, are product work outside this repository, not claimed for judging; every result here ran on them. Built during the hackathon in this repository, from its first commit (fb78560, 2026-10-27): the agent loop, browser bridge, checked tool layer, Meta model adapters, verification, honesty check, abstention, grader and rescoring, spend ledgers, evaluation suites and replay tool. Nothing was trained. HACKATHON_DELTA.md lists the pre-event product versions.

## Impact

Hex Cluster is modular 3D-printed hexagonal storage, and the configurator already knows which parts fit where. hex-agent adds the step from a sentence such as "a planter of four cells with a water pipe running through the bases to feed every cell" to a valid build with a share link, a parts list, a print pack and a statement of which requirements were met, partly met or not met. It is built for makers who know what they want but not the part catalog. We expect the pattern to carry to other manufactured products whose rule engine explains its refusals; we have tested one product, and use by real customers is not yet measured.

## Use of Meta AI tooling

Two Meta models do the design work, measured apart. The open weights of Muse Spark Open ran on three partner hosts: Baseten (`meta-models/muse-spark-open-1026`), a Modal Dedicated endpoint on 4 B300 GPUs, and Fireworks. Muse Spark 1.3 ran through the Meta Model API (`muse-spark-1.3`, Standard mode), which answered every call (median 5,359 ms, 95th percentile 15,081 ms over its timed suites). Either model reads the build, asks where parts fit and places them through 17 tools (in the current agent) over up to 30 turns, reading each refusal and the alternatives the configurator offers. Two capabilities beyond tool calling are measured below: self-report (both models; every requirement marked met, partial, unmet or unverified, with all-met claims checked) and abstention (Muse Spark Open only; with a prompt block that names most of the test briefs, declining a brief that would carry a child or hold fuel, or building only its safe part).

## Technical depth and execution

Each tool call is checked in code against the configurator's published API contract, then run through `window.hexAPI` in a real browser tab. A run passes when it ends in a build or a compromise (some requirements reported partial, unmet or unverified, with no code confirming they were unbuildable), the placement rules and mesh collision check pass, the print pack is produced, the share link reloads in a fresh tab with the same parts and parts list, and the brief's coded checks pass; a decline that leaves the build empty needs only a finish and no broken rule. A check that did not run counts as failed. A requirement with no coded check rests on the model's statement, and a "met" claim that uses listed strength, heat or food-safety terms fails the run (a keyword check), since the configurator checks fit only. A run is overclaimed when the model reports every requirement met and a brief check, placement rule or mesh check fails, so that rate is a lower bound.

The 36 briefs are three sets (12 core, 8 hard, 16 wide) written for the event, five of them honesty traps; a few were reworded between batches. Batches ran at effort low, except one high and one medium batch, with a 30-turn budget from 2026-10-27 to 2026-11-02. Our grader was wrong several times (report section 4.3); after each fix every suite was rescored from its traces with one grader (c7533b7), first scores kept beside them in the data files, for a net 0 to 9 fewer passes per five-repeat batch (some fixes loosened a check). The later Meta Model API suites were scored as run, by grader code unchanged since c7533b7. Intervals are 95%, clustered by brief when briefs repeat and Wilson over runs for one run per brief. A comparison that attributes a difference to one factor is paired by brief and made only between runs sharing every other key field (host, model, effort, contract, page build, agent commit), with one stated exception below.

## Demo and results

Demo video: [not yet available: owner adds the link].

Table 1 and Figure 1 show one row per batch, because batches differ in host, configurator release, agent commit or model; the Baseten ×5 rows each join three suites whose agent commits were not recorded. Strict pass, which also needs every requirement reported met (honesty-trap briefs: pass alone), ran 86.7 to 90% per effort-low five-repeat batch, and 25 to 29 of the 36 briefs passed all five repeats in those batches. Eight batch pairs, chosen after seeing the data, were compared as exploratory checks, and none is distinguishable at this n; they could resolve only differences of 4.1 to 9.5 points. Six differ in several key fields at once and attribute nothing. Two share host, release and effort and differ only in a guards-only agent commit: +4.4 points (95% CI −0.5 to 9.4, 36 briefs, paired) and −3.3 (−7.9 to 1.2).

**Table 1.** Muse Spark Open on the 36 briefs, effort low unless marked, and in the last row Muse Spark 1.3, a different model; counts are of completed runs. 95% CI clustered by brief for ×5 rows, Wilson over runs for ×1 rows. "All 5": briefs whose five repeats all passed. $/run is token-equivalent (Modal bills GPU time). Contract: hash of the configurator's published API contract, one per release. ~: inferred from git time, treated as unknown. Sources: D1 `points` and `effort`, D4.

| Batch | Host | Contract | Agent | Passed | 95% CI | All 5 | Overclaimed | $/run |
|---|---|---|---|---|---|---|---|---|
| 10-27 ×5 | Baseten | ~2b45909b | ~63469da | 163/180 (90.6%) | 83.5 to 97.6 | 27/36 | 11 (6.1%) | 0.038 |
| 10-31 ×5 (a) | Baseten | d2fd3dad | ~1708c03, ~3627cd4 | 165/180 (91.7%) | 85.5 to 97.8 | 28/36 | 6 (3.3%) | 0.054 |
| 11-01 ×5 | Baseten | 238e6282 | ~dc65686 | 161/180 (89.4%) | 82.4 to 96.5 | 27/36 | 8 (4.4%) | 0.057 |
| 11-01 ×5 | Baseten | 76ea6455 | ~e275786 | 164/180 (91.1%) | 84.1 to 98.2 | 29/36 | 7 (3.9%) | 0.053 |
| 11-01 ×1, 31 briefs (b) | Baseten | 08e63fab | 83f3748 | 30/31 (96.8%) | 83.8 to 99.4 | n/a | 1 (3.2%) | 0.056 |
| 11-02 ×5 | Modal | 08e63fab | 6760826 | 161/180 (89.4%) | 82.7 to 96.2 | 25/36 | 10 (5.6%) | 0.042 |
| 11-02 ×5 | Modal | 08e63fab | 7b9b48a | 169/180 (93.9%) | 88.8 to 99.0 | 29/36 | 9 (5.0%) | 0.044 |
| 11-02 ×5, effort high | Modal | 08e63fab | 7b9b48a | 171/180 (95.0%) | 89.1 to 100 | 32/36 | 7 (3.9%) | 0.105 |
| 11-02 ×5 | Modal | 08e63fab | 7d970de | 163/180 (90.6%) | 83.5 to 97.6 | 27/36 | 10 (5.6%) | 0.044 |
| 11-02 ×1 (c) | Fireworks | 87827f4d | 1e98dbf | 31/31 (100%) | 89.0 to 100 | n/a | 0 | 0.043 |
| 11-02 ×1 (d) | Meta Model API | da0834cc | 56ef72c | 35/36 (97.2%) | 85.8 to 99.5 | n/a | 1 (2.8%) | 0.052 |

(a) Core and hard sets on ~1708c03, wide set on ~3627cd4, so pairs with this row pool two commits. (b) Honesty-only briefs left out. (c) 5 of 36 runs lost to host hangs and left out (31/36 if counted as failures, a lower bound since the lost runs may not be typical); four agent fixes were on, one returning a failed check to the model before its finish is scored. (d) Muse Spark 1.3, not Muse Spark Open. Its one failure, gap-drawer, is an overclaim: a notch tray called a drawer (H2).

```
                   pass rate, % of completed runs (axis starts at 80)
10-27 Baseten x5          |-------------#-------------|       90.6
10-31 Baseten x5              |-----------#------------|      91.7
11-01 Baseten x5        |-------------#-------------|         89.4
11-01 Baseten x5           |-------------#-------------|      91.1
11-01 Baseten x1           |-------------------------o----|   96.8
11-02 Modal x5          |-------------#------------|          89.4
11-02 Modal x5                       |---------#---------|    93.9
11-02 Modal x5            |-------------#-------------|       90.6
11-02 Fireworks x1                   |---------------------o  100
- - - - - - Muse Spark 1.3 below: a different model, not compared - - - -
11-02 Meta API x1              |---------------------o----|   97.2
                   +.........+.........+.........+.........+
                   80        85        90        95       100
```

**Figure 1.** Pass rate per effort-low batch, in run order, with 95% intervals: # a five-repeat batch (36 briefs, clustered by brief), o a one-run batch (31 or 36 runs, Wilson over runs: one run per brief leaves nothing to cluster). Rows stay unjoined because host, release, agent commit or model changes between them; the last row is Muse Spark 1.3 on the Meta Model API, every other row Muse Spark Open. Drawn from D1 `points`.

On one host, release and agent commit (Modal, 7b9b48a), high reasoning effort against low was not distinguishable at this n (+1.1 points, 95% CI −2.7 to 4.9, 36 briefs, paired, r = 0.77; smallest resolvable difference 5.4 points). Mean cost per run was 2.35 times as high in token-equivalent dollars and about 1.5 times on an estimated GPU-time basis (hand-tabulated in H1). Modal did not echo the effort setting back. On the Meta Model API (Muse Spark 1.3, one release), the arms ran on agent commits 56ef72c and ab0bfe4, which differ only in documents, data files and a data generator the agent does not run; we treat that as the one exception to the key. Medium against low was not distinguishable either (0.0 points, 95% CI −7.8 to 7.8, 36 briefs ×1, paired, r = −0.03), at $0.075 against $0.052 per run in tokens; one medium run whose page never loaded, a harness error, was left out and rerun. Low stays the default for both models.

Six abstention briefs (unsafe: a toddler step, a petrol caddy, a solder station; infeasible: a moving clock; two controls that must be built) ran three times each on Baseten, back to back on one contract. With the abstention feature off (no prompt block, no "declined" finish outcome) the agent passed 7/18, none on the step, caddy or solder station; with it on, 17/18, the one failure on the moving clock, the only brief the prompt block does not name. The arms' agent commits are inferred from git time and differ (~3460cd6, ~826848e), so they are side by side, unpaired and, at six briefs, without an interval.

Every failed trace from the Modal window got a main cause (hand-tabulated in H1, under the grader then in use; classes overlap in a few runs): 66 failures in 875 runs. The largest: a two-clusters topology brief (18, model; 1 a grader false negative), drawers on half bases the agent never offered as slide drawers (16, agent), and a drawer and spike claimed to share a corner the configurator forbids (10, model). The model claimed the requirement met in 17 of the 18 two-clusters failures and all 10 same-corner ones; we read both as one honesty problem, a claimed spatial relation the build lacks.

## Limitations and what was not run

- Development-set rates. The 18 held-out briefs have not been run; at the Modal-window commit two of the 36 briefs and five of the six abstention briefs are named in the prompt; briefs, checks and guards changed after we read failures on these briefs. No do-nothing baseline was scored.
- One product and our own grader, reviewed by no third party. Known false passes remain: warning-level issues such as a base over an empty cell do not fail a run, and the pipe-planter check (the Impact example) does not confirm the pipe reaches every cell, for either model (H1 estimated its Modal passes at about 18 of 20 falling to 10 of 20 with that check; hand-tabulated, check not built).
- No build was printed or assembled in this evaluation; "valid" means valid in the configurator.
- Muse Spark 1.3 ran once per brief on one release, a descriptive rate; its model, host, release and agent commit all differ from every Muse Spark Open row, so no difference between them is claimed.

## Reproduce, spend and disclosure

Repository `Otd-llc/hex-agent`, main branch at submission (commit recorded in the submission; [public URL and full report link: not yet available]). D1 `docs/data/presentation.json` and D2 `docs/data/presentation-extra.json` are rebuilt from the `runs/suite-*` traces by `node bin/presentation-data.mjs --write` and `node bin/presentation-extra.mjs --write`; D4 is `docs/data/suite-index.md`, H1 `docs/plans/2026-11-02-modal-review.md`, H2 `EVALUATION.md` (both hand-written), D3 our facts registry over the `.spend/` ledgers. The Modal, Fireworks and Meta Model API suites and the rescore files are not yet committed. Spend, including development and discarded runs: Baseten $94.32 (token ledger, 1,690 runs), Modal $105.01 (GPU time, billed; 876 runs in the ledger), Fireworks $1.75 (token ledger, 39 runs; the bill may be higher); the Meta Model API total is in its token ledger (`.spend/meta.jsonl`), with cost per run in Table 1. Claude models (Anthropic) drove 1,325 development runs ($89.94, plus $9.56 of critic calls) and appear in no result. This paper was drafted with Claude; numbers from the generated data files were checked by script, and hand-tabulated ones (H1, H2 and the per-brief abstention scores) by hand.
