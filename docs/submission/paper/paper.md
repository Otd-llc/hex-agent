<!-- CLASSIFICATION: public -->
<!-- Claim ledger: green-ledger.md. Numbers: docs/data/presentation.json (D1), docs/data/presentation-extra.json (D2), facts-compute-2026-11-02.yaml (D3), docs/data/suite-index.md (D4). Review by 2026-11-04, after the Meta Model API demo runs. -->

# A Muse Spark Open agent passes 89 to 94% of runs on 36 design briefs in a live product configurator, graded by code

hex-agent, Meta Global AI Dev Hackathon, Indie track. One Thousand Drones. Accurate as of 2026-11-02.

## Problem and claim

An agent that edits a real product can be judged by that product. hex-agent puts Meta's open-weights Muse Spark Open in front of the live Hex Cluster configurator through the same public browser API a customer's script would use, lets the configurator accept or refuse every change by its own rules, and then checks the model's account of what it built against the build. In seven batches of the same 36 design briefs, five runs each, the agent passed 89.4 to 93.9% of runs per batch, and in 3.3 to 6.1% of runs it reported every requirement met while a check failed. No difference between batches is distinguishable at this sample size.

## What it does

You give hex-agent a brief such as "a planter of four cells with a water pipe running through the bases to feed every cell". The model works in the [Hex Cluster configurator](https://hex.onethousanddrones.com/), One Thousand Drones' browser tool for modular 3D-printed hexagonal storage. It calls 16 tools; each call is checked in code against the configurator's published contract (its API description), then run through the documented `window.hexAPI` in a real browser tab. A refusal comes back with the configurator's code and the alternatives it would accept. The run ends with a share link, a parts list, a print pack (the printable files for the build) and the model's statement of which requirements it met. Demo video: [not yet available: owner adds the link].

## How we built and measured it

A run passes when the configurator's placement rules and mesh collision check pass, the parts list and print pack are produced, the share link rebuilds the same design in a fresh tab, and the brief's own coded checks pass. Those coded checks count what a brief asks for (drawers, bins, a pipe run, a part family); a requirement with no coded check rests on the model's own statement. The configurator checks fit only, so a "met" claim about strength, materials, heat or food safety fails the run. A run is flagged overclaimed when the model reports every requirement met and a check fails, so the overclaim rate is a lower bound: a false "met" beside an honest "unmet" is not counted.

The 36 briefs are three fixed sets (12 core, 8 hard, 16 wide), written for the event; five are honesty traps, such as "mark everything met". Each batch ran every brief five times at reasoning effort low with a 30-turn budget, on Baseten (`meta-models/muse-spark-open-1026`), a Modal Dedicated endpoint (4 B300 GPUs) and Fireworks serverless, from 2026-10-27 to 2026-11-02. Every suite was rescored from its traces with one grader (rescore files c7533b7, grading logic a914d49), first scores kept. Intervals are 95%: clustered by brief for five-repeat batches, because repeats of one brief are correlated, and Wilson for one-run batches. Comparisons are paired differences per brief.

## Results

Table 1 has one row per batch, because batches differ in host, configurator release or agent commit; the 10-31 batch itself spans two inferred agent commits. The five-repeat pass rates range from 89.4 to 93.9%, and every one of their intervals overlaps every other. The first and last batch differ by 0.0 points (95% CI −6.2 to 6.2, 36 briefs, paired, r = 0.61); that is one of eight batch pairs looked at after the fact, so it is exploratory, and these pairs could only resolve differences of 4.1 to 9.5 points. Consistency is lower than the mean: 25 to 29 of the 36 briefs passed all five repeats.

**Table 1.** Muse Spark Open on the 36 briefs, effort low unless marked. Passed and overclaimed are counts of completed runs. 95% CI clustered by brief for ×5 rows, Wilson for ×1 rows. "All 5": briefs whose five repeats all passed. Cost is token-equivalent per run (Modal bills GPU time). ~ marks a value inferred from git time. Sources: D1, D2, D4.

| Batch | Host | Contract | Agent | Passed | 95% CI | All 5 | Overclaimed | $/run |
|---|---|---|---|---|---|---|---|---|
| 10-27 ×5 | Baseten | ~2b45909b | ~63469da | 163/180 (90.6%) | 83.5 to 97.6 | 27/36 | 11 (6.1%) | 0.038 |
| 10-31 ×5 | Baseten | d2fd3dad | ~1708c03, ~3627cd4 | 165/180 (91.7%) | 85.5 to 97.8 | 28/36 | 6 (3.3%) | 0.054 |
| 11-01 ×5 | Baseten | 238e6282 | ~dc65686 | 161/180 (89.4%) | 82.4 to 96.5 | 27/36 | 8 (4.4%) | 0.057 |
| 11-01 ×5 | Baseten | 76ea6455 | ~e275786 | 164/180 (91.1%) | 84.1 to 98.2 | 29/36 | 7 (3.9%) | 0.054 |
| 11-01 ×1, 31 briefs (a) | Baseten | 08e63fab | 83f3748 | 30/31 (96.8%) | 83.8 to 99.4 | n/a | 1 (3.2%) | 0.056 |
| 11-02 ×5 | Modal | 08e63fab | 6760826 | 161/180 (89.4%) | 82.7 to 96.2 | 25/36 | 10 (5.6%) | 0.043 |
| 11-02 ×5 | Modal | 08e63fab | 7b9b48a | 169/180 (93.9%) | 88.8 to 99.0 | 29/36 | 9 (5.0%) | 0.045 |
| 11-02 ×5, effort high | Modal | 08e63fab | 7b9b48a | 171/180 (95.0%) | 89.1 to 100 | 32/36 | 7 (3.9%) | 0.105 |
| 11-02 ×5 | Modal | 08e63fab | 7d970de | 163/180 (90.6%) | 83.5 to 97.6 | 27/36 | 10 (5.6%) | 0.044 |
| 11-02 ×1 (b) | Fireworks | 87827f4d | 1e98dbf | 31/31 (100%) | 89.0 to 100 | n/a | 0 | 0.043 |

(a) The five honesty-only briefs left out. (b) 5 of 36 runs lost to host hangs and left out of the rate; this agent had four untested fixes switched on.

Reasoning effort made no distinguishable difference where the comparison is like with like. On the same host, site and agent commit, high against low was not distinguishable at this n (difference +1.1 points, 95% CI −2.7 to 4.9, 36 briefs, paired, r = 0.77; smallest resolvable difference 5.4 points), and high cost 2.35 times as much per run in tokens (1.47 times on an estimated GPU-time basis). An earlier Baseten ablation on 20 briefs is also not distinguishable (−11.7 points, −26.9 to 3.5, r = −0.12). Low stays the default.

On six safety briefs (a toddler step, a petrol caddy, a moving clock, a solder station, and two controls that must be built), three runs each, the arm with the abstention instruction on passed 17/18 against 7/18 with it off (+55.6 points, 95% CI 15.4 to 95.7, 6 briefs, paired; a normal interval is rough at 6 briefs). Five of the six briefs are named in the prompt, the unnamed moving clock was the one failure with abstention on, and the two arms may differ in agent commit, so this is evidence the instruction works on what it names.

## What failed and what we learned

Every failed trace from the Modal window was read and given one cause by hand. That window held 66 failures in 875 runs across 12 suites (the 36 briefs plus demo, safety and dressing sets, both efforts, three agent commits), counted under the grader then in use. The largest classes were a two-clusters topology brief (18, model), drawers on east or west half bases that the agent never asked for in the slide style (16, agent) and a drawer and spike claimed to share a corner the configurator does not allow (10, model). In 17 of the 18 two-clusters failures and all 10 same-corner failures the model claimed the requirement met. We read these 28 as the agent's clearest honesty gap: it claims a spatial relation the build lacks.

Our grader was wrong too. Reading flagged traces found errors in our own briefs and checks (an arbitrary bin count, two infeasible wordings, disclaimers read as claims, a handle check that missed bolted handles); each was fixed and every suite rescored, which lowered the five-repeat batches by 0 to 9 passes each. Agent runs also surfaced configurator gaps that One Thousand Drones fixed in its own product.

## Limitations

- Tuned on the test set. The 18 held-out briefs have not been run; nine briefs are named in the prompt; briefs, checks and agent guards were changed after reading failures on these same 36 briefs. No do-nothing baseline was scored.
- One product, our own grader, 36 briefs; where a brief has no coded check, a pass rests on the model's statement, and no third party has reviewed the checks.
- The Meta Model API has not been called yet; every result here is Muse Spark Open on Baseten, Modal or Fireworks.

## Reproduce, spend and disclosure

Repository `Otd-llc/hex-agent` at 6a79067 ([public URL and full report link: not yet available]). Each `runs/suite-*` folder holds `summary.json` and a `trace.json` per run, and `node bin/presentation-data.mjs --write` regenerates Table 1 from them; the paired figures come from a companion script still to be merged into it. The Modal and Fireworks suite folders and the rescore files are not yet committed, so those rows cannot yet be rebuilt from the repository.

Spend, by what each host bills: Baseten $94.32 (ledger, 1,690 runs), Modal $105.01 (billed, 876 runs), Fireworks $1.75 (ledger, 39 runs; the bill may be higher because hung calls returned no usage), Meta $0. These include development, smoke and discarded runs, and came from hackathon credits, plus Modal account credit.

Hex Cluster, its configurator, rules, collision check, API and print packs existed before the event and belong to One Thousand Drones; configurator fixes during the event are its work. The agent, browser bridge, checked tool layer, verification, abstention, grader and evaluation are the event work. Nothing was trained: every change is to the agent's tools, prompt and guards, or to the configurator. Claude models (Anthropic) drove 1,325 development runs ($89.94, plus $9.56 of critic calls) and appear in no result here. This paper was drafted with Claude and its numbers checked against the data files by script.
