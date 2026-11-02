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
  the outcome only on the eval briefs. It was measured on 6 briefs: Claude
  Haiku and Opus in development, and Muse Spark Open (17/18 on, 7/18 off
  under the current grader). The two Muse arms ran on different inferred
  agent commits, so they are reported side by side, unpaired, and five of
  the six briefs are named in the prompt. One Muse run still called a wall
  clock met on a clock brief it cannot build: the one brief the prompt does
  not name.
- `OPEN_CAP_FACE` (info) and `LOOSE_BODY` (warning) do not fail a run; only
  error-severity issues do. Known false passes follow from that and from
  missing checks: a base over an empty cell passes with a warning, and the
  pipe-planter check does not confirm the pipe reaches every cell.
- **Development-set rates.** Every Muse rate was measured on briefs used to
  find and fix failures; the held-out briefs have not been run. No build
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
- **The Meta Model API has not been called yet.** Every Muse result so far
  is Muse Spark Open, Meta's open weights served by Baseten, a Modal
  Dedicated endpoint or Fireworks. A cents-sized smoke on the Model API
  comes first, then the demo runs.
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
