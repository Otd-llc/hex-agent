# Technical audit, 2026-11-03: response to the independent review

Answers the independent technical review of the hackathon paper (priorities 1 to 8,
deliverables A to E). Read-only audit at HEAD df74e72 by five lenses (verification boundary,
held-out statistics and baselines, novelty, Meta-model role and demo, clean-clone
reproduction); every load-bearing finding below was re-checked against the code or data.
No paper text, data or evaluation result has been changed. Nothing here is applied until
the owner picks.

## A. Findings

Severity: Critical / High / Medium / Low. "Exp" = the correction needs a new experiment.

| # | Sev | Where | Current claim or behavior | Why it is a problem | Evidence | Correction | Exp |
|---|---|---|---|---|---|---|---|
| 1 | High | paper.md Method (~25) | The pass definition does not state what the checks cannot see, nor two pass modes | A pass is read as functional correctness. Warning-level issues still pass (only errors fail), and a brief with no outcome check passes a compromise whose core requirement the agent itself reported unmet. A8's cause 1 is this. The report states the boundary (report.md 41, 378); the judge copy does not | src/agent.mjs:324 (`rules` fails on errors only); src/checks.mjs:160 (implicit outcome built or compromise); A8 | Add the verification-boundary statement (C1) | no |
| 2 | High | VIDEO_SCRIPT.md; bin/replay.mjs:103-106 | Every replay ends with the run's checks and `VERIFIED` | On the drone, printing and terrace runs this stamps contradicted claims as verified; `requirementsClaimedMet` reads the model's own statuses (agent.mjs:322). The script's "crop those two lines" refers to report lines the overlay never shows | replay.mjs:103-106; agent.mjs:322 | Script: crop the end card on those three runs, and on the terrace crop the overlay's "All twelve plantings are in and visible" line; on the checks card gloss `requirementsClaimedMet` as the model's own report | no |
| 3 | High | bin/addendum-arms.mjs:14,24; report §7; addendum | "node bin/addendum-arms.mjs --write" rebuilds A7 | In a clean clone it fails: the 12 `runs/addendum-*.log` files that map arm and round to suite are ignored (`.gitignore` `runs/*.log`). The addendum's result cannot be rebuilt from the public repo | git check-ignore; clean-clone run; matches exactly once the logs are present | Put the 12 suite ids in the script (they are in A7 `sets.*.suites`) or force-add the logs | no |
| 4 | Medium-High | paper.md opening (8); form answer | 14 of 18 held-out, Wilson 54.8 to 91.0, with no caveat beside it | Its passes were never audited, while audits of the development set (4 of 36 briefs, D7) and held-out2 (4 of 16 runs, A8) found false passes; two of 18 themes were written with fixes 1 and 3 in view (disclosed only in Limitations) | D1 heldout.x1, D7, A8, paper.md 60 | Add the clause in C2 | no |
| 5 | Medium | paper.md 48; report.md 92 | "both counts are reported: with that correction the held-out results are 15/18 and 74/90" | Gives the counterfactual equal standing; the correction runs one way only (a false failure was fixed, passes were not audited) | D6 primary "as run"; ledger C45 | Replace with C3 | no |
| 6 | Medium | paper.md Limitations (58 to 66) | No mention of an architecture baseline | Do-nothing is a floor, not an ablation. No existing run compares the agent with a minimally scaffolded Meta agent on the same API; the only same-commit Meta ablations switch off fixes 1 to 4 (13 briefs, at ceiling) or abstention | Inventory: D2 metaFixesOff, metaAbstention, A1, A7; src/agent.mjs:97-99 | Add the bullet in C4 | to close it, yes |
| 7 | Medium | paper.md (no related work) | Novelty is implicit ("Push the Frontier claim", "extends the configurator") | Close prior art exists: Kogler et al., Configuration Copilot (ConfWS 2024), natural language driving a product configurator through a constraint solver. A judge who knows it could read the paper as unaware | ceur-ws.org/Vol-3812 paper 14 (title and authors checked) | Add the related-work paragraph in C5 | no |
| 8 | Medium | paper.md 22 to 27, 61 | Who decides what is partly stated; the drone's multimeter standing on end is presented as the model's doing | `helperApply` re-sends the configurator's tryInstead automatically, without the model choosing it; in f24f0f99 all five refused props were re-placed this way, the multimeter among them | src/tools.mjs:1156-1173 | Add the who-decides table in C6 and the attribution fix | no |
| 9 | Medium | paper.md 33; VIDEO_SCRIPT | Brief revisions "named what the agent's own tools had already proven" | The drone v5 and printing v3 briefs give the layout cell by cell; the model turns it into accepted operations and recovers from refusals, but does not choose the layout. "Proven" also sits beside the drone run's contradicted drawer claim | trace briefs of f24f0f99, dfdebefd | C7 | no |
| 10 | Medium | paper.md 33; report.md 151 | Each demo run "reloaded from its share link" | The script shows the reload only for the printing station | VIDEO_SCRIPT 78-79 | Scope the sentence, or film all four reloads | no |
| 11 | Medium | paper.md 33 | The paper never says the video is a replay | A reader may take the video as live | bin/replay.mjs:37,69 (banner says REPLAY, no model running) | One sentence: every agent frame is an accelerated replay of the recorded trace, labelled REPLAY | no |
| 12 | Medium | paper.md 33; ledger O37 | The printing run's rods claim and the terrace's every-plant-visible claim are contradicted by their stills; the ledger says the paper reports them | paper.md reports only the drone's two claims; the other two are in report 3.4 only | ledger C85; report.md 155 | Add one sentence to paper.md 33 (C8) | no |
| 13 | Medium | paper.md 8, 18, 22 | "a statement of which requirements were met"; "to a valid build"; "with all-met claims checked" | Each reads as functional verification: the statement is the model's; "valid" is configurator validity (defined only at 63); all-met claims are checked only against coded checks and rules | src/checks.mjs:281-285 | C9 | no |
| 14 | Medium | report.md 11 (abstract) | "a check that the model's met claims stay within what the configurator can verify" | It is a keyword regex on strength, heat, water and food safety words | src/agent.mjs:413-420 | "a keyword check on met claims about strength, heat, water or food safety" | no |
| 15 | Medium | paper.md 70; report §7 | A3 "reads the Meta ledger and the owner's picks file" | A3's critic-versus-baseline result needs the owner's unpublished verdicts (outside the repo, sha256 recorded) and the unpublished ledger; paper.md does not say so | clean clone: ENOENT | State it, or publish the 60 per-build keep or fix verdicts | no |
| 16 | Medium | report §7; bin/index-suites.mjs | "D4 ... can be rebuilt with --write" | Without the ledgers it writes zero spend totals silently; at HEAD it adds 22 post-gate suites. The committed D4 is a snapshot at the review gate | clean clone | Say "D4 as committed at the review gate"; refuse --write without ledgers | no |
| 17 | Medium | docs/paper/index.html and the paper PDF | `href="addendum.md"` | Broken: docs/paper/addendum.md does not exist, and a relative .md link in a PDF goes nowhere | ls docs/paper | Absolute GitHub URL once public, or an addendum PDF | no |
| 18 | Medium (blocker) | repo visibility; paper.md 70 | Public URL placeholder; release runs-2026-11-02 | Repo is private: the release and every link are unreachable to judges | gh repo view | Owner flips after the video (decided) | no |
| 19 | Low | paper.md 18 | "hex-agent extends the configurator" | It is an external harness driving the page through Playwright, not part of the product | src/bridge.mjs | "drives the configurator from outside, through its public API" | no |
| 20 | Low | paper.md 22 | "173 of 180 development runs" in the Meta-tooling payoff without the development-set label | statistics rule: development-set rates are labelled where they appear | | add "(a development-set rate)" | no |
| 21 | Low | paper.md 70; addendum | A2 described as "no model calls" | It also needs the live configurator (opens a browser), like D5 | bin/do-nothing.mjs | add "needs the live configurator, contract da0834cc" | no |
| 22 | Low | VIDEO_SCRIPT | Nothing on screen says the runs were chosen; printing segment gives no pass rate or brief history | Selected runs could read as typical | | caption "chosen by the owner from its brief's runs; every run counted in the paper"; printing card "v1 0 of 5; v2, v3 3 of 3 completed" | no |
| 23 | Low | test/uptime.test.mjs:141-180 | Real Modal host as a test fixture | Host is public once the repo is; endpoint and token were deleted 2026-11-02 | git grep | replace with a placeholder host | no |
| 24 | Low | runs/suite-2026-10-27T19-48-20-168Z | "Every suite folder is committed" | Four empty run folders (git keeps no empty dirs) | D4 diff | footnote or .gitkeep | no |

## B. Claim-evidence audit (judging-relevant)

Fully supported: 14 of 18 held-out on one pre-committed run as the primary result everywhere, Wilson 54.8 to 91.0 (D1); the x4 repeats labelled as decided after x1; development 173/180 called optimistic in the opening; Meta models never compared; no build printed, not deployed, adoption not established; pre-existing work separated from event work; the future pipeline "designed or partly built, not demonstrated" (owner-kept, C56); abstention +30.6 (9.5 to 51.7) framed as the feature's effect, not a safety result; vision critic and reviewer advisory, not distinguishable from trivial baselines; addendum null on graded pass rate with the A8 caveat; every generated number reproduces (D1, D2, D6, A1, A4, A5, A8 byte-identical in a clean clone; A3, A6, A7 with the private inputs).

Supported with important qualifications: the title's "checked by the product's rules and our code" (coded checks do not test place, orientation, facing or reach); "print packs the configurator accepts" (a pack URL exists; printability untested); 15/18 (counterfactual, one-directional); the demo pass counts (selected suites; drone and printing briefs fix the layout).

Overstated: "a statement of which requirements were met" (paper 8); "all-met claims checked" (22); "already proven" (33); "each reloaded from its share link" (33); report abstract "stay within what the configurator can verify".

Unsupported: none found in paper.md.

Contradicted by available evidence: the replay end card `VERIFIED` on the drone, printing and terrace runs (video, not paper); the ledger's statement that paper.md reports the printing and terrace contradictions (only report 3.4 does).

## C. Minimal paper corrections (exact text)

C1, paper.md Method, after the pass definition:
"A pass establishes validity in the configurator: no error-level placement rule, a clear mesh-collision gate, a print-pack link and a share link that reloads with the same parts (src/agent.mjs). It also requires the brief's coded checks, which count parts, props, soil and storeys and test stacks, groups, spike kind and open drawers (src/checks.mjs). Those checks do not test where a prop sits, which way a part faces in plan, or whether one part reaches or serves another; warning-level issues (a base over an empty cell, a loose body) and a compromise whose core requirement is reported unmet still pass. Beyond these checks, functional correctness rests on the model's own statement, and physical validity was not tested: nothing was printed."

C2, paper.md opening, after "(Wilson 95% interval 54.8 to 91.0%)":
"; its passes were not audited, and audits of other sets found false passes, so it likely overstates success; two of the 18 themes were written with fixes in view"

C3, paper.md 48:
"Held-out checks are never edited, and the as-run 14 of 18 stays the result. As a counterfactual only: with the development-set correction this one brief would pass, giving 15 of 18 and 74 of 90 (D6); the defect was found by reading failures, and passes were not audited, so the counterfactual corrects in one direction only."

C4, paper.md Limitations, new bullet:
"No architecture baseline was run. Do-nothing is a floor, not an ablation: no Meta run used the same configurator API with a minimal tool layer (no contract checks, refusal alternatives, verify step or honesty check). The only ablations on the same commit and page switch off fixes 1 to 4 (13 briefs, at ceiling) or abstention, so what the tool layer adds beyond the model and the configurator is not measured."

C5, related work (after Impact; references verified for Kogler et al. and Advani, others opened by the auditing agent):
"Related work. Language-to-CAD systems generate geometry: Text2CAD [1] produces parametric CAD sequences from text, CADCodeVerify [2] has a vision-language model question its rendered output and revise the CAD script, and CAD-Assistant [3] plans FreeCAD Python calls and inspects each result. hex-agent generates no geometry; it places parts from an existing printable catalog through a configurator whose placement rules and collision check decide validity, and it returns a share link, a parts list and a print pack. Closest in aim is the Configuration Copilot of Kogler et al. [4], in which a language model turns natural-language requirements into constraints that a solver resolves over a product line; there the solver searches, while here the model assembles a spatial build turn by turn and reads the configurator's refusals and suggested alternatives. Agent benchmarks score the state an agent leaves behind, as WebArena [5] does on websites and τ-bench [6] does on tool calls under domain rules, with pass^k for consistency; our grader likewise scores the final build. We also score the agent's own statement of which requirements were met, a failure Advani [7] measures as false success on service and API tasks. The contribution is the integration of these pieces on one live, manufacturing-oriented product, not a new modeling method."
References: [1] Khan et al., Text2CAD, NeurIPS 2024, arXiv 2409.17106. [2] Alrashedy et al., Generating CAD Code with Vision-Language Models for 3D Designs, ICLR 2025. [3] Mallis et al., CAD-Assistant, ICCV 2025, arXiv 2412.13810. [4] Kogler, Chen, Falkner, Haselboeck, Wallner, Configuration Copilot: Towards Integrating Large Language Models and Constraints, ConfWS 2024, CEUR-WS Vol-3812. [5] Zhou et al., WebArena, arXiv 2307.13854. [6] Yao et al., τ-bench, arXiv 2406.12045. [7] Advani, From Confident Closing to Silent Failure: Characterizing False Success in LLM Agents, ICML 2026 workshop poster.

C6, paper.md after Method (who decides what):

| Who | Decides or does |
|---|---|
| Muse model | every tool call and its arguments; undo; whether to take an offered alternative; each requirement's status, evidence and outcome |
| Tool layer (built in the event) | resolves sockets and contract values; helpers choose surfaces, plants and fills and re-send the configurator's suggested fix once, unasked; limits of 30 turns, 30 operations a call, 250 a run |
| Configurator (pre-existing) | accepts or refuses each operation with a code, alternatives and a suggested fix; rolls back an atomic batch whole; placement rules and mesh check |
| Code at finish | rules, mesh, print pack, share-link reload, brief checks, out-of-scope keyword scan; sends an all-met finish back once on a rule or mesh error and similar faults |
| The model's word only | that every requirement is met; facing, visibility, what rests on what |

And at paper.md 61: the multimeter standing on end was placed by a helper's automatic re-send of the configurator's suggestion, not chosen by the model.

C7, paper.md 33: "The revised drone and printing briefs fix the layout cell by cell; there the model turns them into accepted operations, recovers from refusals and reports, and does not choose the layout."

C8, paper.md 33, add: "In the printing run the rod requirement is marked met where its stills show stubs with no gap beside them, and the terrace run reports every plant visible though the default view hides the kale (report 3.4)."

C9: paper 8 "the model's own statement of which requirements it met, checked in code only where a brief has a coded check"; paper 22 "with all-met claims checked against the brief's coded checks and the configurator's rules"; paper 18 "to a build valid in the configurator (placement and collision rules)".

## D. Optional experiments (none run; at most three)

1. Audit the first held-out set's 14 passes (no model calls; one reviewer agent reading traces and stills, like D7 and A8). Resolves: whether the headline 14 of 18 overstates success, the one material gap left in the headline. Feasible before the deadline (about an hour). Information value: high, because it bears on the headline directly. Risk: a false pass found changes how the headline must be worded (it stays as scored; the audit is reported beside it); hand-tabulated, one unblinded reviewer, like A8. Current evidence is not sufficient without it; C2 is the fallback.
2. Fixes-off on held-out2, 48 x1 each arm on eval-final, interleaved (no code change, `--features=-ewDrawers,-rollbackRead,-topology,-verify`). Resolves: the ceiling problem of the 13-brief fixes-off pair. About $9 at A7's $0.092 a run; feasible. Information value: medium (it ablates guards, not the tool layer). Risks: decided after results (must be labelled exploratory), A8's false-pass rate blurs it, the page or contract may have moved. Current evidence (C4 wording) is sufficient without it.
3. Minimal-scaffold arm (a new default-off flag: raw apply, get_build and finish only) paired with a default arm on held-out2 48 x1. Resolves priority 3 directly. About $4.4 plus new code on deadline day, pre-registered first. Information value: highest for the architecture question; risk: "fair" is a judgment call and new code under time pressure. C4's disclosure is sufficient without it.

## E. Submission readiness

- Technical defensibility: strong on what was measured. The main gap is presentational, not evidential: paper.md does not state the verification boundary (finding 1) and puts no caveat beside the headline (finding 4). Both close with text (C1, C2) and no new data.
- Evidence integrity: every generated number reproduces from the committed data; hand-tabulated sources are labelled. One integrity issue sits in the video, not the paper: the replay end card marks contradicted claims VERIFIED (finding 2).
- Reproducibility: npm ci and 206 of 206 tests pass in a clean clone; seven of ten generators reproduce byte-identical or with only a timestamp changed. A7 does not rebuild from the public repo (finding 3); A3 and A6 need private inputs, A6 disclosed, A3 not (finding 15).
- Meta AI contribution: well documented (three Muse models, API usage, cost, errors, effort) and not overstated; what the model decides versus the tool layer and configurator should be stated (C6).
- Novelty positioning: no overclaim to retract; a sourced related-work paragraph (C5) would place it against Configuration Copilot and the CAD agents.
- Remaining submission blockers: repo private (flip after the video, decided); placeholders (video link, public URL); the replay end card in the video (finding 2); A7 rebuild (finding 3, before the flip).
