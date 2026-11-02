# Data presentation for the hackathon submission (2026-11-02)

Owner: Raven. Lane 3 (hex-agent). Deadline 2026-11-04 9:00 PM ET (Meta Global AI Dev Hackathon,
Indie track). Fireworks runs are PAUSED until the owner sees a clean Fireworks status page, so this
work uses the data already gathered and spends nothing.

## Goal

Turn everything measured since 2026-10-27 into one honest, traceable data story for the judges, and
fill the data slots of the submission drafts.

## Framing rules

- Nothing was trained. The work is eval-driven agent engineering: the tool layer, prompts and
  guards, and configurator fixes, measured on fixed brief sets. Never call it training.
- Every number names its suite folder (`runs/suite-...`) and the agent commit and contract it ran on.
- Provider and effort comparisons are descriptive, never a leaderboard or a significance claim
  unless a test is shown.
- Claude runs are development only and are never presented as Muse results (HACKATHON_DELTA.md).
- Configurator fixes are One Thousand Drones work, credited to the configurator, not to the event
  entry (HACKATHON_DELTA.md).
- State the limits: fixes 1-4 unmeasured, held-out set never run (it stays unrun: do not run
  `evals/briefs-heldout.json`), Fireworks unstable on 2026-11-02.

## Sources

- `EVALUATION.md`: the run log, newest sections last (Baseten control on deploy 14, Fireworks
  F0/F1).
- `docs/plans/2026-11-02-modal-review.md`: the 12 Modal suites (875 runs), failure classes and
  causes, effort result.
- `runs/`: about 139 `suite-*` folders, each with `summary.json` (rows: pass, strict, overclaimed,
  calls, costUsd, refusals, infra) and per-run `trace.json`.
- `bin/tally.mjs`, `bin/rescore.mjs`, `bin/compare.mjs`, `bin/call-report.mjs`.
- `docs/submission/WRITEUP.md` and `docs/submission/VIDEO_SCRIPT.md`: drafts with `________` slots.
- `HACKATHON_DELTA.md`: what pre-existed and what is new.

## Steps

1. **Index.** A script (for example `bin/index-suites.mjs`) writes one row per suite: date,
   provider, model, effort, contract, page build, agent commit, brief sets, runs, passed, strict,
   overclaimed, infra-cut, cost, and a class (dev / eval / smoke / dead end). Check the class
   against EVALUATION.md, not by guessing.
2. **One measuring stick.** Rescore the eval suites with the current grader (`bin/rescore.mjs`,
   which must recompute `configurator`; see the Modal review section 2 item 6). Keep the original
   numbers next to the rescored ones.
3. **Headline chart.** Pass rate and overclaim rate over time on the fixed 36 briefs, by agent
   commit and site deploy, Muse only. Mark which change landed between points (agent or
   configurator).
4. **Three tables.** Low vs high effort (Modal: low 495/540, high 171/180 at 2.4x cost);
   failure classes with cause (MODEL / AGENT / CONFIGURATOR / GRADER); providers (Baseten,
   Modal, Fireworks: cost, latency, reliability), labelled descriptive.
5. **"How we graded" note.** Code checks, strict mode, the overclaim flag, the held-out set.
6. **Results page.** Publish the chart and tables as a shareable page, then fill the data slots in
   `docs/submission/WRITEUP.md` and point `EVALUATION.md` at it.

Stop for the owner after step 1 (the index and the classes) and again after step 4 (the chart and
tables in draft), before anything is published.

## Open for the owner

- The judging criteria (paste them; the presentation is weighted to them).
- The Meta Model API demo runs (`________` in WRITEUP.md) are still to be recorded on the final site.

## Backlog (after 2026-11-04)

- dev.to articles, three candidates: (1) "the model chooses, the configurator decides, code
  grades": an agent driving a real product through its public API; (2) honesty as a metric:
  overclaim grading and a check before finish; (3) one model on three hosts (Baseten, Modal,
  Fireworks), descriptive.
- Fireworks F2 fix loop resumes per `docs/plans/2026-11-02-fireworks-plan.md` once the status page
  is clean: rerun the F0 smoke (owner OK), fix the cost tripwire first (EVALUATION.md, Fireworks
  section), then F1 again on the current deploy.
- Fix code not yet written: Modal review fixes 5, 7, 8, 9, 10.
