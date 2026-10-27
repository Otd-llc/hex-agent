# What existed before, what is new

## Pre-existing (not entered as event work)

| Asset | Owner | Baseline |
|---|---|---|
| Hex Cluster configurator (hex.onethousanddrones.com) | One Thousand Drones, proprietary | `Otd-llc/aplomado-viz` main `c65d2066` (deployed) |
| `window.hexAPI` browser API, rules, collision gate, print packs | One Thousand Drones, proprietary | contract hash `9bb662c8dab613bd4eae8a8677e5ddefa727d8ac8bad408614134efb1d0f0e4f` (Academy PR #578) |
| Hex Cluster printable parts | One Thousand Drones; some under CC BY 4.0 | release 2026-10-14 (the pack link the API returns) |
| Emotive Engine | Joshua Tollette, MIT | npm 3.5.0 (not used yet) |

None of that source is in this repository. This repo calls the configurator
only through the public, documented browser API, as its terms allow
("your own scripts and automated browsers").

## New in this repository (created from 2026-10-27)

Everything in this repo: the browser bridge, the tool layer and its
guardrails, the Meta model adapter, the agent loop, the verification, the
probe, acceptance and evaluation scripts, the tests and these documents.
Git history is the record; first commit 2026-10-27.
