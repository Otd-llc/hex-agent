# Second-review audit, 2026-11-03: response to the updated-paper review

Answers the updated independent review (rating 9.3, deliverables 1 to 6) at HEAD 5582057.
Three fresh read-only lenses (claims at HEAD, reproducibility and links on a fresh clone,
autonomy classification feasibility); load-bearing findings re-checked by the coordinator.
Nothing is applied until the owner picks. The first audit and its validation:
docs/plans/2026-11-03-technical-audit.md (applied in paper rounds 20 and 21; no regression found).

## Status found at audit time

- The repository is already PUBLIC (gh repo view). A full-history scan found no .env or
  .spend file ever committed and no key or token pattern (every hit was base64 inside a
  share-link fragment). All absolute links resolve (repo, blob/main, tree/eval-final, release
  runs-2026-11-02, configurator, academy API page, cited arXiv pages).
- Fresh clone: D1, D2, D6, A1, A4, A5, A7, A8 and the R1 rescores rebuild identical apart from
  generatedAt. D4 rows rebuild (153 of 154; the missing row is the empty dead-end suite) but
  its spend reconcile needs the unpublished ledgers. D5 and A2 need the live configurator. A3
  and A6 need the unpublished Meta ledger; A3 also the owner's verdict file.
- Prescribed layouts: a regex for coordinate-level prescription (q/r cells, slots, stems or
  part ids, construction tool names, numeric yaw) matches 7 of 14 demo briefs (all drone and
  printing versions), 0 of 36 development briefs (one false positive: nonexistent-part, a
  negative test) and 0 of 48 held-out2 briefs. The first held-out set was not scanned (owner
  rule: never open that file).

## 1. Findings (severity, location, correction)

| # | Sev | Where | Current | Correction | Exp |
|---|---|---|---|---|---|
| 1 | High (submission) | paper.md 45, 83; rendered HTML and PDFs | "[not yet available]" placeholders for the demo video and the public URL and report link | Fill at submission (video link from the owner; public URL is now live), re-render | no |
| 2 | Medium | paper.md 83; addendum.md 31 | A8 "4 false passes (Wilson 10.2 to 49.5%)" reads as a population false-pass rate | paper: "a 16-run grader audit (one Claude reviewer, not blinded, for finding defects) found 4 false passes, so these rates likely overstate success"; addendum: keep the numbers, add "the interval reflects sampling only, not reviewer error; no population false-pass rate is estimated" | no |
| 3 | Medium | paper.md 45; report.md 153 | Only drone and printing briefs are said to fix the layout | add "; the strawberry and terrace briefs name the arrangement (a ring of six around one; rows by height, plants by row) but not the cells", and one sentence: "Coordinate-level prescription appears only in the demo set (7 of 14 briefs, the drone and printing versions); no development or held-out2 brief contains any, so the evaluation rates are on open-ended or partly specified briefs." (needs a small generated data file for number_trace) | no |
| 4 | Medium | VIDEO_SCRIPT.md printing voice | No mention that the v3 brief prescribes the layout | prepend "Version three spells out the layout cell by cell; the model builds it." | no |
| 5 | Medium | ledger.md form (Project Description) | "lets a Meta model design hardware" | "lets a Meta model assemble builds from printable catalog parts" | no |
| 6 | Low-Med | ledger.md form (Meta models answer) | 14 of 18 given as evidence of truthful reporting without its caveat | add "(passes not audited; 2 of the 18 runs overclaimed)" | no |
| 7 | Low-Med | paper.md 18; README.md 14 | "a statement of which requirements were met, partly met or not met" | "the model's own statement of ..." | no |
| 8 | Low-Med | addendum.md 10 | "both arms' pass rates likely overstate success" | "the eval-final arm's pass rate likely overstates success, and the fix arm's, graded by the same checks but not audited, likely does too" | no |
| 9 | Low | paper.md 18 | "natural-language autonomous design" | "design from a natural-language brief" | no |
| 10 | Low | report.md 153 | "named the proven build" | "named the build of the passing runs" | no |
| 11 | Low | VIDEO_SCRIPT.md 44 | "That's the whole brief." | "That's the brief, in short." | no |
| 12 | Low | report.md section 7 | rebuild commands listed, no matrix | add the reproducibility matrix (section 4) and a one-sentence pointer in paper.md | no |

## 2. Claim-evidence (judging-relevant)

| Claim | Status |
|---|---|
| 14/18 held-out (Wilson 54.8 to 91.0), passes not audited, likely overstated; 15/18 counterfactual only | Supported |
| 173/180 a development-set rate | Supported |
| Video is a replay; runs chosen by the owner; briefs revised, never the agent; contradicted claims kept off screen | Supported |
| Drone and printing layouts prescribed | Supported in paper and report; missing in the video's printing segment (finding 4) |
| Strawberry and terrace are open designs (implied) | Overstated (finding 3) |
| "design hardware" (form) | Overstated (finding 5) |
| A8 interval as a false-pass rate | Overstated framing (finding 2) |
| Fix arm's rate likely overstates | Plausible, not audited (finding 8) |
| Model's recovery from NEEDS_TALL_BASE | Supported (trace events 26 to 33) |
| Physical validity | Not claimed anywhere |
| Architecture baseline | Correctly stated as not measured |

## 3. Minimal proposed edits

The replacement text is in the Correction column above. No data, scoring definition or
frozen result changes. Finding 3's count needs a generated file (a short script over the
brief files, regex committed with it) so the number traces.

## 4. Reproducibility matrix (for report section 7)

| Source | Rebuild from the public repository |
|---|---|
| D1, D2, D6, A1, A4, A5, A7, R1 rescores | Yes: each generator reproduces the committed file apart from generatedAt (fresh clone at 5582057) |
| D4 | Suite rows yes; `--write` and the spend reconcile need the unpublished `.spend/` ledgers |
| D5, A2 | Yes with the live configurator (headless browser, contract da0834cc); no model calls |
| A3, A6 | No: they need the unpublished Meta ledger; A3 also the owner's verdict file (sha256 recorded in A3) |
| A8 | Sample and intervals by code; verdicts hand-tabulated |
| D7, D8, H1, H2 | Hand-tabulated reviewer verdicts or hand-written notes |
| D3 (Modal $105.01, credits) | Owner-attested, outside the repository |
| New runs (`bin/suite.mjs`) | Need the Meta Model API and the live configurator |

## 5. Submission blockers

1. Demo video: not yet recorded; its link fills paper.md 45 and the form.
2. paper.md placeholders (video link; public URL and full-report link), then re-render HTML and PDFs.
3. Video integrity: follow VIDEO_SCRIPT.md crops (closing verdict lines and finish line on the drone, printing and terrace runs; no VERIFIED; captions for chosen runs and "passes not audited"); add the printing prescription line (finding 4).
4. GitHub settings now that the repo is public: About line, homepage, topics, social preview.
5. Form answers: findings 5 and 6.

## 6. Optional experiments (not run)

1. Count-only prescription scan of the first held-out set: a script that prints only the count of briefs matching the same regex, with no brief text shown. Resolves whether the headline set has any prescribed brief. Minutes, no credit. Needs the owner's OK because of the never-open rule.
2. Blinded L1/L2 classification of held-out2 (open-ended vs partly specified), by a fresh session given only brief texts and a pre-committed rubric, reported descriptively from A7's per-brief results (no interval below 10 briefs per category). About 1 to 2 hours, no Meta credit; post hoc. Value: shows whether the agent needs counts or arrangement given. Sufficient without it: yes (finding 3's sentence answers the core concern).
3. Small blinded human audit: the owner (or another person) rates 10 preselected passing runs from stills and brief only, without grader verdicts; disagreements reported. Value: the first human, blinded check of false passes. Owner time, no credit. Not a substitute for a functional-relation grader, which stays future work.
