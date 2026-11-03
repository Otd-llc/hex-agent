# Proposal, 2026-11-03: promote the frozen agent's held-out2 result into the paper headline

Status: under validation (otd-validate-plan). Nothing changes in the paper until a round
of fresh reviewers returns no material findings and the owner signs off.

## The proposal

Add to paper.md's opening and Results, beside the current headline (14 of 18 held-out
briefs, one pre-committed run, Wilson 54.8 to 91.0; do-nothing 4 of 18):

> On a second pre-registered held-out set of 48 briefs, run three times each after the
> review gate, the same frozen agent passed 126 of 143 runs (per-brief mean 88.2%,
> clustered 95% interval 80.8 to 95.6); a do-nothing agent passes 0 of the 48.

Source: docs/data/addendum/arms.json (A7) `sets.heldout2.base` (eval-final arm),
do-nothing from docs/data/addendum/do-nothing-new-sets.json (A2).

## Labels it must carry

1. Run 2026-11-03, after the paper's first review gate, on the frozen agent eval-final
   (0c840bc), same page build (CvOVnJJh) and contract (da0834cc) as the paper's suites,
   Muse Spark 1.3, effort low, Meta Model API.
2. It is the eval-final (control) arm of the addendum's fixes comparison; the fixes arm
   is not in the headline.
3. The set (evals/briefs-heldout2.json, sha256 109f1217..., commit 2cdac85) was committed
   before any run; written by an agent session blind to traces and to the fix list but
   given six theme names that came from the agent's known failure areas; 24 of 48 briefs
   are themed on them.
4. Graded with the eval-final grader (rescore-0c840bc.json); its check code equals the
   paper's (git diff c7533b7 0c840bc empty for src/checks.mjs, src/agent.mjs, bin/rescore.mjs).
5. One pair dropped (Meta API error); time-budget stops count as failures.
6. Chosen for the headline after the result was seen; the set and its checks were fixed
   before.
7. Never pooled or compared with the first held-out set (different briefs, different repeats).

## Why

- It measures the submitted agent, not a fix, so the owner's rule "fix results stay in the
  addendum" is not what it protects against.
- 48 briefs x 3 runs against 18 x 1; interval about half as wide; do-nothing floor 0 of 48
  against 4 of 18.
- Two independent review rounds (13 and 14, fresh reader) named it the strongest evidence.

## Known risks (author's solo pass)

- R1 Grader validity: the development set's grader audit found false passes on 4 of 36
  audited briefs; the held-out2 passes are not audited. Its prop checks match by name
  substring (prop ids were guessed by the brief author and only later matched to real ids).
- R2 Selection: promoted after seeing a good number.
- R3 Comparability: readers may read 88.2 vs 14/18 (77.8%) as improvement.
- R4 Themed half fix-targeted: the themes are failure areas, so the set is not a random
  draw of user briefs either way.
- R5 Optics: post-gate data in the headline; the paper already carries post-gate A1 to A5
  in its body.
- R6 Time: deadline 2026-11-04 9:00 PM ET; one writer pass plus a review round.

## Validation log

- Round 1 (2026-11-03, 4 fresh read-only lenses). Verdict: DO NOT PROMOTE.
  - V3 claims/optics (HIGH x2): the pre-registered protocol says "Results go in an addendum,
    never into the submitted paper numbers" with no control-arm exception; promoting after
    seeing the number is outcome-dependent reporting (forking paths: at 60% it would have
    stayed in the addendum). Placing it beside 14/18 reads as improvement (also V2).
  - V1 grader audit (decisive experiment, HIGH): seeded sample of 16 passing eval-final runs,
    read against stills: 4 false passes (25%, Wilson 10.2 to 49.5), 2 unsure. Causes: an
    implicit "compromise" outcome passes a run whose core requirement the agent reported unmet
    (17 of 126 passes are non-strict); prop checks test presence, not place (tape measure on the
    floor beside a closed drawer, claimed inside: verified by eye on still-0 of 1399aed3); no
    orientation check (mug handle sideways, claimed front); probable wrong face (pegboard).
  - V2 statistics: 88.2 (80.8 to 95.6) reproduces; missing pass^3 (37 of 47 three-run briefs),
    strata (themed 81.9, general 94.4, exploratory), overclaims 3; stops are turn-budget (4),
    not time-budget; the dropped run was a base run (round 2, Meta API error).
  - V4 provenance: all 144 base traces 0c840bc, clean, CvOVnJJh, da0834cc; sha unchanged;
    grader code equal. Label 3 wrong: the six themes are the planned fix list (handoff
    9b8098b), not just "failure areas"; the prompt given to the writer is not in the repo.
  - Cross-agent agreement: V2 + V3 (comparison with 14/18 reads as improvement); V1 + V3
    (unaudited grader).
  - Consequence beyond this proposal: the addendum's 126/143 per arm carries the same grader
    gap; the audit result belongs in the addendum as a caveat (hand-tabulated data file).
