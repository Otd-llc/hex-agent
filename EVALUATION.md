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
| — | live, Muse | — | not run: no Meta key yet | — |

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
