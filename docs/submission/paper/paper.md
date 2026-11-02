<!-- CLASSIFICATION: public -->
<!-- Claim ledger and data sources: ledger.md beside this file. Review by 2026-11-04. -->

# A Muse Spark 1.3 agent passes 14 of 18 held-out briefs in a live product configurator, checked by the product's rules and our code

hex-agent. Meta Global AI Developer Hackathon, Startup track, problem statement Push the Frontier. One Thousand Drones. Accurate as of 2026-11-02.

hex-agent takes a sentence and returns a build in One Thousand Drones' live Hex Cluster configurator: a share link, a parts list and a print pack made from the catalog's printable parts, a build that passes the configurator's placement and collision rules, and a statement of which requirements were met. On the frozen agent (git tag `eval-final`), Muse Spark 1.3 through the Meta Model API passed 14 of 18 held-out briefs (77.8%) on their one pre-committed run (Wilson 95% interval 54.8 to 91.0%): 11 builds, and 3 declines of briefs written to be refused. An agent that leaves the build as it finds it and reports the request unmet, or declines, passes 4 of those 18. On the 36 development briefs, run five times each, it passed 173 of 180 runs (clustered 95% interval 90.7 to 100%); that figure is optimistic, because we fixed failures on those briefs. Data files are labelled D1 to D8 and listed in the last section; short hashes name configurator releases and agent commits. Earlier, in seven effort-low, five-repeat batches that differ in host, configurator release and agent commit, Meta's open-weights Muse Spark Open passed 89.4 to 93.9% of runs on the development briefs; the models are reported apart and never pooled.

## What was built during the hackathon

Pre-existing, One Thousand Drones' product, not judged: Hex Cluster, its [configurator](https://hex.onethousanddrones.com/), placement rules, collision check, the public `window.hexAPI`, print packs, printable parts and plant and prop models, plus the configurator releases One Thousand Drones shipped during the event (every contract in Tables 1 and 2), some prompted by the agent's runs; they are product changes, excluded from the claimed work, and every result here ran on one of them. None of that source is in this repository, which holds a vendored copy of the public API contract and test fixtures.

Built during the hackathon, in this repository from its first commit (fb78560, 2026-10-27): the agent loop, browser bridge, checked tool layer, Meta model adapters, verification, honesty check, abstention, grader and rescoring, spend ledgers, evaluation suites, baselines and the replay tool. Nothing was trained. Claude (Anthropic) served as the agent's model in 1,325 debugging runs of the loop and appears in no reported result; every result here is a Meta model. HACKATHON_DELTA.md lists the pre-event product versions.

## Impact

Hex Cluster is modular 3D-printed hexagonal storage, and its existing browser-based parametric configurator already knows which parts fit where. hex-agent adds the step from a sentence such as "a patio bed for tomatoes and the plants that help them grow" to a valid build with a share link, a parts list, a print pack and a statement of which requirements were met, partly met or not met. That is the Push the Frontier claim: a manufacturing tool that took a person's clicks now takes their intent and returns a print pack the configurator accepts, with a report of which requirements it met; nothing has been printed yet, and its overclaims are measured in Table 1. It is built for makers who know what they want but not the part catalog. hex-agent extends the configurator with natural-language autonomous design and has so far been evaluated experimentally, as reported here. Customer-facing deployment in the configurator is planned; commercial adoption and usage metrics have not yet been established. We expect the pattern to carry to other manufactured products whose rule engine explains its refusals; we have tested one product.

## Use of Meta AI tooling

Three Meta models do the design work, measured apart: Muse Spark 1.3 and Muse Wonder 1.0 on the Meta Model API, and the open-weights Muse Spark Open on partner hosts. Muse Spark 1.3 ran through the Meta Model API (Standard mode, the API's reasoning-effort parameter set to low except in the medium-effort comparison): across its evaluation, held-out and smoke suites, 6,054 calls, 6,048 of them answered by `muse-spark-1.3` as named in each response (6 from the first test run predate that field), 92.7% of input tokens served from the prompt cache, 11 server errors, each followed by an answered call; median latency 4,951 ms, 95th percentile 13,798 ms (D1 `metaUse`, `hosts`). Muse Wonder 1.0, a second model on the same API, ran the 36 development briefs once each. The open weights of Muse Spark Open ran on three partner hosts: Baseten (`meta-models/muse-spark-open-1026`), a Modal Dedicated endpoint on 4 B300 GPUs, and Fireworks. Each model reads the build, asks where parts fit and places them through 17 tools over up to 30 turns, reading each refusal and the alternatives the configurator offers. Two capabilities beyond tool calling are measured: self-report (every requirement marked met, partial or unmet, with all-met claims checked) and abstention (declining a brief that would carry a child or hold fuel, or building only its safe part): with abstention on, six safety briefs passed 18 of 18 runs, against 10 of 18 with it off, on briefs the abstention prompt mostly names (below).

## Technical depth and execution

Each tool call is checked in code against the configurator's published API contract (a hash of that specification, one per release, identifies the configurator version a run used), then run through `window.hexAPI` in a real browser tab. A run passes when it ends in a build or a compromise (some requirements reported partial or unmet), the placement rules and mesh collision check pass, the print pack is produced, the share link reloads in a fresh tab with the same parts and parts list, and the brief's coded checks pass; a decline that leaves the build empty needs only a finish and no broken rule. A check that did not run counts as failed. A requirement with no coded check rests on the model's statement, and a "met" claim that uses listed strength, heat or food-safety terms fails the run (a keyword check), since the configurator checks fit only. A run is overclaimed when the model reports every requirement met and a brief check, placement rule or mesh check fails, so overclaim counts are lower bounds.

Four agent-side fixes, made after reading failures on the development briefs, are on by default from agent 1e98dbf onward (the frozen agent, Muse Wonder and the Fireworks row): fix 1 offers slide drawers on east- and west-facing half bases; fix 2 tells the model when a batch of operations was rolled back; fix 3 shows base groups and touching walls in the build summary; fix 4 sends an all-met finish back once when the configurator reports a rule or mesh error, so overclaim counts on those agents are measured with that guard on.

The 36 development briefs are three sets (12 core, 8 hard, 16 wide) written for the event, five of them honesty traps (briefs asking for something impossible or for a property the configurator cannot check, where the right answer reports it unmet). A separate set of 6 abstention briefs holds unsafe or infeasible requests and two controls. The 18 held-out briefs were committed (76e977d) before the last agent fixes and ran only on the frozen agent; two of their themes were written with fixes 1 and 3 in view. Our grader was wrong several times (report section 4.3); after each fix the development suites run before the Meta Model API were rescored from their traces with one grader (c7533b7), first scores kept beside them; the later Meta suites are scored as run, or (the first, at 56ef72c) rescored, by grading code unchanged since c7533b7. The held-out suites are scored as run and never rescored. Intervals are 95%: clustered by brief when briefs repeat (normal critical value at 30 or more briefs, t below 30; no interval is reported for fewer than 10 briefs), and Wilson over runs for one run per brief. A comparison is paired by brief and made only between runs that match in host, model, reasoning effort, contract, page build (the hash of the configurator's script bundle), agent commit and prompt, apart from the factor compared (fixes or abstention switched on or off); the one exception is the Muse Spark 1.3 effort pair below. Four paired comparisons are reported; further exploratory pairs (D2 `batchPairs`) are not. The smallest resolvable difference is the true difference a pair would detect with 80% power.

## Demo and results

Demo video: [not yet available: owner adds the link]. The video shows one run from a demo set of three planter briefs written for the video, five runs each, not an evaluation: the brief on screen, the model's own messages and tool calls, the configurator accepting and refusing placements, the checks, and the final build reloaded from its share link. The demo set passed 14 of 15 runs (D4); the owner chose the run shown from all 15: a strawberry tower (run 9329ae20), which is not one of the four runs with a hidden row described in Limitations (D8).

**Table 1.** Muse Spark 1.3 and Muse Wonder 1.0 on the frozen agent (`eval-final`, 0c840bc), Meta Model API, reasoning effort low, configurator contract da0834cc. 95% CI: clustered by brief for repeated rows (z at 36 briefs, t17 at 18), Wilson over runs for one-run rows. "All repeats": briefs whose every repeat passed. Overclaimed: a lower bound, measured with fix 4 on. $/run in tokens at list price. Sources: D1 `points` (p11), `heldout`, `wonder`.

| Set | Model | Passed | 95% CI | All repeats | Overclaimed | $/run |
|---|---|---|---|---|---|---|
| 36 development briefs ×5 | Muse Spark 1.3 | 173/180 (96.1%) | 90.7 to 100 | 34/36 | 7 | 0.057 |
| 18 held-out briefs ×1, pre-committed | Muse Spark 1.3 | 14/18 | 54.8 to 91.0 | n/a | 2 | |
| 18 held-out briefs ×4, decided after the ×1 (a) | Muse Spark 1.3 | 55/72 | | | | |
| held-out ×1 and ×4 together | Muse Spark 1.3 | 69/90 | 55.6 to 97.8 | 13/18 | 8 | |
| 36 development briefs ×1 | Muse Wonder 1.0 | 36/36 | 90.4 to 100 | n/a | 0 | 0.103 |

(a) The owner approved four more held-out repeats after seeing the 14/18. Passes by outcome (D1 `passedBy`): held-out ×1, 11 builds and 3 declines; development ×5, 147 builds, 24 compromises and 2 declines. The pooled interval is no narrower than the single run's: it is clustered by brief, and outcomes are nearly fixed per brief (13 briefs passed all five, four none), so 18 briefs, not 90 runs, set the precision. The ×1 stays the headline.

Read from the traces by hand: all seven development failures are overclaims, on two briefs, gap-drawer (a notch tray called a drawer) and same-corner-conflict (a drawer and spike claimed to share a corner the configurator forbids). Four held-out briefs failed every run: a cat ramp the agent built and called safe (the do-nothing agent passes it by declining), a "quiet, pretty" drawer that fails a keyword check, a 12-part limit the agent exceeded with 15, and a drawer-handle brief whose check looks for the handle under the wrong field. That last check is a grader defect found reading held-out traces; held-out checks are never edited, so both counts are reported: with the same correction the development set received in e196a37, the held-out results are 15/18 and 74/90 (D6). Its "same side" requirement has no coded check either way. Leaving out the two held-out briefs whose themes target fixes 1 and 3, the ×1 is 12/16 (Wilson 50.5 to 89.8%).

The do-nothing agent, scored by the same rules, passes 3 of 36 development, 4 of 18 held-out and 3 of 6 abstention briefs (D5), all by reporting the request unmet or declining on briefs built to be refused. A grader audit (D7, hand-tabulated by two fresh reviewers, not blinded) read one seeded passing run per development brief plus every pipe-planter pass: 4 of the 36 audited briefs had a false pass (Wilson over briefs 4.4 to 25.3%; pipe-planter's was in one of its five audited runs), and 2 more were unsure. All are relations the grader does not check: a pipe that never reaches the raised planters, wall hangers that no single flat wall can reach together (two briefs), and a vent left under a cap. The audit covered development briefs only; held-out passes were not audited.

With fixes 1 to 4 switched off, on the 13 briefs they target, five runs each: fixes off 63/65, fixes on 65/65, off minus on −3.1 points (95% CI −7.6 to 1.5, t12, paired; smallest resolvable difference 6.3 points), not distinguishable. The fixes-on arm was at ceiling, so this design can show harm and cannot show gain, and the arms ran hours apart (D2 `metaFixesOff`). With abstention on, six safety briefs passed 18 of 18 runs; with it off, 10 of 18 (D2 `metaAbstention`). Per brief only: the difference is on the toddler step (3/3 against 0/3), the petrol caddy (3/3 against 1/3) and the solder station (3/3 against 0/3), briefs the abstention prompt names; the moving clock, which it does not name, passed in both arms. Switching abstention off also removes the "declined" outcome, a second confound.

**Table 2.** Muse Spark Open, the earlier model, on the 36 development briefs, effort low unless marked, earlier agent commits and releases; counts are of completed runs. 95% CI clustered by brief for ×5 rows (z), Wilson over runs for ×1 rows. "All 5": briefs whose five repeats all passed. Overclaimed: a lower bound; the Fireworks row ran with fix 4 on. $/run is token-equivalent (Modal bills GPU time). ~: inferred from git time, treated as unknown. Sources: D1 `points` and `effort`, D4.

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

(a) Core and hard sets on ~1708c03, wide set on ~3627cd4. (b) Honesty-only briefs left out. (c) 5 of 36 runs lost to host hangs and left out (31/36 if counted as failures).

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
11-02 Meta API x5                       |----------#-------|  96.1
                   +.........+.........+.........+.........+
                   80        85        90        95       100
```

**Figure 1.** Development-set pass rate per effort-low batch, in run order, with 95% intervals: # a five-repeat batch (36 briefs, clustered by brief), o a one-run batch (31 or 36 runs, Wilson over runs). Rows stay unjoined because host, release, agent commit or model changes between them. The last two rows are Muse Spark 1.3 on the Meta Model API: a first one-run batch on an earlier agent (56ef72c, 35/36) and the frozen agent (Table 1); every other row is Muse Spark Open. The held-out set is in Table 1, not here. Drawn from D1 `points`.

On one host, release and agent commit (Modal, 7b9b48a), high reasoning effort against low was not distinguishable at this n (+1.1 points, 95% CI −2.7 to 4.9, 36 briefs, paired, r = 0.77; smallest resolvable difference 5.4 points), at 2.35 times the token-equivalent cost per run (about 1.47 times by billed GPU time, hand-tabulated in H1). For Muse Spark 1.3, medium against low on 36 briefs once each was not distinguishable either (0.0 points, 95% CI −7.8 to 7.8, paired, r = −0.03), a rough bound resting on two briefs that differed; one medium run lost to a harness error was rerun; its arms ran on agents 56ef72c and ab0bfe4, which differ only in a data generator the agent does not run, the one exception to the comparison rule. Low stays the default.

## Limitations and what was not run

- Development-set rates for the 36 briefs: briefs, checks and guards changed after we read failures on them; two of the 36 and five of the six abstention briefs are named in the prompt. The held-out set ran once pre-committed, then four more times after that result was seen, and two of its themes were written with fixes in view.
- One product and our own grader, reviewed by no third party. The audit found false passes on 4 of 36 audited briefs, all on relations between parts; the checks count parts and plants, not what a viewer sees. In 4 of the 15 demo runs the agent put the tall row nearest the configurator's default camera, hiding the low row, and in three of those its report marked the row order as met; every coded check passed in those three (D4 counts, D8 hand-tabulated).
- No build was printed or assembled in this evaluation; "valid" means valid in the configurator.
- Muse Wonder 1.0 ran once per brief, a descriptive rate. Muse Spark Open and Muse Spark 1.3 differ in model, host, release and agent commit, so no difference between them is claimed.
- The demo traces record the tree as dirty: two reporting files (not agent code) were edited after the demo suite loaded its modules; the agent code that ran is identical to `eval-final`.

## Reproduce, spend and disclosure

Repository `Otd-llc/hex-agent`, main branch at submission (commit recorded in the submission; [public URL and full report link: not yet available]). Every suite folder (traces, summaries and rescore files) is committed under `runs/`; run screenshots are in the GitHub release `runs-2026-11-02`. Rebuild in this order: D4 `docs/data/suite-index.md` (`node bin/index-suites.mjs --write`, which also reads the hand-classified `docs/data/suite-classes.json`), then D1 `docs/data/presentation.json` (`node bin/presentation-data.mjs --write`), then D2 `docs/data/presentation-extra.json` (`node bin/presentation-extra.mjs --write`). D5 `docs/data/do-nothing.json` (`node bin/do-nothing.mjs --write`) needs a browser and the live configurator; it was measured on contract da0834cc, and a later release may score differently. D6 is `docs/data/heldout-handle-alt.json` (`node bin/heldout-handle-alt.mjs --write`). D7 `docs/data/grader-audit.json` (seed and runs listed) and D8 `docs/data/demo-review.json` (the 15 demo runs, suite 2026-11-02T18-42-02-972Z) are reviewer verdicts, hand-tabulated. H1 `docs/plans/2026-11-02-modal-review.md` and H2 `EVALUATION.md` are hand-written. Spend, including development and discarded runs, from our token ledgers (`.spend/`, not published; totals in D4 `reconcile`): Meta Model API $32.12 (both models, every purpose, 497 runs), Baseten $94.32 (1,690 runs), Fireworks $1.75 (39 runs; its token ledger, which may differ from the bill), Claude $89.94 for 1,325 development runs. Owner-attested from our facts registry D3 (outside the repository): Modal $105.01 (GPU time, billed; 876 runs) and $9.56 of Claude critic calls. This paper was drafted with Claude; numbers from the generated data files were checked by script, and hand-tabulated ones by hand.
