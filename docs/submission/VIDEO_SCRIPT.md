# Demo video script (draft, updated 2026-11-02)

About 2:45, against the event's three-minute limit (RULES.md). Every frame of
the agent at work is a **replay of a real recorded Muse run** (`node
bin/replay.mjs <trace.json>`). Replay re-applies what the configurator
accepted in that run, in order, with a banner naming the run, provider and
model and saying no model is running. No Claude run appears as Muse, and
nothing is staged or re-performed by hand.

## The trace to replay

| Slot | Trace | Status |
|---|---|---|
| Main build (preferred) | a Muse Spark 1.3 demo run (Meta Model API, `evals/briefs-demo.json`, suite `18-42-02-972Z`, 14/15 passed); the owner picks from the sandbox page | `runs/suite-2026-11-02T18-42-02-972Z/2026-11-02T18-49-19-520Z-9329ae20/trace.json` (strawberry tower #3, owner pick 2026-11-02; replay rehearsed: 11 steps, none diverged, parts, families and staging match) |
| Main build (fallback) | Muse Spark Open via Baseten, pipe-planter: 30 accepted ops, 3 refusals (`ROUTE_NO_PATH` ×2, `ROUTE_BIN_IN_WAY` ×1), all checks pass | `runs/suite-2026-10-27T21-15-15-341Z/2026-10-27T21-15-15-438Z-7f0ee7d5/trace.json` |
| Honest "no" (abstention) | a Muse run of an `evals/briefs-a58.json` brief (toddler step or petrol caddy), declined | Muse Spark Open, toddler-step declined in 2 calls: a trace in `runs/suite-2026-10-31T23-27-37-267Z` (pick one; nothing is placed, so it is a caption card, not a replay) |
| Honest "unmet" | Muse Spark Open, dishwasher-safe brief, material claims reported unmet | in `runs/suite-2026-10-27T22-19-09-363Z` (pick one run) |

Rehearse every replay on the deployed site first. Replay ends by checking the
parts list matches the original. The fallback trace dates from 2026-10-27
(contract `2b45909b`), so if the configurator now answers differently, use a
newer trace and never edit one. The pipe-planter check does not confirm the
pipe reaches every cell (a known false pass, paper Limitations): before
using this trace, confirm on screen that its pipe does, or pick another
brief.

## Script

**0:00-0:15. Cold open.** Screen: the configurator, empty bench; the brief
appears in the overlay. Voice: "A planter of four cells, with a water pipe
running through the bases to feed every cell. That's the whole brief.
Meta's Muse model builds it in the live Hex Cluster configurator."

**0:15-0:40. What is happening.** Screen: the replay banner stays visible;
parts appear as the replay applies them. Voice: "The agent works the way a
person would: it reads the build, asks the configurator where parts fit,
and places them through its public browser API. The model chooses, the
configurator's own rules accept or refuse, and the configurator's checks
and our code decide whether the run passes."

**0:40-1:20. A refusal, and the recovery.** Screen: replay re-applies only
accepted ops, so the refusal is a caption card quoting the trace's own event
(code and message, word for word), cut in where it happened, then the next
accepted op.
Voice: "Here the configurator says no: the pipe can't pass where a bin is
standing. The model doesn't argue with the rule or guess. It reads the
refusal, takes one of the alternatives the configurator offered, and goes
on."

**1:20-1:50. Verified, not claimed.** Screen: a caption card with the trace's
verdict (each check and its result), the parts list, and the run's share link
opened in a fresh tab showing the same build.
Voice: "When it finishes, code runs the configurator's checks: placement
rules, the mesh-collision gate, the parts list, the print pack, and the
share link reloaded in a fresh tab. A run passes only if all of them
pass. A check that didn't run counts as failed."

**1:50-2:20. Honest answers.** Screen: a caption card quoting the
dishwasher-safe run's finish, with its "unmet" lines; then (if recorded) the declined toddler-step run with
nothing on the bench. Voice: "It also says what it can't do. The configurator
checks fit, not materials, so 'dishwasher safe' is reported unmet. A step for
a toddler to stand on is declined: printed plastic shouldn't carry a child."
(The declined run places nothing: show its finish as a caption card over the empty bench.)

**2:20-2:40. The numbers.** Screen: the paper's Table 1 as a still, one row
per batch, each host named, with its intervals.
Voice: "On 36 briefs, five runs each, in seven batches on two hosts,
Muse Spark Open passed 89 to 94 percent of runs per batch. These are briefs
we tuned the agent against; the held-out briefs haven't been run yet."
Add the Meta Model API demo numbers here only once measured, and say which
model each number comes from.

**2:40-2:50. Close.** Screen: the finished build turning, the share link.
Voice: "Hex Cluster and its configurator are One Thousand Drones' product,
including the releases it shipped this week. The agent, its tools, its
checks and its evaluation are what we built for this event."

## Before filming
- Fill the trace slots; read each trace in full first.
- Record with the replay banner on, and keep it on screen in the cut.
- Caption cards quote the trace verbatim (refusals, verdict, finish). If one
  is shortened, it says so.
- On-screen numbers come from docs/submission/paper/paper.md as published,
  each with its provider and model; no pooled rate and no figure the claim
  ledger cut.
