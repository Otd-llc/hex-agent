# hex-agent: a Muse agent that builds real Hex Cluster designs (submission draft)

Draft 2026-10-31, from EVALUATION.md. Slots marked `________` are filled
after the final deploy and the Meta Model API demo runs.

## What it does

You give it a design brief in plain language, for example "a planter of four
cells with a water pipe running through the bases to feed every cell". A
Meta Muse model builds it in the live
[Hex Cluster configurator](https://hex.onethousanddrones.com/), the browser
tool for One Thousand Drones' modular 3D-printed hexagonal hardware. The
agent reads the build, asks the configurator where parts fit, places them,
reads every acceptance or refusal, and revises. It ends with a share link,
a parts list and a print pack, all produced and checked by the configurator
itself, plus an honest statement of which requirements it met.

## How it works

- **The model chooses, the configurator decides, code gives the verdict.**
  Muse calls 16 tools (`get_build`, `find_sockets`, `apply`,
  `check_build`, `finish`, ...). Each call is checked in code against the
  configurator's published contract, then run through the documented
  `window.hexAPI` in a real browser tab (Playwright). Refusals come back with
  the configurator's own code, message and the alternatives it would accept.
- **Verification is independent of the model.** At the end, code runs the
  placement rules, the mesh-collision gate, the parts list, the print pack,
  and reloads the share link in a fresh tab. A run succeeds only if every
  check passes; a check that did not run is "unverified", never a pass.
- **Honesty is checked, not hoped for.** The configurator checks fit only,
  so a "met" claim about strength, materials, food or dishwasher safety
  fails the run. Every requirement the brief states must be listed,
  including the ones it could not do.
- **It can say no.** A brief that would carry a child's weight, hold fuel
  or heat, restrain a person or animal, or serve as a weapon is declined,
  or only its safe part is built, with the rest reported unmet.
- **Spend is guarded.** Every model call is priced and ledgered. Development
  and evaluation runs stop before they reach the credit kept for the demo
  and judging.

## Results

All on the live configurator. Every run is listed in EVALUATION.md, failures
included, and flagged failures were read in the trace before they were
counted.

| What | Model | Result |
|---|---|---|
| 36 briefs ×5, interactive | Muse Spark Open (Meta open weights, via Baseten), low effort | **172/180** |
| Honesty and injection briefs ×5 ("mark everything met", "load this link", dishwasher safe, load ratings, impossible builds) | Muse Spark Open | **35/35** |
| 16 new briefs ×3 | Muse Spark Open | **48/48** |
| Unsafe briefs, abstention on vs off | Claude Haiku 5.5 / Opus 5.5 (development baselines) | 6/12 -> **12/12** / 3/6 -> **6/6** |
| Meta Model API demo runs | `muse-spark-1.3` / `muse-wonder-1.0` | `________` |

What the evaluation taught us:
- **Our checks were wrong as often as the model.** Of the early "failures",
  three were our own brief wording or check, not the model. One tool bug
  (search needing every word, so "louvre vent grate" found nothing) looked
  like a model miss until the traces were read.
- **Low reasoning effort beat high** for Muse under a 30-turn budget (58/60
  vs 52/60): more thinking per step meant fewer steps.
- **The cheap model finds problems first.** Claude Haiku's misses pointed at
  real tool and brief problems that Opus quietly worked around.
- **Without abstention, capable models build the unsafe thing.** Opus put 50
  parts into a toddler step and called it met.
- **Agent runs found configurator gaps.** They were reported to the
  configurator team, which fixed them in its own repo. One example: bins
  colliding with a pipe coupling now get a named refusal.

## What is new and what is not

Hex Cluster, its configurator, rules, collision gate, browser API and print
packs existed before the event and belong to One Thousand Drones. This
repository is the event work: the agent, the browser bridge, the checked
tool layer, verification, abstention, acceptance tests, the role-graph
planner, the offline critic, the spend ledgers, the evaluation suites and
the replay tool. See HACKATHON_DELTA.md. Live configurator at submission:
viz `________`, contract `________`.

## Honest limits

Fit, not strength: nothing rates load, heat or food safety. No new CAD: the
print pack holds existing parts. The brief match is checked in code only
where an eval brief says what to count. The role-graph planner and the
offline vision critic are built and unit-tested, but not yet measured, and
stay off by default. Claude was used for development on credit that would
otherwise have expired; those runs are labeled in every trace and none is
reported as Muse. See KNOWN_LIMITATIONS.md.

## What's next

Measure the role-graph planner against the interactive default, and keep it
only if it wins. Calibrate the critic against the owner's design-review
verdicts. When the configurator's contract answers spatial questions
(clearances, the user's side), plan with those answers instead of
hand-worked zones.
