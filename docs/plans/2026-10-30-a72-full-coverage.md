# A72: the agent can do everything the configurator can (plan, 2026-10-30)

Owner, 2026-10-30: "the hackathon agent should be able to do everything." Backlog row A72 in
C:/zzz/bs-premades/docs/plans/2026-10-27-catalog-premades.md. Decided: develop against the local dev
server (http://127.0.0.1:5310/hex.html from C:/zzz/bs-premades, branch feat/catalog-premades);
push and deploy when needed, no fixed cutoff.

## The gap today

| Contract (hex-api.d.ts on the branch) | Agent (src/tools.mjs, src/bridge.mjs) |
|---|---|
| 36 ops | 27 in OP_FIELDS; missing `replace`, `addProp`, `moveProp`, `removeProp`, `fillPot`, `emptyPot`, `plant`, `fillSoil`, `emptySoil` |
| `listProps()`: id, label, kind, stage, sizeMm, uses | no tool |
| `surfaces(ref?, { fits })`: tops, floors, compartments, soil, outline, headroom | no tool; bridge READ set lacks it |
| `measure()`: parts box, box with props | no tool; bridge READ set lacks it |
| `bom()`: lines, print grams and minutes, pack link | used by bin/run.mjs after the run only, not a tool |
| `apply(op, { dryRun })` | no dry run |
| `getState().staging`: props (ref, id, pose) and soil | get_build drops it, so the model cannot see or ref a prop |
| `redo()` | in the bridge, not a tool |

The site URL is hard-coded (`HEX_ORIGIN` in bridge.mjs); session.mjs calls `openHex({ headless })` with no url.

## Steps (tests first in each; `npm test` stays green)

1. **Target.** `HEX_URL` env (default the live site) read once in bridge.mjs; session, suite and replay
   use it; every trace records the URL and the contract hash it ran against, so local and live runs
   are never mixed in one comparison.
2. **Bridge.** Add `surfaces` and `measure` to READ. `apply` already passes options through.
3. **Ops.** The 9 ops in OP_FIELDS with their fields from the contract; SHAPES for `atMm {x, z}` and
   `orient {up, longAlong, flip}`; VALUES for `pose: rest`, `to: rim|dividers`, `orient.up`.
   Ref check widened: `ref` on a prop op and `in`/`on` may name a prop ref (from staging) or a node
   ref; `on` may be `'bench'`; `part` must be a node ref. A prop id must come from listProps.
4. **Reads.**
   - `get_build` adds `props: [{ref, id, label, at: [x, y, z], yawDeg, pot}]` and `soil: [{part, to}]`.
   - `find_props({ text?, use?, kind? })`: listProps filtered, compact rows (id, label, kind, uses,
     sizeMm), capped like find_parts.
   - `find_surfaces({ ref?, fits? })`: surfaces(), each opaque id mapped to a short token (`f1`, `f2`,
     ...) the way sockets are, with label, kind, yMm, centre, a size instead of the full outline,
     headroom. The token resolves back to the id inside addProp.
   - `measure`, `bom` (lines, print grams and minutes, pack `why`; no URL in the model's context).
5. **Dry run.** `apply` gains `dryRun: true` for one op: returns the outcome with nothing changed.
   (applyAll has no dryRun; a whole-plan dry run is A65 and needs the API.)
6. **Undo/redo.** A `redo` tool beside `undo`.
7. **Prompt.** agent.mjs: one paragraph on staging (props and soil are not parts, not in the BOM,
   placed with addProp on a surface token; plants go in soil). Op table in the apply description
   grows; A60 shortens it (see below).
8. **Checks and briefs.** checks.mjs learns props (count by use, all props resting, soil before
   plant). 3-4 dressing briefs in evals (a desk with a working setup, a herb planter planted, a
   drone bench), as A57.
9. **Verify.** Unit tests for every new op shape and tool; mock e2e; then one live local session
   per new brief with Claude credit (dev ledger), traces read before any count.

## Alongside

- **A59 cheaper lookups, agent side first** (82% of tool output in 1165 traces is find_sockets +
  find_parts). find_sockets rows carry `at`, `slot` AND the full `op`, which repeats both: send the
  socket id plus the op only, drop default fields, group by level. Measure token cost on the
  recorded traces before and after (rescore-style, no new runs). Needs no deploy.
- **A60 op schema clarity:** generate OP_TABLE and VALUES from hex-api.d.ts / the contract JSON
  instead of by hand, so the agent cannot drift from the API again (today's 9-op gap is that drift).
- **A49 authored poses** lands in the viz API; when it does, addProp gains `pose: stand|lie` and the
  agent picks it up by regenerating from the contract (A60).

## Not in this plan

Whole-plan transactional dry run (A65, API work); props on props (A67); any deploy. Live A/B runs
pause while a deploy is in flight, then acceptance re-runs on the new version.

## Owner calls

1. Dry run as a flag on `apply` (recommended) or its own tool?
2. `bom` without the pack URL in the model's context (recommended: it is long and useless to the
   model; bin/run.mjs still prints it).
