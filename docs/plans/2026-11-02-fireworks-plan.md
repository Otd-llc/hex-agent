# Fireworks plan: a measured fix loop, not another benchmark (2026-11-02)

Owner: Raven. Lane 3 (hex-agent) runs it. Credit: Fireworks $100 (hackathon), guarded in code at a
$100 ceiling and a $5 floor (`HOSTED_LIMITS.fireworks`, 9f4638a). Model:
`accounts/fireworks/models/muse-spark-open`, billed per token, so nothing bills while idle.
Deadline 2026-11-04 9:00 PM ET.

## Decisions (owner, lane 3 chat, 2026-11-02)

- No new host comparison: Baseten (×5 + deploy 14 control) and Modal (×15 at low, ×5 at high,
  concurrency sweep) already answer it, descriptively. Fireworks gets only a smoke + one 36 ×1
  control so its provider section has a real number.
- The credit buys agent improvement: a fix loop on the failure classes the Modal review ranks,
  a held-out brief set, and one confirmation run at the end.
- Checkpoints at every batch end and tripwires in code (below); a full multi-lens review at the
  halfway mark.

## Before the first call

1. The multi-lens Modal review (workflow, under 10 agents, every finding verified by a second
   agent) is done and its ranked fix list is in `docs/plans/` with evidence paths. The owner picks
   the fixes.
2. Tripwires built and tested (`npm test` green), committed.
3. Held-out briefs written (15-20, new purposes and settings), committed, and **never run before
   step F4**. Their file is named in this plan once it exists.
4. Owner puts `FIREWORKS_API_KEY` in `.env` (lane 3 never reads `.env`).
5. Contract synced, smoke-tools + smoke-helpers green on the live site (still frozen at deploy 14
   unless lane 1 says otherwise).

## Steps

| step | what | runs | est. |
|---|---|---|---|
| F0 | smoke: minimal-bin + three-storey ×1 | 2 | <$0.20 |
| F1 | control: the 36 briefs ×1 at effort low (provider number) | 36 | ~$2 |
| F2 | fix loop: per fix, the briefs it targets ×10 before and after, same commit base and site | ~30-60 per fix | ~$60 total |
| F3 | halfway full multi-lens review (~$45 spent) | 0 | review only |
| F4 | held-out set ×3, run once, final agent | ~45-60 | ~$5 |
| F5 | confirmation: 36 + 13 unused + held-out ×3, final agent | ~200 | ~$20 |
| | floor | | $5 |

Effort for F2-F5 follows the Modal SA-high result (low unless high clearly wins on the briefs the
fixes target).

## Fix-loop rules

- One fix per batch. Stacked fixes cannot be told apart.
- Before-arm and after-arm on the same site version and the same briefs; the after-arm is a new
  agent commit, recorded in the trace provenance.
- A fix is kept only if it helps its target briefs and no previously passing brief drops. Gains are
  credited to the fix (agent or configurator), never to the host or the model.
- The held-out set is never used to choose or tune a fix.

## Checkpoints (every batch end, at most every ~300 runs / ~$15)

At each checkpoint:
1. `bin/tally.mjs`, `bin/rescore.mjs`, `bin/call-report.mjs` on the batch.
2. Two-agent read: one reads a sample of failing traces (at least every new failure class), the
   other verifies those claims against the traces.
3. A recorded decision, **continue / revise / stop**, with its reason, appended to
   `.spend/fireworks-checkpoints.jsonl` and summarised in EVALUATION.md.

## Tripwires (in code: pause the batch, force a checkpoint)

Built in `src/tripwires.mjs`, wired into `bin/suite.mjs --checkpoint=<summary.json,...>`; a Fireworks
suite refuses to start without one. The checkpoint suites must be the same briefs at the same effort
as the batch (replayed on the Modal data: same-config batches stay quiet, S1-c9 trips on harness,
high-vs-low trips on cost, other briefs trip on refusal codes). The first F0/F1 checkpoint is the
Modal low arms (S2, S3a).

- Harness errors > 5% of the batch's finished runs (browser/page, not the model).
- A brief drops > 20 points from the last checkpoint and that few passes is under 5% likely by
  chance (binomial against the smoothed checkpoint rate, Bonferroni over the briefs).
- Cost per run drifts > 30% from the last checkpoint (loops or growing prompts).
- A refusal code no checkpoint run saw, in 3+ runs of the batch.
- The existing guards still apply: $100 ceiling, $5 floor, memory per browser (0.85 GB),
  concurrency 6 on this PC.

## Halfway review (F3)

Same workflow as the Modal review, on all Fireworks data so far plus the Modal baseline. Output: keep,
drop or revise each fix so far, and the order for the rest of F2. The owner OKs the next batch.

## Owner approvals

Each live batch (F0, F1, each F2 batch, F4, F5) is OK'd by the owner in lane 3's chat and recorded
with the batch. Tripwire pauses resume only after a checkpoint decision.
