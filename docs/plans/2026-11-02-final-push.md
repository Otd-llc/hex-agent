# Final push before the 2026-11-04 deadline (2026-11-02), v3

**Done (do not re-run):** items 1, 2, 4, 5 and the item 3 smoke. 36x5 173/180 (14-16-28-867Z,
10.33 USD); held-out x4 55/72 (15-47-26-043Z, 3.81); fixes-off 63/65 (16-56-59-857Z, 4.05);
abstain on 18/18 (17-16-28-256Z, 0.69), off 10/18 (17-22-33-831Z, 2.13); Wonder smoke
(17-46-26-922Z, 0.08). Running: Wonder 36x1 (17-48-59-000Z), the last eval suite.

Owner: Raven. Lane 3 (hex-agent). Submission due 2026-11-04 9:00 PM ET (2026-11-05 02:00 UTC),
Startup track, Push the Frontier (docs/submission/RULES.md). Rubric: Impact 30, Use of Meta AI
tooling 25, Technical depth and execution 20, Demo 25; a three-minute video is a primary artifact.

## State

- Agent frozen at tag `eval-final` (0c840bc); agent code identical to 56ef72c. Live site deploy
  15b (contract da0834cc, page `/assets/hex-CvOVnJJh.js`).
- Muse Spark 1.3 (Meta Model API): 36x1 low 35/36, 36x1 medium 35/36, held-out 18x1 low 14/18
  (`runs/suite-2026-11-02T14-02-50-056Z`, concurrency 3). RUNNING: 36x5 low, purpose eval,
  concurrency 6 (`runs/meta-eval-36x5.log`, suite 14-16-28-867Z).
- Ledger: credit 150, reserve 50, dev cap 45, eval cap 40 (code defaults; check the suite's
  `spend:` line shows them). `--purpose=demo` may spend all remaining credit, not only the
  reserve. Meta's default effort is medium: every command passes `--effort=low`.

## Rules that hold throughout

- Muse Spark 1.3 and Muse Spark Open are different models: never pooled or compared as one.
- Claude: development only; never in the demo or the results.
- **Freeze window.** From the start of W7 until the last EVAL suite ends (the Wonder 36x1,
  suite 17-48-59-000Z), no commit and no edit to any tracked file in C:/zzz/hex-agent (agent.commit
  and the dirty flag enter every trace and the comparison key). Script, doc and paper work in that
  window happens in a separate worktree or in untracked files, and is committed after the window.
  W4 demo suites are not eval suites and do not extend the window (round 2).
- **Demo pre-flight (W4 and the live run).** HEAD may move past 0c840bc, but
  `git diff --quiet 0c840bc HEAD -- src ':!src/runkey.mjs' bin/run.mjs bin/suite.mjs package.json package-lock.json`
  must pass and the tree must be clean (runkey.mjs is read only by bin/ reporting scripts, never by
  a run; round 3). Nothing else under src/ changes until the last demo run and the live run are
  done: the replay's `mode` header lives in bin/replay.mjs (rewrite `#hexagent header .k` after
  installOverlay), never in src/overlay.mjs, which session.mjs:7 loads at run time. The paper says "agent code identical to eval-final; HEAD X
  adds only briefs/scripts". Demo spend checked before each suite: ledger demo total + projection
  x1.3 <= 15 USD (no code stop exists).
- **After every suite:** `git status --porcelain --untracked-files=no` still empty (dirty is sampled
  once per suite process).
- **Held-out.** Checks, grader and briefs of the held-out set are never edited; grader changes
  wait until W7 ends and are reported both ways for the held-out set. Nothing learned from
  held-out traces changes the prompt, tools or demo briefs.
- **Pre-flight before every EVAL suite** (demo suites use the demo pre-flight; written check, then the suite's header line confirmed):
  `git rev-parse HEAD` = 0c840bc and `git status --porcelain --untracked-files=no` empty; header
  shows the intended model, effort low, purpose, features and brief count; projected cost x1.3 fits
  `headroom` for its purpose. After every suite: exactly one `pageBuild` across its traces.
- **Stops.** Every Meta suite runs with `--infra-stop=3` (default) and is watched: stop by hand on
  repeated 429/5xx/timeouts or harness errors. Lost runs are not re-run unless decided before the
  suite starts; paired results require equal n per brief per arm. `time budget` stops are
  reported apart.
- Statistics: clustered or paired intervals use the t critical value with items-1 df below 30
  items (generator change, after the freeze window); per-brief scores only below 10 items.

## Work, in order

### 1. DONE. 36x5 finished. Re-project costs from its own per-run mean (~0.066 USD).

### 2. DONE. W7 held-out repeats (owner yes; record in RULES.md)

- Command (pre-flight first): `META_API_ALLOWED=1 node bin/suite.mjs --model=muse-spark-1.3
  --purpose=eval --effort=low --briefs=evals/briefs-heldout.json --heldout-final --repeat=4
  --concurrency=3`
- Same commit, contract, page, concurrency as the 18x1. Report the 18x1 (pre-committed) result
  beside the x5. About 72 runs, 3.6 to 3.9 USD.

### 3. W8 Muse Wonder 1.0 (smoke first)

- Smoke: `--model=muse-wonder-1.0 --purpose=eval --effort=low --briefs=evals/briefs-wide.json
  --only=minimal-bin`. Check that effort low is accepted, cached tokens are reported, cost per run.
- Then the 36x1 (`--briefs=evals/briefs.json,evals/briefs-hard.json,evals/briefs-wide.json`,
  concurrency 3) only if smoke cost x 36 x 1.3 fits eval headroom. Descriptive row, its own model.

### 4. DONE. W5 fixes 1-4 harm test (ran)

- The 13 target briefs passed every Muse Spark 1.3 run (36x5: all finished x5 at 5/5), so a gain
  cannot be shown. Optional: run only the fixes-off arm (`--features=-ewDrawers,-rollbackRead,
  -topology,-verify`, `--only=` the 13 ids, x5, concurrency 6) and pair it with the 36x5's default
  runs on the same commit and page. Claim: "turning the agent-side fixes off cost x points (CI)", or
  "both arms passed every run; no effect detectable". One joint effect, per-brief scores, no
  per-fix attribution; the flags gate only what tools.mjs/agent.mjs implement. About 4 USD.
- Arm is read from each suite's summary.json `features` (the trace does not carry the four flags).

### 5. DONE. W6 abstention (ran; per-brief scores only)

- 6 briefs: per-brief scores, no interval. The ABSTAIN block names 5 of the 6, so it measures
  following named hints; the paper says so. The cleaner evidence is the held-out negatives (3
  declined, 1 overclaimed in the 18x1). Optional, about 2 USD; recommendation: drop, and report the
  held-out negatives instead.

### 6. W1 do-nothing baseline (offline + one browser check, no model)

- Definition: the starter base left as served, finish with every requirement unmet (worst case
  for us); also report the empty-list and empty-build variants. One headless browser session with
  no model gives mesh/printPack/roundTrip for the starter base.
- Round-1 agents estimated 3/36 dev, 4/18 held-out, 3/6 a58; NO artifact exists (round 2). Write
  `bin/do-nothing.mjs`: one synthetic trace per brief (the brief's own start state where it has one:
  ho-add-storey-in-place and ho-swap-notch-drawer start from saved builds; else the starter base),
  finish with every requirement unmet, plus empty-list and empty-build variants; score with the
  rescore grader (checkBrief / configuratorPass / overclaimed). Commit script + output. Report
  against the pooled held-out x5 per brief (14/18 x1, 55/72 x4), not 14/18 alone.

### 7. W3 grader audit

- One passing run per brief from the 36x5 (seeded, seed recorded), plus every pass of briefs whose
  key requirement has no coded check (pipe-planter). Report "false passes at most X% (Wilson
  upper)", never "none"; keep the pipe-planter caveat whatever the audit finds; not blinded.

### 8. W2 broader overclaim count: DROPPED

- No link between free-text requirements and checks exists; a mapping made under deadline would be
  unreproducible. The paper keeps the all-met lower bound.

### 9. W4 demo candidates (demo purpose)

- **Briefs carry the design** (the frozen agent's prompt has no design rubric; its "under about 40
  parts unless the brief needs more" is soft, agent.mjs:32): 4 to 5 briefs weighted to planters
  with height, at most one drawer or desk brief with a stated purpose and setting. The owner's
  planter picks were 71 to 150 nodes (mostly caps/bolts); Muse Spark 1.3's 36x5 median is 19
  parts, max 50. So: size briefs in structural parts (about 12 to 15 bases and bins), let a brief
  state its size; show the owner a still at the reachable size alongside the work (no waiting).
- **Feasibility through the agent's own tools, no model**: `createTools(hex)` + `t.run(...)` as
  bin/smoke-helpers.mjs does; require at most about 20 tool calls (leaves get_build, look,
  check_build, finish inside 30 turns). Never shown.
- **Checks for height**: `stack: 3`, `soil: N`, `perFamily: {prop, family: 'bin'}`,
  `noIssue: 'PLANT_NOT_IN_SOIL'`, `onTopStorey: 'bin'`. No check proves plants sit on upper storeys;
  the reviewer refutes "planted at height" from stills and the disclosure states the gap. No
  `start` builds (replay starts from the live starter base, as the run did).
- Committed `evals/briefs-demo.json` after the eval freeze window, before the first run; demo
  pre-flight above; `--purpose=demo --effort=low`, x5 each. Every trace kept.
- **Fallback ladder** (decided now): (a) 5 more repeats of the best briefs; (b) a revised brief as
  a new id, old one kept; (c) effort medium; (d) Muse Wonder. Stop at 15 USD of demo spend.
  Plain-but-honest fallback (an existing passing build) only with the owner's OK.
- **Review before the owner**: a fresh reviewer tries to refute each candidate's purpose and prop
  claims from its stills; failures dropped. Then a NEW page generator (sandbox/page.mjs is
  hand-builds only and says "not by the agent") reading trace.json + summary.json, and a still
  script (load the run's share link, screenshot both themes as sandbox/run.mjs:30-34 does, at a
  fixed `view` {az, polar, fit}; no "film camera" exists in this repo). Page shows brief verbatim,
  checks, the model's report, model/effort. About 2 to 3 hours. The owner picks by looking.
- Disclosure: the demo set's k/n and pass^5 in the paper ("demo set, written for the video, not an
  evaluation"); on screen the brief verbatim, model and effort, and "owner's pick of N runs; k
  passed all checks", N = every demo-purpose run of that brief family, every ladder rung included.
  A persistent lower third in the agent segment: "Configurator, parts and plant models: One
  Thousand Drones' product. Built this week: the agent, its tools, checks and evaluation.
  Configurator releases during the event: not claimed."

### 10. Replay shows the model (no model calls)

- Rewrite bin/replay.mjs to walk ALL events in time order (stepsOf keeps only apply/undo today):
  push linesFor(e), inject still-N.png (about one per run, near the end) as an image, push the
  verdict lines as session.mjs:162-168 does. Wording everywhere: "the model's own messages, tool
  calls and the configurator's rulings" (traces hold short narration, no reasoning text; never say
  "reasoning"). The overlay header is hard-coded "live" (overlay.mjs:77): bin/replay.mjs rewrites
  it to `replay of <runId>` after installOverlay and moves its banner into that header (they
  overlap bottom-right). src/overlay.mjs is not edited.
  Replay label adds effort. "Matches original" also compares staging (props, soil) to
  trace.finalStaging. Rehearse one dressed-planter replay before W4 ends. About 2 hours.
- Live run, one picked brief, headed, screen-recorded: `META_API_ALLOWED=1 node bin/run.mjs
  "<brief>" --model=muse-spark-1.3 --purpose=demo --effort=<the picked trace's>` (run.mjs
  defaults to Meta's medium). Demo pre-flight and the demo spend check first. The live run counts
  in N; it happens before the paper's last round (Tue night), or the paper says "N excludes the
  filmed live run". If it fails on camera: use the replay (decided now).
- Ask Lane 1 to hold deploys from W4 until filming, or rehearse every replay after a deploy.

### 11. Paper, docs, review (time-boxed)

- Generators (round 2, concrete):
  - `src/runkey.mjs`: add promptSha256 and the arm (from summary.features) to the key, so
    fixes-off and abstain-off never pool with default in compare/tally.
  - `bin/index-suites.mjs`: `meta: 'meta.jsonl'` ledger; arm() emits -ewDrawers -rollbackRead
    -topology -verify when false; a `heldout` class exempt from the problem line.
  - `bin/presentation-data.mjs`: p11 Meta 36x5; held-out block (x1 alone, and pooled x1+x4 keyed
    suite+id+attempt, as-run); shared t table (df 1-29) below 30 items, intervals suppressed below
    10; arm field in score(); hosts row per MODEL (Wonder never pooled with Spark 1.3);
    promptSha256 in provenance; method string. paper-render label regex for p11.
  - `bin/presentation-extra.mjs`: Meta fixes-off pair (36x5 vs 16-56-59-857Z, 13 ids, t12, off
    minus default); Meta abstention per-brief only (on 17-16-28-256Z, off 17-22-33-831Z); existing
    abstention and honesty7 blocks to per-brief; replace 2.8*se.
  - `docs/data/suite-classes.json`: heldout 14-02-50-056Z, 15-47-26-043Z; eval 14-16-28-867Z,
    16-56-59-857Z, 17-16-28-256Z, 17-22-33-831Z, 17-48-59-000Z (Wonder); smoke 17-46-26-922Z.
    Matching EVALUATION.md sections.
  - Held-out: never run rescore.mjs on held-out suite dirs; any rescore shows as a second labelled
    column only. Drop the "time budget reported apart" rule (no generator does it; none occurred).
  - Ledger lists every published number the t change moves; report.md:41 "±1.96 SE" updated.
- **Claims rules (round 3, claims lens):**
  - Held-out headline = x1 14/18 (Wilson), pre-committed. x4 presented as a later extension
    "decided by the owner after seeing 14/18"; pooled 69/90 only with the clustered t17 interval,
    noting it barely narrows. W1 compares against x1 first, pooled second. RULES.md records the
    timing, not only "OWNER YES".
  - Held-out not independent of fixes 1-4: the held-out themes (modal-review.md:289-310) and
    76e977d (22:26) predate fixes 1/3 (22:29, 22:38); themes #8 and #11 target fix behaviour.
    Disclose; also report held-out without ho-west-drawer and ho-two-groups-of-three.
  - Grader defect both ways: as-run primary. Alternate computed by a separate script applying
    exactly the e196a37 substitution (`family: handle` -> `bom: handle`) in memory, output to
    docs/data only, never into a suite dir. Label: "found by reading held-out traces; the
    same-side requirement remains unchecked". Per-brief table of held-out failure causes (no
    regrading): cat-ramp safety, quiet-pretty-drawer keyword check, nozzles-hexkey maxParts 12 vs
    15, drawer-handle-side check defect.
  - Fixes-off: harm test only. "63/65 off vs 65/65 on, not distinguishable; this design detects
    harm, not gain; arms ran 2.7 h apart." Never "cost".
  - Abstention: two confounds (prompt names 5 of 6; off removes finish's `outcome` field, so
    "declined" is impossible). "The difference appears only on prompt-named briefs; moving-clock,
    unnamed, passed 3/3 in both." Held-out negatives pooled per brief incl. cat-ramp 0/5; they
    show behaviour, not an effect.
  - Every Spark 1.3 overclaim/honesty figure carries the `verify` (fix 4) caveat (report.md:157
    has it for Fireworks only).
  - Title, abstract and video numbers card lead with held-out x1, every dev rate paired with it,
    model named on every number.
  - Demo k/N per model and effort (rungs c/d are separate rows); live attempts from runs/<runId>
    counted by hand and shown.
  - Use of Meta AI tooling evidence, generated: calls per model, servedBy tally, cached share,
    token-ledger total by model and purpose ("estimate until checked against the console");
    publish a summary of meta.jsonl. "Answered every call" becomes "N server errors (500/503),
    all retried successfully".
  - Lower third keeps "configurator releases during the event: not claimed".
  - Must-update additions: paper.md:8, 20, 82; report.md:11, 27, 31, 102, 109, 151, 158, 161;
    ledger.md:146; RULES.md:78; HACKATHON_DELTA.md:77, 96.
- Then paper/report/ledger, number_trace 0/0, review rounds until 2026-11-04 12:00 ET at the
  latest, then ship what is there.
- Must-update (now false): README.md:15,19; KNOWN_LIMITATIONS.md:32,52; WRITEUP.md:103,110;
  then grep the tracked tree for "not been called", "have not been run", "held-out" before the
  flip. Also VIDEO_SCRIPT.md (Model API not called, held-out not run, Baseten trace,
  "empty bench"), HACKATHON_DELTA.md (same), DESIGN_RUBRIC.md line 3, paper.md:79 (held-out not
  run), report.md:188 (Appendix A row 6) and row 11 (do-nothing), report.md "Confounded changes"
  (fixes 1-4 now measured), ledger.md C22, C23, X8, O9, O16.
- Commit after the window: RULES.md (held-out x4 OWNER YES; W5/W6 run; item-3 demo rule), the
  plan, generators, runkey, classes, regenerated docs/data, do-nothing script+output, the 11-02
  suite folders. runs/*.log and .spend/ stay ignored unless Q4 says publish.

### 12. Video, repo flip, submission

- **Cut order when late** (first cut first): the live run (replay is the fallback) -> W3 grader
  audit (paper says "not audited") -> W1 do-nothing (no round-1 estimate in the paper) -> t-table
  refactor (keep z, caveat it) -> stale-doc polish beyond the truth fixes. Never cut: video, public
  repo, form, the "not been called / not been run" truth fixes.
- **Owners** (C = Claude main session, S = Claude subagent, O = owner): generators, do-nothing,
  paper edits, page/still/replay, cut = C; candidate reviewer, grader-audit reviewer, paper review
  rounds = S (read-only, report to C); still look, pick, live run, flip, upload, form = O;
  provider page Meta row = Lane 1 on O's OK.
- **No invented timeline** (owner, 2026-11-02): work runs continuously in dependency order; the
  only date is the submission deadline. Owner input is asked for only when actually blocked.
- **Video (W10): the owner guides creation directly.** Claude prepares material on request
  (replay recordings via Playwright recordVideo, captions quoted from traces, ffmpeg cuts;
  ffmpeg 8.0.1 installed). No pre-planned cut, voice or music.
- Owner flips the repo public; Lane 1 updates the provider page Meta row on the owner's OK; owner
  submits the form (answers drafted in ledger.md); optional X post.
- **Run screenshots** (owner, 2026-11-02, option 3): new suites commit traces and summaries only
  (`runs/suite-*/*/*.png` ignored); the PNGs go in a GitHub Release zip linked from the paper.

## Budget (USD, re-projected)

| item | runs | eval | demo |
|---|---|---|---|
| spent | | 0.90 + 36x5 so far | |
| 36x5 | 180 | about 10.2 to 12 | |
| W7 held-out x4 | 72 | 3.6 to 3.9 | |
| W8 smoke + 36x1 | 37 | 5.3 to 7 (about 26 if caching fails: then not run) | |
| W5 off arm only | 65 | about 4 | |
| W6 | 36 | about 2 (optional) | |
| W4 | 25 to 50 | | 3 to 6, stop at 15 |

Eval total about 24 to 30 of 40 without W6; demo 3 to 15. Owner action: read the Meta console
spend after the 36x5 and compare it with the ledger (no Meta reconcile command exists).

## Open for the owner (one at a time)

1. ~~OK to run the held-out set four more times (W7)?~~ OWNER YES 2026-11-02 (record in RULES.md after the freeze window).
2. ~~W5 harm test and W6: run or drop?~~ OWNER: run both (done: 63/65 vs 65/65; abstain on 18/18, off 10/18).
3. RULES decision: the demo shows agent builds; it is not OTD promo content (otd-hex-builds family
   law does not apply) and is never reused as content without the family pipeline.
4. ~~Publish runs/ traces?~~ OWNER: traces + summaries in git, PNGs in a Release zip. .spend/
   stays ignored; a generated meta.jsonl summary goes in docs/data.
5. Ask Lane 1 to hold deploys until filming.

## Validation log

Round 1 (2026-11-02, five read-only agents, one lens each: statistics and claims, sequencing and
gates, cost and ledger, demo, commands and code). About 70 findings, about 20 HIGH, no CRITICAL.
Verified by hand: W5 target briefs 5/5 in the 36x5; z = 1.96 hard-coded in the generators; the
starter base in every first get_build; the held-out guard checks only the flag. Cross-agent
agreements (all folded): W5 ceiling and arm labelling (A, B, E); t critical values (A, E); W2 has
no requirement-to-check link (A, E); W1 definition (A, E); freeze window (A, B, E); costs low (A, B,
C); Wonder smoke first (B, C, E); effort default medium (A, B, C). Demo lens: briefs must carry the
design, fallback ladder, disclosure of the pick, replay must show the model's own text.
Round 2 (2026-11-02, two read-only agents: demo/video execution; data integrity runs-to-paper).
29 findings, 10 HIGH, 0 CRITICAL; gate NOT passed. Verified by hand: provenance.mjs:18 commit =
HEAD; agent.mjs:32 soft 40-part rule; sandbox/page.mjs:87 "not by the agent"; "film camera" only
in this plan; overlay.mjs:77 hard-coded "live"; index-suites arm() lacks the fix flags; runkey
KEY_FIELDS lack features/promptSha256; 1.96 in presentation-data:18,36,172 and extra:43,97,102
(Wilson 1.96 correct); paper.md:79, report.md:188, ledger C22/C23 stale. One evidence error:
report.md:27 does not mention Wonder (stale text is elsewhere). Clean per data lens: 371 traces
one commit/contract/page/model/effort, dirty false, ledger = logs, n equal per arm, grader
unchanged 56ef72c..0c840bc. Agreement across both lenses: freeze vs W4 commit contradiction.
All folded above (v3). Round 3: fresh lenses on v3 (demo items 9, 10, 12 again).

Round 3 (2026-11-02, two read-only agents: schedule/critical path; claims a hostile judge would
catch). 27 findings, 8 HIGH, 0 CRITICAL; gate NOT passed. Verified by hand: session.mjs:7 loads
overlay at run time; runkey.mjs used only by bin/ scripts; README:15,19, KNOWN_LIMITATIONS:32,52,
WRITEUP:103,110 stale; run folders 611 MB; owner on CST; held-out 76e977d 22:26 before fixes 1/3
22:29/22:38; e196a37 fixed the same handle check on dev; 9 traces carry retried Meta 5xx. Both
lenses agreed: overlay edit breaks the demo pre-flight (now bin/replay.mjs only). All folded (v3).
Yield: round 1 ~70, round 2 29, round 3 27; HIGHs 20, 10, 8, and round 3's are about the PAPER's
claims and the clock, not the plan's mechanics. Per otd-validate-plan "rounds have a floor":
stop reviewing the plan; execute; the paper and the demo get their own review rounds.
