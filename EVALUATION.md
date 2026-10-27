# Evaluation

Every run is listed, not just the good ones. "Mock" means a scripted
stand-in, not a model.

## Runs so far

| Date | Kind | What | Result | Evidence |
|---|---|---|---|---|
| 2026-10-27 | read-only probe | live page: members, catalog, sockets, validate, bom | 14 members, v1, 614 parts, 155 props | `runs/probe-*.json` |
| 2026-10-27 | contract acceptance | atomic rollback, drawer key, spike type/facing, round trip | all as documented | `runs/accept-*.json` |
| 2026-10-27 | contract acceptance | drawer on half base, then spikes at its corners | offers drop to 0; both applies refused `SPIKE_CLASH` | console log, reproducible with `scripts/explore.mjs` |
| 2026-10-27 | mock e2e | scripted 3-op build through the full loop + verify | 6/6 checks pass; round trip 4 = 4 nodes, BOM equal | `runs/mock-e2e-*.json` |
| 2026-10-27 | live, **Claude** (dev, not a Muse result) | `claude-opus-5-5`: "portable electronics organizer: base, removable bins, at least one drawer, carry handle" | success, 6/6 checks; 19 parts, 0 refusals, 13 model calls, 45.5 s, $0.1263 (88% of input cached); fixed LOOSE_BODY with a joint bolt and capped open edges unprompted | `runs/2026-10-27T14-58-18-299Z-eca74063/trace.json` |
| 2026-10-27 | suite, **Claude** (dev) | `claude-opus-5-5`, 12 briefs ×1 | **11/12**, $1.24, 7–17 calls and 15–58 s per brief; mesh "clear" on all 11 that finished; 0 overclaims; load-rating brief honestly reported the 50 kg rating "unmet". The one fail: Anthropic HTTP 500 mid-run (provider outage, not agent behavior), reported as a fail. Refusals: 5× `ALREADY_FITTED` (both ends of one joint batched), 2× `INVALID_INPUT` (setSpikeAccessory sent `ref` instead of `level`+`junction`), 1× `TYPE_NOT_ALLOWED` (solid spike cannot carry a platform; the model switched spike type and finished) | `runs/suite-2026-10-27T15-03-34-884Z/summary.json` |
| 2026-10-27 | suite, **Claude** (dev) | `claude-opus-5-5`, 12 briefs ×3 (after suite-1 fixes) | **34/36**, $3.39 ($0.04–0.22 per run); every brief passed at least 2 of 3; both negative briefs 3/3 honest. Both fails were **harness bugs**, not model behavior: `finish.requirements` arrived as a non-array and `verify()` threw, losing those two traces. Live refusals handled: `SPIKE_CLASH` and `TYPE_NOT_ALLOWED` (drawer-beside-spike #1), `KIND_MISMATCH_BELOW` ×2, `MESH_CLASH` ×1, `ALREADY_FITTED` ×6 in one run. Part counts vary run to run (organizer 13–25, sewing 24–36) | `runs/suite-2026-10-27T15-13-08-062Z/summary.json` |
| 2026-10-27 | confirm, **Claude** (dev) | `claude-opus-5-5`, herb-planter + stud-feet ×3 | 5/6, $0.24; the finish fix held. The fail: configurator page did not expose `hexAPI` within 90 s while other Chrome sessions ran (no model call made). Fixed: one retry in a fresh browser | `runs/suite-2026-10-27T15-39-20-614Z/summary.json` |
| 2026-10-27 | suite, **Claude** stress (dev) | `claude-haiku-5-5`, 12 briefs ×1 | 11/12 as scored, **$0.066 total**; the page-load retry fired once and held. The fail was flagged OVERCLAIMED on sewing-vague (1 base + a 3-compartment bin, claimed met). On reading the trace the model's claim was fair and its summary said plainly it was a small tray; **the check (bin ≥ 2) was arbitrary**, so it was changed to bin ≥ 1 for later runs. This row keeps the original score | `runs/suite-2026-10-27T16-32-48-982Z/summary.json` |
| 2026-10-27 | hard suite, **Claude** (dev) | `claude-opus-5-5`, 8 harder briefs ×1 (`evals/briefs-hard.json`) | 8/8 as scored, $1.75, but with thrash: gap-drawer 27 calls / 137 s / 38 guessed notch ops (`NO_CELL` ×34, `HAND_MISMATCH` ×7) while `find_sockets` returned 0; magnetic-lid 9× `INVALID_PART_ID` guessing cover types (the op list was not visible to the model); pipe-planter 12× `MESH_CLASH`, honestly finished "partial" on 2 of 3 requirements (only third-depth bins clear the pipe). The suite did not then show "partial" claims; it does now | `runs/suite-2026-10-27T16-41-48-246Z/summary.json` |
| 2026-10-27 | hard suite rerun, **Claude** (dev), concurrency 3 | `claude-opus-5-5`, 8 hard briefs ×1, after the anti-guessing fixes | 7/8, $1.24, **155 s wall clock** (≈390 s of runs); no load timeouts or unverified mesh checks at concurrency 3. magnetic-lid: 0 guessed types (11 calls, was 23). gap-drawer: no guessing this time; reported **unmet** with the reason (a notch drawer needs an empty spot touching two bases that also touch each other), so the brief as worded was infeasible and the earlier "pass" came from silently moving the bases; brief reworded. Still guessing: 5 run modes (values list not visible then), and one `junction` sent as an object, which leaked a raw JS error from the configurator | `runs/suite-2026-10-27T16-52-24-289Z/summary.json` |
| 2026-10-27 | hard suite ×2, **Claude** (dev), concurrency 3 | `claude-opus-5-5`, 8 hard briefs ×2, after value lists + type checks | 14/16 as scored, $1.77, 262 s wall clock; **no guessed values and no raw-error refusals**; pipe-planter MESH_CLASH 12 → 0 and 3; magnetic-lid 9 calls both times. Both fails are gap-drawer flagged OVERCLAIMED, but on reading the traces the model filled the spot with a half base plus a classic drawer and said so plainly: a fair reading of the reworded brief, and **the check (notch ≥ 1) was wrong again**. Brief reworded to rule out more bases; socket tool now names notch drawers and their precondition | `runs/suite-2026-10-27T16-56-49-157Z/summary.json` |
| 2026-10-27 | live, **Meta open weights via Baseten** (dev) | `meta-models/muse-spark-open-1026` ("[HACKATHON] Muse Spark Open", 816B-A42B NVFP4): electronics-organizer | **success, 6/6 checks**; 13 parts (full + two half bases, 2 drawers, 2 divided half bins, cover, handle, joint bolt), 0 refusals, 16 model calls, 178k in / 4k out tokens, **$0.0614**. First Meta-model run. Not the Model API's `muse-spark-1.3` | `runs/2026-10-27T17-11-41-241Z-1cd55e4a/trace.json` |
| — | live, Meta Model API (`muse-spark-1.3` / `muse-wonder-1.0`) | — | not run: no Meta key yet | — |

Check fix (fourth one of ours): drawer checks counted only cut-face drawers
(family `drawer`), so builds with **notch drawers** were failed or flagged as
overclaims. Now `{drawers: N}` counts cut-face drawers plus notch drawer frames
in the BOM (family `notch` alone would also count notch bins). Earlier suites
were rescored from their traces with `bin/rescore.mjs`; originals untouched,
results in each suite's `rescore.json`, two flips read by hand and confirmed:

| Volume suite (same tools, 2026-10-27) | As first scored | Rescored |
|---|---|---|
| Haiku 5.5, 12 briefs ×5 | 47/60 | **56/60** |
| Haiku 5.5, 8 hard ×5 | 31/40 | **33/40** |
| Opus 5.5, 12 briefs ×3 | 35/36 | **36/36** |

### Cheap vs capable model, same tools (rescored, `bin/compare.mjs`)

Haiku 5.5 ×5 and Opus 5.5 ×3 on all 20 briefs: **Haiku 89/100, Opus 60/60.**
Everything Haiku passed, Opus passed. Haiku's misses concentrate in two
briefs, and on reading the traces neither was a model failure:

- vented-enclosure (Haiku 1/5): **tool bug**. `find_parts` required every
  search word, so "louvre vent grate" found nothing although `hex-port-louvre`
  exists; Haiku fell back to a grate cover and honestly said "partial". The
  one run that searched "louvre vent" found the port. Fixed: any word matches,
  ranked by how many do.
- bay-bins (Haiku 0/5, Opus 3/3): **brief infeasible as worded** (fifth error
  of ours). A bay stands in an empty spot beside three bases, not in half a
  cell; Haiku said so (unmet / partial) every time, Opus passed by
  reinterpreting the brief. Reworded.
- three-storey and open-drawer (Haiku 4/5 each): single misses, not yet read.
- After the fixes, Haiku ×5: vented-enclosure **5/5**, bay-bins **5/5** ($0.06 total;
  `runs/suite-2026-10-27T17-52-23-888Z`, `runs/suite-2026-10-27T17-54-16-542Z`).

So far the data supports "if the cheap model passes, the capable one does",
and shows the cheap model is the better detector of tool and brief problems.

Note on the checks themselves: of the "failures" so far, three were our own
brief or check being wrong (sewing-vague bar, gap-drawer infeasible wording,
gap-drawer notch-only check), not the model. Every flagged overclaim is now
read in the trace before it is counted.

Fixes after the hard rerun: the contract's published value lists (cover types,
run modes, cap and spike variants, accessories, drawer styles) are in the
apply description and checked in code, as are field types (cells, junctions,
edges), so malformed input is answered by us with the allowed values instead
of reaching the page.

Fixes after the hard suite: the op table is in the apply tool's description;
an empty offer list tells the model to change the build instead of guessing;
6 refusals in a row bring a plain warning.

Fixes after suite 2: `finish` arguments validated (a stringified array is
parsed; anything else goes back to the model to call finish again), and a run
that hits a harness error still writes its partial trace.

Fixes after suite 1: transient provider errors retried with backoff (2/8/20 s);
op shapes checked against the contract before they reach the page (27 ops,
verified field-for-field against `hex-api.d.ts`); the socket tool says offers
go stale after a change.

## Planned suite (P1)

8 to 12 briefs, each run live with the same budgets, reporting: requirements
met per the model, refusals by code, repairs, rule and mesh verdicts, BOM and
round trip, latency, tokens and cost. Includes a drawer-beside-spike brief and
a stud-spike-facing-down brief, run as ordinary briefs, not staged failures.

## Provider labels

Every trace names its provider and the model that served each turn
(`servedBy`). Claude runs are development or an explicitly labeled baseline;
only `provider: "meta"` runs count as results for this entry.
