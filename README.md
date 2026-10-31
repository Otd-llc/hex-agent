# hex-agent

A Meta Muse agent that turns a plain-language design brief into a real
[Hex Cluster](https://hex.onethousanddrones.com/) build. It drives the live
configurator through its published browser API, reads each accept or refuse,
revises, and ends with a share link, a parts list and a print-pack link that
the configurator itself produced and checked.

**Status (2026-10-31):** the agent runs end to end on the live configurator
(viz `bbebadfa`, contract `69c3c65b`; after the final deploy: viz `________`,
contract `________`). Meta's open-weights Muse Spark Open (served by Baseten)
passes 172 of 180 runs on 36 briefs and 35 of 35 honesty and injection
briefs. With abstention on, the Claude baselines decline unsafe briefs (a
toddler step, a petrol caddy) or build only the safe part; Muse has not
been measured on those yet. The Meta Model API (`muse-spark-1.3`,
`muse-wonder-1.0`) has not been called yet: a cents-sized smoke comes first,
then the demo runs. Claude runs here are development baselines, labeled as
such. See [EVALUATION.md](EVALUATION.md).

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
npm start -- "a portable electronics organizer with removable bins and a carry handle"
```

`npm start` opens a visible Chrome window on the configurator, so you can
watch the build change. It prints each model turn and each configurator
outcome, then a verdict, the share link, the print-pack link and the trace
path (`runs/<run-id>/trace.json`, plus `final.png`).

Flags: `--model=muse-wonder-1.0` (or `muse-spark-1.3`), `--effort=medium`,
`--max-turns=30`, `--max-usd=2`, `--headless`, `--features=...` (below).

## Features (switched per run, for A/B on the same code)

| `--features` | Default | What it does | Evidence |
|---|---|---|---|
| `abstain` | on | declines a brief that should not be built as asked (carrying a person, fuel or heat, restraint, a weapon), or builds only the safe part and reports the rest unmet | Haiku 6/12 -> 12/12, Opus 3/6 -> 6/6 |
| `acceptance` | off | writes 3-6 checkable requirements before the first change, tags every object with the requirement it serves, and code sends back a "met" whose own test fails | ties on Claude at 12-31% more calls; a Muse check decides |
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
accept or refuse. Code, not the model, gives the verdict: a run is a
**success** only when every check passes; a mesh check that did not run is
**unverified**, never a pass. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Limits

Fit only, not strength. No new CAD: print packs are the existing published
parts. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## License

The code in this repository: to be decided by the owner before publication.
Hex Cluster, its configurator and the API are not covered by it; their use is
governed by the [API terms](https://academy.onethousanddrones.com/hex/api).

## Credit guard

Each model call is priced from Meta's published Standard-mode rates and
appended to `.spend/meta.jsonl` (Claude and Baseten each have their own
file beside it). Ledger paths resolve from the repo, not the working
directory, so a run started anywhere reads the same balance. Runs take `--purpose=dev|eval|demo`:
dev ($45 cap, `muse-spark-1.3` by default) and eval ($40 cap,
`muse-wonder-1.0`) stop before they would touch the $50 judging reserve;
only `demo` may spend it. Limits live in `.env` (see `.env.example`).
The estimate is not the bill: reconcile against the Meta console.

## Muse Spark Open hosts

Meta's open-weights Muse Spark Open runs through three per-token hosts, each
with its own key, credit and ledger in `.spend/`: Baseten
(`--model=meta-models/muse-spark-open-1026`), Fireworks
(`--model=accounts/fireworks/models/muse-spark-open`) and a Modal Shared
Endpoint (`--model=modal:<endpoint host>`, with a workspace proxy token). A
Fireworks or Modal run does not start until its `*_CREDIT_USD` is set. A
Modal Dedicated Endpoint bills GPU time, so none is made without the owner's
OK. The Meta Model API stays off (`META_API_ALLOWED=1` unlocks it); its
credit is kept for the demo and judging.

## Developing on Claude

`--model=claude-opus-5-5` (or `claude-sonnet-5-5`, `claude-haiku-5-5`) runs
the same loop, tools and checks on the Claude API through the official SDK.
It exists to harden the model-agnostic parts on credit that would otherwise
expire. Its spend goes to `.spend/anthropic.jsonl`, its traces say
`provider: "anthropic"`, it refuses `--purpose=demo`, and no Claude run is
reported as a Muse result. Prompts are tuned again on Muse before eval.

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
judged in the premades review rounds. With `--judge=claude-haiku-5-5` it asks
four yes/no questions of each sheet: can you tell its purpose in two
seconds; does everything rest on something; is everything at a believable
scale and the right way up; is the work zone clear. It then calibrates the
answers against the owner's verdicts. It never outvotes a numeric check. A
"no" is overruled only when every check that measures the same thing ran
and passed (the floating-prop and overlap checks, for "rests"). Any other
"no" asks a person to look rather than failing the build.

## Replaying a recorded run

`node bin/replay.mjs runs/<run-id>/trace.json` re-applies, in a visible
browser, only what the configurator accepted in that run (and its undos),
with a label on screen naming the run, provider and model and saying no model
is running. It ends by checking the parts list and families match the
original. For filming retakes of a real run at no model cost; it is never
presented as a live run.
