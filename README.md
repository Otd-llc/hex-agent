# hex-agent

A Meta Muse agent that turns a plain-language design brief into a real
[Hex Cluster](https://hex.onethousanddrones.com/) build. It drives the live
configurator through its published browser API, reads each accept or refuse,
revises, and ends with a share link, a parts list and a print-pack link that
the configurator itself produced and checked.

**Status (2026-10-27):** the bridge, tools, guardrails and checks run end to
end against the live configurator with a scripted stand-in model. The live
Meta model run is waiting on an API key. See [EVALUATION.md](EVALUATION.md).

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
`--max-turns=30`, `--max-usd=2`, `--headless`.

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
