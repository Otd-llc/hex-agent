# Known limitations

## Of the result
- **Fit, not strength.** `validate()` checks placement rules and the mesh
  collision gate. Nothing here rates load, vibration, moisture, UV life,
  heat, food safety or real print fit. The agent is told so, and a run that
  claims any of those as met fails the `claimsInScope` check.
- **No new CAD.** The print pack is the existing published parts for the
  build. The agent does not generate geometry or drawings.
- **The brief match is partly checked.** The configurator checks are
  independent of the model. Whether the build meets the brief is checked in
  code only where an eval brief says what to count (families, drawers, BOM
  lines, props); elsewhere it is the model's own statement in `finish`,
  recorded as such. With `--features=acceptance` (off by default) the model
  writes its own checkable requirements first and code holds it to them, but
  those tests are coarse: they missed the same-corner trap (a drawer and a
  spike wrongly read as touching).
- **Abstention is instructed, not enforced.** The categories (carrying a
  person, fuel or heat, restraint, weapons) are in the prompt; code checks
  the outcome only on the eval briefs. It was measured on 6 briefs, three
  runs each per arm. Muse Spark 1.3 on the frozen agent: 18/18 on, 10/18
  off, reported per brief only; the difference is on the toddler step, the
  petrol caddy and the solder station, briefs the prompt names, and
  switching abstention off also removes the way to report a decline (a
  second confound). Muse Spark Open: 17/18 on, 7/18 off under the current
  grader; its two arms ran on different inferred agent commits, so they are
  reported side by side, unpaired. Five of the six briefs are named in the
  prompt. One Muse Spark Open run still called a wall clock met on a clock
  brief it cannot build: the one brief the prompt does not name. Claude
  Haiku and Opus were also run on these briefs in development.
- `OPEN_CAP_FACE` (info) and `LOOSE_BODY` (warning) do not fail a run; only
  error-severity issues do. Known false passes follow from that and from
  missing checks: a base over an empty cell passes with a warning, and the
  pipe-planter check does not confirm the pipe reaches every cell.
- **Development-set rates.** Every Muse rate except the held-out one was
  measured on briefs used to find and fix failures. The 18 held-out briefs
  ran once, pre-committed, on the frozen agent (14 of 18), then four more
  times after that result was seen; two held-out themes were written with
  fixes 1 and 3 in view, and one held-out check misses a handle that is
  present (both counts reported, the check never edited). No build
  was printed or assembled in this evaluation. See
  [docs/submission/paper/paper.md](docs/submission/paper/paper.md).

## Of the platform (as observed 2026-11-02)
- The API is experimental v1 and may change, and it changed through the
  event. Latest release synced here: contract `da0834cc` (deploy 15b, viz
  `d726540`). Results ran on several releases: each EVALUATION.md section
  and each row of the paper's Table 1 names its contract, and
  [HACKATHON_DELTA.md](HACKATHON_DELTA.md) lists every release.
- Spatial constraints (clearances, protrusion, the user's side) are not in
  the contract yet, so the role-graph planner's zones are worked out by
  hand from cells; it will use the configurator's answers once the contract
  carries them.
- The configurator does not serve its contract file. On the live site, the
  smoke check reads the stamp on the published docs, so it could pass while
  the docs and the configurator disagree. For a deploy smoke, set
  `HEX_CONTRACT` to the deployed build's own `hex-api-public.json`.

## Of this build
- **Three Muse models, never pooled.** Muse Spark 1.3 and Muse Wonder 1.0
  (Meta Model API) and Muse Spark Open (Meta's open weights, served by
  Baseten, a Modal Dedicated endpoint or Fireworks) are reported
  separately; Muse Wonder 1.0 has one development run per brief and its
  own row.
- **The checks do not see what a viewer sees.** In 4 of the first 15 demo runs the
  agent put the tall row nearest the default camera, hiding the low row,
  and three of those reported the front row as met; every check passed.
- Claude runs are development baselines. They are labeled `anthropic` in
  every trace and never reported as Muse results.
- **Not measured yet:** the role-graph planner (`--features=rolegraph`,
  off) has unit tests only. It needs an A/B against the interactive default
  and stays off unless it wins. The offline critic (A56) has a framework and
  tests, but has not been calibrated against the owner's verdicts. The
  premades stills have two views, and the full sheet needs a top view.
  Calibration needs the stills each review round actually judged: a build
  fixed after review is a different build. Round 1 lists only its fixes and
  drops, so it measures recall only.
- One visible Chrome window per run; no web UI beyond it and the printed log.
- Pricing constants were copied from the providers' pages on 2026-10-27.
