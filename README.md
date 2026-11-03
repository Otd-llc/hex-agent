# hex-agent

A Meta Muse agent that turns a plain-language design brief into a real
[Hex Cluster](https://hex.onethousanddrones.com/) build. It drives the live
configurator through its published browser API, reads each accept or refuse,
revises, and ends with a share link, a parts list and a print-pack link that
the configurator itself produced and checked.

**Status (2026-11-02):** on the frozen agent (git tag `eval-final`), Muse
Spark 1.3 through the Meta Model API passed 14 of 18 held-out briefs (77.8%)
on their one pre-committed run (Wilson 95% interval 54.8 to 91.0%): 11
builds, and 3 declines of briefs written to be refused. An agent that leaves
the build as it finds it passes 4 of those 18. Four more held-out repeats,
decided after that result, brought it to 69 of 90. On the 36 development
briefs, run five times each, it passed 173 of 180 runs; that figure is
optimistic, because we fixed failures on those briefs. Muse Wonder 1.0
passed 36 of 36 development briefs, one run each. Earlier, Meta's
open-weights Muse Spark Open, served by Baseten, a Modal Dedicated endpoint
and Fireworks, passed 89.4 to 93.9% of development runs per batch in seven
effort-low batches; the models are reported apart and never pooled. Latest
configurator release synced: contract `da0834cc`, deploy 15b, viz
`d726540`. Every agent result here is a Meta model; Claude was used for
development only (below). Results, intervals and limits:
[docs/submission/paper/paper.md](docs/submission/paper/paper.md); run log:
[EVALUATION.md](EVALUATION.md).

## What is new here and what is not

Hex Cluster, its configurator, its rules, its collision gate and its print
packs existed before this event and belong to One Thousand Drones. This repo
is the new part: the agent, the browser bridge, the tools, the checks and the
evaluation. It talks to Hex Cluster only through the documented
[`window.hexAPI`](https://academy.onethousanddrones.com/hex/api).
See [HACKATHON_DELTA.md](HACKATHON_DELTA.md).

## Run it

Needs Node 20+, Google Chrome, and a Meta Model API key.

```sh
npm install
cp .env.example .env          # put MODEL_API_KEY in it
npm test                      # unit tests, no network
npm run mock-e2e              # whole pipeline on the live configurator, scripted model, no key
META_API_ALLOWED=1 npm start -- --model=muse-spark-1.3 --effort=low "a portable electronics organizer with removable bins and a carry handle"
```

`npm start` opens a visible Chrome window on the configurator, so you can
watch the build change. It prints each model turn and each configurator
outcome, then a verdict, the share link, the print-pack link and the trace
path (`runs/<run-id>/trace.json`, plus `final.png`).

Flags: `--model=<id>` (required, there is no default model:
`muse-spark-1.3` or `muse-wonder-1.0` on the Meta Model API, or a Muse Spark
Open host below), `--effort=low` (the Meta default is medium; every reported
run passed low), `--max-turns=30`, `--max-usd=2`, `--headless`,
`--features=...` (below). The Meta Model API is off unless
`META_API_ALLOWED=1` is set on the command line; the code refuses it in
`.env`.

## Features (switched per run, for A/B on the same code)

| `--features` | Default | What it does | Evidence |
|---|---|---|---|
| `abstain` | on | declines a brief that should not be built as asked (carrying a person, fuel or heat, restraint, a weapon), or builds only the safe part and reports the rest unmet | Muse Spark 1.3 (frozen agent), six safety briefs ×3: on 18/18, off 10/18, per brief only; Muse Spark Open: on 17/18, off 7/18, side by side and unpaired (see the paper) |
| `acceptance` | off | writes 3-6 checkable requirements before the first change, tags every object with the requirement it serves, and code sends back a "met" whose own test fails | Claude development runs only; not measured on Muse |
| `rolegraph` | off | `plan_build`: the build as a role graph (site, zones, roles and relations), bound to configurator offers in code; a refusal rebinds one role | not measured yet |

`--features=none` turns all off; `--features=abstain,acceptance` names
exactly those on.

## How it decides

```
brief -> Muse model --tool calls--> tools.mjs (checked in code) --page.evaluate--> window.hexAPI (live configurator)
                 <--outcomes, refusals, alternatives--------------------------------
finish -> verify(): validate, mesh gate, BOM, print pack, share link reloaded in a fresh tab
```

The model plans and chooses. The configurator's rules and collision gate
accept or refuse. The configurator's checks and our code decide the run: it
**passes** only when every check passes, including the brief's coded checks;
a check that did not run counts as failed. A requirement with no coded check
rests on the model's own statement. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Limits

Fit only, not strength. No new CAD: print packs are the existing published
parts. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## License

The code in this repository is licensed under the [Apache License 2.0](LICENSE)
(see [NOTICE](NOTICE)). Hex Cluster, its configurator, the API and the vendored
API description in `contract/` are not covered by it; their use is governed by
the [API terms](https://academy.onethousanddrones.com/hex/api).

## Credit guard

Each model call is priced from Meta's published Standard-mode rates and
appended to `.spend/meta.jsonl` (Claude and Baseten each have their own
file beside it). Ledger paths resolve from the repo, not the working
directory, so a run started anywhere reads the same balance. Runs take `--purpose=dev|eval|demo`. On the
Meta Model API ledger (`src/ledger.mjs`), dev (cap $45 by default) and eval
(cap $40) stop before they would touch the reserve ($50 of a $150 credit
by default), which only `demo` may spend; `SPEND_CREDIT_USD`,
`SPEND_RESERVE_USD`, `SPEND_CAP_DEV_USD` and `SPEND_CAP_EVAL_USD` override
them. No purpose picks a model: `bin/run.mjs` and `bin/suite.mjs` refuse to
start without `--model`.
The estimate is not the bill: reconcile against the Meta console.

## Muse Spark Open hosts

Meta's open-weights Muse Spark Open runs through three hosts, each
with its own key, credit and ledger in `.spend/`: Baseten
(`--model=meta-models/muse-spark-open-1026`), Fireworks
(`--model=accounts/fireworks/models/muse-spark-open`) and a Modal Shared
Endpoint (`--model=modal:<endpoint host>`, with a workspace proxy token). A
Fireworks or Modal run does not start until its `*_CREDIT_USD` is set. A
Modal Dedicated Endpoint bills GPU time, so none is made without the owner's
OK; the Modal results ran on one such endpoint (4 B300 GPUs, at most 1
replica), with its up time ledgered by `src/uptime.mjs` and
`bin/modal-session.mjs`. The headline model, Muse Spark 1.3, runs on the
Meta Model API, unlocked per command with `META_API_ALLOWED=1`.

## Checking after a deploy

`node bin/smoke-tools.mjs` drives every tool on the page with no model. It
fails first if the vendored contract (`contract/hex-api-public.json`) is not
the one the page serves: on the live site that is the stamp on the
published docs; for a pinned local build, name its file with
`HEX_CONTRACT=<path>/hex-api-public.json`. `node bin/sync-contract.mjs <path>`
updates the vendored copy.

## Offline critic (A56)

`node bin/critic.mjs --dir=<stills>` lists which builds have a full still
sheet (`<name>.png`, `<name>-back.png`, `<name>-top.png`) and which the owner
judged in the premades review rounds. Its judging mode is development-only
(below).

## Replaying a recorded run

`node bin/replay.mjs runs/<run-id>/trace.json` re-applies, in a visible
browser, only what the configurator accepted in that run (and its undos),
with a label on screen naming the run, provider and model and saying no model
is running. It ends by checking the parts list and families match the
original. For filming retakes of a real run at no model cost; it is never
presented as a live run.

## Development-only tools

These use Claude (Anthropic) and never produce a reported result.

### Developing on Claude

`--model=claude-opus-5-5` (or `claude-sonnet-5-5`, `claude-haiku-5-5`) runs
the same loop, tools and checks on the Claude API through the official SDK.
It exists to harden the model-agnostic parts on credit that would otherwise
expire. Its spend goes to `.spend/anthropic.jsonl`, its traces say
`provider: "anthropic"`, it refuses `--purpose=demo`, and no Claude run is
reported as a Muse result. Prompts are tuned again on Muse before eval.

### Offline critic judging

With `--judge=claude-haiku-5-5`, `node bin/critic.mjs` asks four yes/no
questions of each still sheet: can you tell its purpose in two seconds; does
everything rest on something; is everything at a believable scale and the
right way up; is the work zone clear. It then calibrates the answers against
the owner's verdicts. It never outvotes a numeric check. A "no" is overruled
only when every check that measures the same thing ran and passed (the
floating-prop and overlap checks, for "rests"). Any other "no" asks a person
to look rather than failing the build.
