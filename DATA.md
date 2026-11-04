# The run data

Every number in the paper comes from files in this repository, and this page says where they are, what each one is, and how to get them without cloning 262 MB of history.

## Download

| What | Where | Size |
| --- | --- | --- |
| Traces, summaries, rescores, brief sets, the API contract, the paper's data files and the paper itself, as one zip | [hex-agent-data-2026-11-04.zip](https://github.com/Otd-llc/hex-agent/releases/download/data-2026-11-04/hex-agent-data-2026-11-04.zip) (release [`data-2026-11-04`](https://github.com/Otd-llc/hex-agent/releases/tag/data-2026-11-04); its sha256 and the commit it was packed from are in the release notes and in the manifest beside it) | see the release |
| Screenshots of every run in the eight Meta Model API suites of 2026-11-02 (`final.png`, `still-N.png`) | [hex-agent-run-screenshots-2026-11-02.zip](https://github.com/Otd-llc/hex-agent/releases/download/runs-2026-11-02/hex-agent-run-screenshots-2026-11-02.zip) (release [`runs-2026-11-02`](https://github.com/Otd-llc/hex-agent/releases/tag/runs-2026-11-02)) | 167 MB, 863 files, stored uncompressed |
| The same files in git | `git clone --depth 1 https://github.com/Otd-llc/hex-agent.git` | the tracked data is about 20 MB |

Paths inside both zips match the repository, so a trace path quoted in the paper opens in either. The data zip is rebuilt by `node bin/pack-data.mjs --out <dir>` from the tracked files at a clean checkout; the script prints the file count, the zip's sha256 and the commit.

## What is here

| Path | What it is | Written by |
| --- | --- | --- |
| `runs/suite-<timestamp>/` | one folder per suite run: 154 suites, each with `summary.json` (the suite's briefs, repeats and first scoring), one folder per run holding `trace.json`, and `rescore-<grader>.json` files from later graders | `bin/suite.mjs`; rescores by `bin/rescore.mjs --versioned` |
| `runs/suite-*/<timestamp>-<runId>/trace.json` | the complete record of one run: 5,128 traces in all | `bin/run.mjs` through `bin/suite.mjs` |
| `runs/<timestamp>-<runId>/` | three single runs made with `npm start` outside a suite | `bin/run.mjs` |
| `runs/critic-*.json` (9), `runs/meta-review-*.json` (6), `runs/accept-*.json` (3) | vision-critic passes over run stills, the Muse models reviewing the demo runs, and contract acceptance checks | `bin/critic.mjs`, `bin/meta-review.mjs`, the acceptance test |
| `runs/*.log`, `runs/*.done` | console logs of long batches and their completion marks | the batch shells |
| `docs/data/suite-classes.json` | the class of every suite (eval, dev, smoke, dead end, demo, heldout), checked by hand; its `about` field defines each class | by hand |
| `docs/data/suite-index.md`, `suite-index.json` | one row per suite: provider, model, effort, contract hash, agent commit, runs, passed, rescored, overclaims, cost, class | `node bin/index-suites.mjs --write` |
| `docs/data/presentation.json`, `presentation-extra.json` | the paper's tables and intervals, computed from the suites above | `node bin/presentation-data.mjs --write`, `node bin/presentation-extra.mjs --write` |
| `docs/data/do-nothing.json`, `heldout-handle-alt.json` | the do-nothing baseline and a handle variant, no model calls | `node bin/do-nothing.mjs --write`, `node bin/heldout-handle-alt.mjs --write` |
| `docs/data/grader-audit.json`, `demo-review.json` | reviewer verdicts on 40 development runs and on the demo runs, hand-tabulated | by hand, from reviewer agents |
| `docs/data/addendum/*.json` | the nine post-gate files A1 to A9 (second abstention set, Muse Wonder 1.0, the tool-layer fixes, the held-out2 grader audit, the spend split, the prescription scan) | `bin/addendum-*.mjs --write` |
| `evals/briefs*.json` | the brief sets with their coded checks; `evals/starts/` holds the starting builds some briefs begin from | by hand |
| `contract/hex-api-public.json` | the configurator's published API contract, vendored per release and named by hash in every trace | `node bin/sync-contract.mjs` |
| `docs/submission/paper/` | the paper, the technical report, the addendum and the claim ledger (which claim rests on which file) | `bin/paper-render.mjs` renders the PDFs |

Counts are from `git ls-files` on the commit named in the release notes.

## How to read a trace

A trace is one JSON object. Its top-level keys, from the strawberry tower run `9329ae20` (`runs/suite-2026-11-02T18-42-02-972Z/2026-11-02T18-49-19-520Z-9329ae20/trace.json`):

| Key | What it holds |
| --- | --- |
| `runId`, `briefId`, `brief`, `briefSha256` | which run of which brief; the brief text and its hash |
| `purpose` | `dev`, `eval` or `demo`, as typed on the command line |
| `provider`, `model`, `inference`, `effort`, `strategy`, `features` | which model on which host, its reasoning effort, and the feature flags the agent ran with |
| `agent`, `contractHash`, `hexApiVersion`, `pageBuild`, `vizCommit`, `origin` | the agent commit and the configurator release the run drove |
| `events` | every model turn, tool call, configurator outcome (accepted, or refused with its code and alternatives) and verification step, in order |
| `finish` | the model's own statement: each requirement met, partly met or not met |
| `verdict`, `briefChecks` | what the configurator's checks and the brief's coded checks decided, check by check; a check that did not run counts as failed |
| `finalNodes`, `finalStaging` | the build at the end, as the configurator reports it |
| `usage`, `costSource`, `counters`, `opsUsed`, `elapsedMs`, `stop`, `forcedFinish` | tokens and their list-price estimate, operation counts, wall time, and why the run ended |

`bin/replay.mjs <trace.json>` re-applies a trace on the live configurator, labelled REPLAY, and calls no model.

## Which runs are results

Only suites classed `eval`, `heldout` or `demo` in `docs/data/suite-classes.json` appear in the paper, and demo suites are described, not scored as an evaluation. Suites on Claude models are development work and are never reported as a result. Models are reported apart and never pooled. The first scoring of a suite stays in its `summary.json`; the paper uses the rescore files of one grader, named in `docs/data/suite-index.md`.

## Reproduce a number

Each claim in the paper names its data file in [`docs/submission/paper/ledger.md`](docs/submission/paper/ledger.md), which also carries the `number_trace` command that checks every number in the paper against those files. To rebuild the data files from the traces:

```sh
node bin/index-suites.mjs --write          # docs/data/suite-index.{md,json}
node bin/rescore.mjs --versioned           # runs/suite-*/rescore-<grader>.json
node bin/presentation-data.mjs --write     # docs/data/presentation.json
node bin/presentation-extra.mjs --write    # docs/data/presentation-extra.json
```

The held-out brief sets (`evals/briefs-heldout.json`, `evals/briefs-heldout2.json`) are published as they were run; their checks were never edited after the runs.

## License

The data and this repository's code are under the [Apache License 2.0](LICENSE), Copyright 2026 One Thousand Drones LLC (see [NOTICE](NOTICE)). The vendored API contract in `contract/` is not covered by it; its use is governed by the [API terms](https://academy.onethousanddrones.com/hex/api). Hex Cluster, its configurator and the hexAPI belong to One Thousand Drones.
