# What existed before, what is new

## Pre-existing (not entered as event work)

| Asset | Owner | At the event start (2026-10-27) | Live 2026-10-31 | Final deploy |
|---|---|---|---|---|
| Hex Cluster configurator (hex.onethousanddrones.com) | One Thousand Drones, proprietary | `Otd-llc/aplomado-viz` main `c65d2066` | `bbebadfa` | `________` |
| `window.hexAPI` browser API, rules, collision gate, print packs | One Thousand Drones, proprietary | contract `9bb662c8dab613bd4eae8a8677e5ddefa727d8ac8bad408614134efb1d0f0e4f` (Academy PR #578) | contract `69c3c65be827e3a251d5a5f0b3f1f6a58670c3f53f7dabfaf779bee7965e938e` | `________` |
| Hex Cluster printable parts | One Thousand Drones; some under CC BY 4.0 | release 2026-10-14 (the pack link the API returns) | same | `________` |
| Emotive Engine | Joshua Tollette, MIT | npm 3.5.0 (not used) | not used | not used |

None of that source is in this repository. This repo calls the configurator
only through the public, documented browser API, as its terms allow
("your own scripts and automated browsers").

The configurator changed during the event, in its own repository and
deploys, not here. Some of those changes answered gaps the agent's runs
found (the F-numbered findings in [EVALUATION.md](EVALUATION.md), such as
F6, bins colliding with a pipe coupling, which now gets a named refusal
instead of a collision). The agent reported
them; the fixes are One Thousand Drones work on the configurator and are not
entered as event work. The vendored contract here
(`contract/hex-api-public.json`) is a copy of the public contract, synced with
`bin/sync-contract.mjs`.

## New in this repository (created from 2026-10-27)

Everything in this repo: the browser bridge, the tool layer and its
guardrails, the Meta model adapters (Model API and Baseten), the agent loop,
abstention, acceptance tests and roles, the role-graph planner, the offline
critic, the verification, the spend ledgers, the probe, acceptance, smoke,
suite and replay scripts, the tests and these documents. Git history is the
record; first commit 2026-10-27 (`fb78560`).

Development also ran on Claude (Anthropic API) to harden the model-agnostic
parts. Those runs are labeled `anthropic` in their traces, and none is
presented as a Muse result.
