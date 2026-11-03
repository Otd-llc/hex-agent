# Demo video script (owner-led, updated 2026-11-03)

The owner records and cuts the video; nothing here is rendered by the agent.
About 2:50 as written, against the event's three-minute limit (RULES.md; the ledger's O18 tracks the final length). Every frame of
the agent at work is a **replay of a real recorded Muse run** (`node
bin/replay.mjs <trace.json>`). Replay re-applies what the configurator
accepted in that run, in order, with a banner naming the run, provider and
model and saying no model is running. No Claude run appears as Muse, and
nothing is staged or re-performed by hand.

## The trace to replay

| Slot | Trace | Status |
|---|---|---|
| Main build (preferred) | a Muse Spark 1.3 demo run (Meta Model API, `evals/briefs-demo.json`, suite `18-42-02-972Z`, 14/15 passed); the owner picks from the sandbox page | `runs/suite-2026-11-02T18-42-02-972Z/2026-11-02T18-49-19-520Z-9329ae20/trace.json` (strawberry tower #3, owner pick 2026-11-02; replay rehearsed: 11 steps, none diverged, parts, families and staging match) |
| Second build | kitchen garden terrace, 12 planters, 11 species (Muse Spark 1.3, `demo-kitchen-terrace-facing`, 3 of 5 passed) | `runs/suite-2026-11-02T21-45-05-881Z/2026-11-02T21-45-05-939Z-a1530f79/trace.json` (owner: both builds, 2026-11-02; replay rehearsed: 8 steps, none diverged, parts, families and staging match) |
| Third build | FPV drone pit station, 108 parts (Muse Spark 1.3, `demo-drone-pit-v5`, 5 of 5) | `runs/suite-2026-11-03T02-49-48-989Z/2026-11-03T02-49-49-024Z-f24f0f99/trace.json` (owner pick 2026-11-03; replay rehearsed: 15 steps, none diverged, all match; note: the multimeter stands on end, display away) |
| Fourth build | 3D-printing station, 133 parts, four filament spools on axles (Muse Spark 1.3, `demo-print-station-v3`, 3 of 3 completed) | `runs/suite-2026-11-03T03-25-07-282Z/2026-11-03T03-25-07-317Z-dfdebefd/trace.json` (owner pick 2026-11-03; replay rehearsed: 9 steps, none diverged, all match; note: two stray rod stubs) |
| Main build (fallback, not in the current cut) | Muse Spark Open via Baseten, pipe-planter: 30 accepted ops, 3 refusals (`ROUTE_NO_PATH` ×2, `ROUTE_BIN_IN_WAY` ×1), all checks pass | `runs/suite-2026-10-27T21-15-15-341Z/2026-10-27T21-15-15-438Z-7f0ee7d5/trace.json` |
| Honest "no" (abstention) | Muse Spark 1.3, frozen agent, abstention on (suite `17-16-28-256Z`, the arm that passed 18 of 18), toddler-step, declined and passed | `runs/suite-2026-11-02T17-16-28-256Z/2026-11-02T17-16-28-280Z-aca4ce95/trace.json` (nothing is placed, so it is a caption card, not a replay; finish summary: "Declined: toddler step stool unsafe to build from 3D-printed parts. Nothing placed.") |
| Honest "unmet" (not in the current cut) | Muse Spark Open, dishwasher-safe brief, material claims reported unmet | in `runs/suite-2026-10-27T22-19-09-363Z` (pick one run) |

Rehearse every replay on the deployed site first. Replay ends by checking the
parts list matches the original. The fallback trace dates from 2026-10-27
(contract `2b45909b`), so if the configurator now answers differently, use a
newer trace and never edit one. The pipe-planter check does not confirm the
pipe reaches every cell (a known false pass, paper Limitations): before
using this trace, confirm on screen that its pipe does, or pick another
brief.

## Script

Two labels stay in a corner of the frame for the whole video, switching with
what is on screen: **"Built during the event: the agent, its tools, its
checks"** over the agent's messages, tool calls and the verdict cards, and
**"Pre-existing: the Hex Cluster configurator (One Thousand Drones)"** over
the configurator itself. The replay banner (run, provider, model, no model
running) stays on as well. Every number spoken or shown below is in
docs/submission/paper/paper.md.

**0:00-0:15. Cold open: the strawberry tower (run 9329ae20).** Screen: the
configurator, empty bench; the brief appears in the overlay. Voice: "A
strawberry tower for a small balcony: one tall planter in the middle, ringed
by six shorter ones, all planted. That's the brief, in short. Meta's Muse Spark
1.3 builds it in the live Hex Cluster configurator."

**0:15-0:40. What is happening.** Screen: parts appear as the replay applies
them; the two corner labels switch as the view moves between the agent's
messages and the configurator. Voice: "We built the agent for this event:
the loop, its tools, its checks. The configurator is One Thousand Drones'
existing product. The agent reads the build, asks the configurator where
parts fit, and places them through its public browser API. The model
chooses; the configurator's own rules accept or refuse, and some helper
tools re-send the configurator's own suggested fix."

**0:40-1:00. A refusal, and the recovery.** Screen: replay re-applies only
accepted ops, so the refusal is a caption card quoting the trace's own
`NEEDS_TALL_BASE` outcome (`events[26]`, the result of the `events[25]` apply; code and message word for word), cut in
where it happened, then the next accepted op. Voice: "Here the configurator
says no: a deep planter bin needs a taller base under it. The model doesn't
argue with the rule. It reads the refusal and builds the base it needs."

**1:00-1:20. Kitchen garden terrace (run a1530f79).** Screen: the replay,
then the finished terrace turning, with the caption "chosen by the owner from
its brief's runs; every run counted in the paper". Crop the replay's closing verdict lines (bin/replay.mjs; the overlay was added after the tag)
and the overlay's finish line ("finishes: met, met, ...") and its "All twelve
plantings are in and visible" line. Voice: "A kitchen garden terrace: 12
planters and 11 species in three tiers. This brief passed 3 of 5 runs; the
two failures ran out of turns."

**1:20-1:45. FPV drone pit station (run f24f0f99).** Screen: the replay, then
a caption card: "brief versions 1 to 4: 0 passed; version 5: 5 of 5" and the
caption "chosen by the owner from its brief's runs; every run counted in the
paper". Crop the replay's closing verdict lines (bin/replay.mjs; the overlay was added after the tag) and the overlay's finish line ("finishes:
met, met, ..."). Voice:
"A drone pit station of 108 parts. The first four versions of this brief
passed none. We never changed the agent, only the brief.
Version five spells out the layout cell by cell; the model builds it.
Version five passed 5 of 5."
Owner decision (2026-11-03): the flaws are not narrated in the video. Do not
show this run's report lines for the quad cover or the drawers facing the
viewer (both marked met; the stills contradict them, paper Demo and results):
keep the replay overlay off the report card, or crop those two lines.

**1:45-2:10. 3D-printing station (run dfdebefd): what the checks verify.**
Screen: the replay, then a caption card with the trace's checks (each check
and its result, without the word VERIFIED; requirementsClaimedMet glossed as
"the model's own report"), the parts list, and the share link opened in a
fresh tab showing the same build; a caption "chosen by the owner from its
brief's runs; every run counted in the paper" and a card "brief v1: 0 of 5;
v2, v3: 3 of 3 completed each". Crop the replay's closing verdict lines (bin/replay.mjs; the overlay was added after the tag) and the overlay's
finish line ("finishes: met, met, ..."). Do not show the report's rods line (marked met; the
stills contradict it, paper Demo and results). Voice: "Version three spells out the layout cell by cell; the model builds it.
A printing station of 133 parts, four
filament spools hung on axles. When it finishes, code runs the checks:
placement rules, the mesh-collision gate, the parts list, the print pack,
the share link reloaded in a fresh tab, and the brief's own checks. A run
passes only if all of them pass; a decline needs a finish and no broken
rule, and the brief's own checks still apply. A check that didn't run counts as failed."

**2:10-2:25. An honest no (run aca4ce95).** Screen: the empty bench, with a
caption card quoting the run's finish word for word: "Declined: toddler step
stool unsafe to build from 3D-printed parts. Nothing placed." Voice: "Asked
for a step a toddler stands on, it declines: printed plastic shouldn't carry
a child. With this guard on, the six abstention briefs (four unsafe or infeasible,
two controls) passed 18 of 18 runs; with it off, 10 of 18. Two cautions:
the guard's prompt names most of those hazards, and with it off the agent has
no 'declined' outcome to report. An agent that does nothing passes 3 of the
6."

**2:25-2:45. The numbers.** Screen: the paper's Table 1 as a still, with the
caption "14 of 18, passes not audited; see the paper". Voice:
"On 18 held-out briefs, one pre-committed run each, Muse Spark 1.3 passed
14, with a 95 percent interval of 54.8 to 91.0 percent. An agent that
does nothing passes 4 of those 18. On the 36 briefs we tuned against, it
passed 173 of 180 runs, and that figure is optimistic."

**2:45-2:50. Close.** Screen: the finished printing station turning, the
share link. Voice: "Hex Cluster and its configurator are One Thousand
Drones' product. The agent, its tools, its checks and its evaluation are
what we built for this event."

## Before filming
- Fill the trace slots; read each trace in full first.
- Record with the replay banner on, and keep it on screen in the cut.
- Caption cards quote the trace verbatim (refusals, verdict, finish). If one
  is shortened, it says so.
- On-screen numbers come from docs/submission/paper/paper.md as published,
  each with its provider and model; no pooled rate and no figure the claim
  ledger cut.
