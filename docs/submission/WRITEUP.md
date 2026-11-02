# hex-agent: a Muse agent that builds real Hex Cluster designs (submission draft)

Updated 2026-11-02. The results write-up is
[paper/paper.md](paper/paper.md) (claim ledger beside it, technical report in
[paper/report.md](paper/report.md)); every figure below is copied from it.
Slots marked `________` are filled after the Meta Model API demo runs.

## What it does

You give it a design brief in plain language, for example "a planter of four
cells with a water pipe running through the bases to feed every cell". A
Meta Muse model builds it in the live
[Hex Cluster configurator](https://hex.onethousanddrones.com/), the browser
tool for One Thousand Drones' modular 3D-printed hexagonal hardware. The
agent reads the build, asks the configurator where parts fit, places them,
reads every acceptance or refusal, and revises. It ends with a share link,
a parts list and a print pack, produced by the configurator, plus a
statement of which requirements it met, partly met or could not meet.

## How it works

- **The model chooses; the configurator's rules and our code decide.**
  Muse calls 17 tools in the current agent (`get_build`, `find_sockets`,
  `apply`, `check_build`, `finish`, ...). Each call is checked in code
  against the configurator's published contract, then run through the
  documented `window.hexAPI` in a real browser tab (Playwright). Refusals
  come back with the configurator's own code, message and the alternatives
  it would accept.
- **Verification runs in code.** At the end, code runs the placement rules,
  the mesh-collision gate, the parts list, the print pack, the brief's coded
  checks, and reloads the share link in a fresh tab. A run passes only if
  every check passes; a check that did not run counts as failed. A
  requirement with no coded check rests on the model's own statement.
- **Honesty is checked where code can check it.** The configurator checks
  fit only, so a "met" claim that uses listed strength, materials, heat or
  food-safety terms fails the run (a keyword check). Every requirement the
  brief states must be listed, including the ones it could not do.
- **It can say no.** A brief that would carry a child's weight, hold fuel
  or heat, restrain a person or animal, or serve as a weapon is declined,
  or only its safe part is built, with the rest reported unmet.
- **Spend is guarded.** Every model call is priced and ledgered. Development
  and evaluation runs stop before they reach the credit kept for the demo
  and judging.

## Results

All on the live configurator, Muse Spark Open (Meta open weights) on
Baseten, Modal or Fireworks. These are development-set rates: the same
briefs were used to find and fix failures, and the 18 held-out briefs have
not been run. Intervals are 95%, clustered by brief for five-repeat batches.
One row per batch is in the paper's Table 1, because batches differ in host,
configurator release or agent commit; no rate below pools them.

| What | Result |
|---|---|
| 36 briefs ×5, seven effort-low batches | 89.4 to 93.9% of runs passed per batch; overclaimed (every requirement reported met while a check failed, a lower bound) in 3.3 to 6.1%; 25 to 29 of the 36 briefs passed all five repeats |
| One of those batches, live release d2fd3dad (Baseten) | 165/180 (91.7%, 95% CI 85.5 to 97.8) |
| Eight exploratory batch pairs | none distinguishable at this n |
| Effort high against low (Modal, one agent commit, 36 briefs ×5) | 171/180 against 169/180: +1.1 points (95% CI −2.7 to 4.9, paired), not distinguishable; 2.35 times the token-equivalent cost per run |
| Abstention, six safety briefs ×3 (Baseten) | on 17/18, off 7/18; side by side, unpaired, because the arms ran on different inferred agent commits; five of the six briefs are named in the prompt |
| One-run batches | Baseten control, 31 briefs: 30/31; Fireworks, 36 briefs: 31/31 of the runs that finished (5 lost to host hangs and left out) |
| Honesty and injection briefs ×5, dated 2026-10-27 (contract 2b45909b, older agent) | 35/35, an earlier measure |
| Muse Spark 1.3, Meta Model API, frozen agent `eval-final`: 36 briefs ×5 | 173/180 (clustered 95% CI 90.7 to 100); all 7 failures overclaims |
| Same, 18 held-out briefs, one pre-committed run each | 14/18 (Wilson 95% CI 55 to 91); four more repeats decided after this result: 69/90 pooled (clustered t17 CI 56 to 98) |
| Same, fixes 1 to 4 switched off, their 13 briefs ×5 (harm test) | 63/65 against 65/65 with them on: −3.1 points (t12 CI −7.6 to 1.5), not distinguishable; the design can show harm, not gain |
| Same, abstention on against off, six safety briefs ×3 | on 18/18, off 10/18, per brief only; the difference is on the five briefs the prompt names |
| Muse Wonder 1.0, Meta Model API, 36 briefs ×1 | 36/36, its own row |

What the evaluation taught us:
- **Our own checks were wrong several times.** Reading flagged traces
  before counting them found an infeasible brief wording, disclaimers read
  as claims (twice), a missed bolted handle and a search tool that needed
  every word ("louvre vent grate" found nothing). Each was fixed and every
  suite rescored from its traces with one grader, first scores kept beside
  the rescores.
- **Low effort stays the default because it is cheaper.** High effort was
  not distinguishable from low on one agent commit (above). An earlier
  Baseten ablation (20 briefs ×3) gave low 58/60 and high 51/60, on agent
  commits only inferred from git time, so it is reported side by side with
  no paired difference.
- **Without the abstention block, Muse built the unsafe thing.** With it
  off, the agent built the toddler step in all three runs; with it on, the
  step was declined every time.
- **Two of the three largest failure classes are claimed spatial
  relations the build lacks** (two clusters, same corner): in the Modal
  window's failure review (hand-tabulated) we read them as one honesty
  problem.
- **Agent runs found configurator gaps.** They were reported to the
  configurator team, which fixed them in its own repo. One example: bins
  colliding with a pipe coupling now get a named refusal.

## What is new and what is not

Hex Cluster, its configurator, rules, collision gate, browser API, catalog
and print packs existed before the event and belong to One Thousand Drones.
The configurator releases shipped during the event are One Thousand Drones'
work too and are not claimed. This repository is the event work: the agent,
the browser bridge, the checked tool layer, the Meta model adapters,
verification, abstention, the grader and rescoring, the spend ledgers, the
evaluation suites and the replay tool. See
[HACKATHON_DELTA.md](../../HACKATHON_DELTA.md) for every release, file and
commit. Latest release synced here: contract `da0834cc` (deploy 15b, viz
`d726540`).

## Honest limits

Most rates are development-set rates; the held-out set ran once
pre-committed (14/18), then four more times after that result was seen,
and two of its themes were written with fixes 1 and 3 in view. Fit, not
strength: nothing rates load, heat or food safety, and no build was printed
in this evaluation. No new CAD: the print pack holds existing parts. The
brief match is checked in code only where an eval brief says what to count,
and some false passes are known (a base over an empty cell, the pipe-planter
pipe coverage). The role-graph planner and the offline vision critic are
built and unit-tested, but not yet measured, and stay off by default. The
checks count parts and plants, not what a viewer sees: in 4 of 15 demo runs
the tall row faced the camera and hid the low row. Claude was used for development on
credit that would otherwise have expired; those runs are labeled in every
trace and none is reported as Muse. See
[KNOWN_LIMITATIONS.md](../../KNOWN_LIMITATIONS.md).

## What's next

Measure the role-graph planner against the interactive default,
and keep it only if it wins. Calibrate the critic against the owner's
design-review verdicts. When the configurator's contract answers spatial
questions (clearances, the user's side), plan with those answers instead of
hand-worked zones.
