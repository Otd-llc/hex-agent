# What existed before, what is new

The event started on 2026-10-27. This repository's first commit is
`fb78560` (2026-10-27 09:26 -0500), and everything written in it is event
work, with two exceptions copied in from the product: the vendored API
contract (`contract/hex-api-public.json`) and the configurator test fixture
(`test/fixtures/parts-deploy13.json`). `git log` is the record; each line
below names a commit or a file a judge can open.

## Pre-existing, One Thousand Drones' product (not claimed)

| Asset | Owner | At the event start (2026-10-27) | Where to check |
|---|---|---|---|
| Hex Cluster configurator (hex.onethousanddrones.com) | One Thousand Drones, proprietary | `Otd-llc/aplomado-viz` main `c65d2066` | `git show fb78560:HACKATHON_DELTA.md` |
| `window.hexAPI` browser API, placement rules, collision gate, part catalog, print packs | One Thousand Drones, proprietary | contract `9bb662c8dab613bd4eae8a8677e5ddefa727d8ac8bad408614134efb1d0f0e4f` (Academy PR #578) | `git show fb78560:ARCHITECTURE.md`; suite index rows marked `~9bb662c8` |
| Published API contract and its docs page | One Thousand Drones, under the API terms (see NOTICE) | as above; vendored here from `9c6a079`, synced by `bin/sync-contract.mjs` | `contract/hex-api-public.json`, [academy /hex/api](https://academy.onethousanddrones.com/hex/api) |
| Hex Cluster printable parts | One Thousand Drones; some under CC BY 4.0 | parts release 2026-10-14 (the `printable-pack?release=` link the API returns in the 10-27 traces) | e.g. `runs/suite-2026-10-27T21-16-46-607Z/*/trace.json` |
| Emotive Engine | Joshua Tollette, MIT | npm 3.5.0 | not used by this repository |

None of that source is in this repository. hex-agent calls the configurator
only through the public, documented browser API, as its terms allow ("your
own scripts and automated browsers").

## Configurator releases shipped during the event (One Thousand Drones, not claimed)

One Thousand Drones' configurator team (lane 1) kept shipping the
configurator during the event, in its own repository and deploys. Some
releases answered gaps the agent's runs found (the F- and L-numbered
findings in [EVALUATION.md](EVALUATION.md), such as F6: bins colliding with a
pipe coupling now get a named refusal). The agent's runs reported them; the
fixes are configurator work, credited to the configurator and not entered
for judging. Every result in the paper ran on one of these releases.

Each row is the commit in this repository that synced the agent to the
release, and the section of EVALUATION.md that names it.

| Contract | Configurator build | Synced here | Source |
|---|---|---|---|
| `202cf501` (F1+F2) | viz `bc6ec79a` | `5ec440a` (2026-10-27) | EVALUATION.md "After the F1+F2 deploy" |
| `2b45909b` (F7+F6) | viz `c221bd5b` | `f71c303` (2026-10-27) | EVALUATION.md "After the F7+F6 deploy" |
| `9c3a1086` | | `d858a9c` (2026-10-30) | commit message |
| `44b1c5f6` (axles, decks, prop warnings) | | `86496be` (2026-10-31) | commit message |
| `2016df39` | | `a6a7d1b` (2026-10-31) | commit message |
| `69c3c65b` | viz `bbebadfa` | `4ce6041` (2026-10-31) | EVALUATION.md (live-site A/B) |
| `d2fd3dad` (batched release) | viz `3883270` (PR #144), docs academy `ad91e38c` (PR #585) | `9ec3a91`, `2a07bd3` (2026-10-31) | EVALUATION.md "Release contract d2fd3dad" |
| `238e6282` | viz `d95cb0e` | `dc65686` (2026-10-31) | EVALUATION.md "Contract 238e6282" |
| `6d9d39d2` | viz `ff59714` | `6c7a20e` (2026-10-31) | EVALUATION.md "Contract 6d9d39d2" |
| `76ea6455` (deploy 4) | viz `812ce0d` | `43a2b59` (2026-11-01) | EVALUATION.md "Contract 76ea6455" |
| `fcf4301c` (deploys 5 to 7) | viz `1470033`, `043622b`, `0a37708` | `1be1b3d` (2026-11-01) | EVALUATION.md "Contract fcf4301c", "Deploy 6", "Deploy 7" |
| `3ddd2666` (deploy 13) | | `89f93ab` (2026-11-01) | commit message |
| `08e63fab` (deploy 14) | viz `23dc4f8` | `83f3748` (2026-11-01) | EVALUATION.md "Baseten control on deploy 14" |
| `87827f4d` (deploy 15) | viz `32e5bdd` | `2cf01c4` (2026-11-01) | EVALUATION.md "Fireworks F0 and F1" |
| `da0834cc` (deploy 15b) | viz `d726540` | `b32f2ca` (2026-11-02) | commit message |

The printable parts moved to the 2026-10-31 parts release with the batched
release: the API returns `printable-pack?release=2026-10-31` in the traces
from the 10-31 batch on (e.g. `runs/suite-2026-10-31T23-34-54-038Z`).
That release is One Thousand Drones' work too.

## Built during the event, in this repository (claimed)

Each item names the file and the commit that added it; later commits refine
most of them.

Agent and tool layer
- Agent loop with a 30-turn budget, wrap-up note and forced finish: `src/agent.mjs` (`fb78560`, `d3e8539`).
- Browser bridge to `window.hexAPI` in a real Chrome tab: `src/bridge.mjs` (`fb78560`).
- Checked tool layer: arguments checked in code, ops allowlisted, refs and socket ids mapped to what the configurator offered: `src/tools.mjs` (`fb78560`); op table and value lists read from the contract: `src/contract.mjs` (`9c6a079`, `5c0ca5c`).
- Compound dressing helpers (A85): in `src/tools.mjs` (`4d84754`), driven with no model by `bin/smoke-helpers.mjs`.
- Abstention (decline or compromise on unsafe briefs), on by default: `e653dac`, `176c5a9`.
- Acceptance tests and roles (`--features=acceptance`, off): `e653dac`, `13596c5`.
- Role-graph planner (`--features=rolegraph`, off, not measured): `src/plan.mjs` (`b3c3ccc`).
- Modal review fixes 1 to 4 behind default-on flags: `64e621b`, `b79911b`, `c0fbd29`, `cb4237d`, `8730865`.
- Live panel in the configurator tab: `src/overlay.mjs` (`b7ba18e`).

Model adapters
- Meta Model API (`muse-spark-1.3`, `muse-wonder-1.0`), off unless `META_API_ALLOWED=1`; not called yet: `src/model.mjs` (`fb78560`, gate in `a005b34`).
- Baseten, Muse Spark Open: `src/baseten.mjs` (`54db8c7`).
- Fireworks and a Modal Shared Endpoint, Muse Spark Open: `src/hosted.mjs` (`a005b34`); Fireworks streaming with a stall abort: `98f5810`.
- Modal Dedicated Endpoint: adapter, uptime ledger, session and window scripts: `src/uptime.mjs`, `bin/modal-session.mjs`, `bin/modal-window.mjs` (`b7b7150`); host handling `c092048`; window safety `c30a58e`, `070ccb1`, `ba70973`.
- Claude adapter, development only, labelled `anthropic` in every trace: `src/claude.mjs` (`f307abd`).

Spend ledgers and credit guards
- Per-provider spend ledger with a judging reserve: `src/ledger.mjs` (`230bc52`); ledgers resolve from the repo root: `d2b2b1e`.
- Modal off unless allowed: `0ea0176`; Fireworks credit ceiling and floor fixed in code: `9f4638a`.

Checks, grader and evaluation tooling
- Code-side brief checks, `claimsInScope`, overclaim and strict pass: `src/checks.mjs` (`5d2ff6a`, `457c99b`); G0 grader batch: `3abc0c6`.
- Rescoring from traces, one file per grader commit: `bin/rescore.mjs` (`dfac528`, `a914d49`, `c7533b7`).
- Suite runner and comparison: `bin/suite.mjs` (`5d2ff6a`), `bin/compare.mjs` (`dba40af`), `bin/tally.mjs` (`f97f39e`), `bin/call-report.mjs` and `src/callstats.mjs` (`8c0ee9b`), run key `src/runkey.mjs` (`070ccb1`), provenance and timed requests `src/provenance.mjs`, `src/http.mjs` (`c30a58e`).
- Tripwires that stop a batch when it breaks or the host fails: `src/tripwires.mjs` (`23eddfd`, `ccbafec`).
- Suite index and the results data: `bin/index-suites.mjs` (`90e71d2`), `bin/presentation-data.mjs` (`52d9f43`), `bin/presentation-extra.mjs` (`8c9420e`), output in `docs/data/`.
- Offline vision critic and still sheets (A56): `src/critic.mjs`, `bin/critic.mjs` (`f052c86`), `bin/sheets.mjs` (`13276aa`).
- Smoke checks after a deploy: `bin/smoke-tools.mjs`, `bin/sync-contract.mjs` (`9c6a079`).
- Labelled replay of recorded runs, for filming: `bin/replay.mjs` (`b576d86`).
- Briefs written for the event: `evals/*.json`; the held-out set was added at `76e977d` and has not been run.
- Unit tests: `test/*.test.mjs` (from `fb78560`); reference builds and the design rubric: `sandbox/`, `DESIGN_RUBRIC.md` (from `f1361b0`); probes and acceptance scripts: `scripts/` (from `fb78560`).
- These documents, the paper and its data (`docs/submission/`, `docs/data/`).

Nothing was trained. Every change during the event is to the agent's tools,
prompt and guards in this repository, or to the configurator in One
Thousand Drones' own repository.

## Development tools, kept out of the results

Claude models (Anthropic API) ran development and baseline runs to harden
the model-agnostic parts, and Claude agents ran the Modal failure review.
Those runs are labelled `anthropic` in their traces, and none is presented
as a Muse result. The paper and these documents were drafted with Claude.
