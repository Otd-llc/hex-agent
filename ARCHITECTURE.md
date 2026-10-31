# Architecture

## Data flow

1. `bin/run.mjs` takes a brief, starts Chrome through Playwright on
   `https://hex.onethousanddrones.com/` (a fresh browser context, so the build
   is this session's alone), calls `window.__loadHexAPI()` and waits for
   `settle()`.
2. `src/agent.mjs` runs the loop. Each turn sends the instructions, the
   running item list and the tool specs (16 by default) to the model (`src/model.mjs`, Meta
   Responses API, `POST https://api.meta.ai/v1/responses`).
3. Each tool call goes through `src/tools.mjs`, which checks it in code and
   calls `src/bridge.mjs`, which calls one documented `hexAPI` method in the
   page with `page.evaluate`.
4. Outcomes go back to the model as `function_call_output` items. Refusals
   carry the configurator's code, message and up to 12 alternatives, each
   given a socket id the model can apply directly.
5. On `finish` (or a budget stop), `verify()` reads the configurator's own
   verdicts and reloads the share link in a second fresh tab to prove it
   round-trips.

## Trust boundaries

| Boundary | Enforced by |
|---|---|
| Model -> tools | `tools.mjs`: op allowlist (no `load`, no prop or soil ops), per-call and total op caps, every `ref`/`part` must exist in the live build, socket ids must have been issued this session, JSON parse errors returned, never thrown |
| Tools -> page | `bridge.mjs`: only the documented `hexAPI` methods; no private stores or scene hooks |
| Page -> verdict | `agent.mjs verify()`: rules, mesh, pack, round trip each `pass` / `fail` / `unverified`; success needs all `pass` |
| Secrets | API key read from `.env` or the environment by the Node process only; never sent to the page, never logged, `.env` is git-ignored |
| Spend | turn cap (30), wall-clock cap (10 min), cost cap ($2 by default, priced from the published Standard-mode rates) |
| Privacy | Standard-mode model ids only; `-contributor` ids are refused in code. Prompts carry the brief and public catalog and build data only |

## Why a browser driver

`hexAPI` is browser-local. It is not an HTTP API, does not run in a frame and
cannot be called cross-origin. Playwright with `page.evaluate` is the smallest
honest bridge: it runs the documented API in the top-level configurator tab,
the scene changes on screen, and nothing private is touched.

Alternative considered: a user-installed browser extension or bookmarklet
that relays calls from the user's own tab to a local agent over a WebSocket.
It would let the agent work in the tab the user already has open, but it
needs an origin-checked relay and a pairing step, and it is more to secure.
Deferred until the core works.

## Model roles

One model drives the loop: `muse-wonder-1.0` by default, `muse-spark-1.3` as
the cheaper option, both Standard mode. No specialist model yet: a second
model earns its place only if the evaluation shows a task it does better or
cheaper. The adapter is one function (`next`) so a mock or another provider
can stand in.

The Responses API was chosen over Chat Completions because Meta's docs say
Chat Completions does not carry reasoning across turns and recommend
Responses for agent loops. The loop replays the full output item list each
turn (stateless), so no conversation is stored server-side by our choice.

## API facts relied on (checked on the live page, 2026-10-27)

- 14 members, `version` 1; contract hash `9bb662c8…0e4f`.
- `applyAll` is atomic by default: a refused op rolls the batch back
  (`rolledBack: true`, node count unchanged). `stopOnRefusal: false` is not a
  dry run.
- `openSockets({family:'drawer', key})` narrows by key; drawers are offered
  only on a half base's cut face.
- `openSockets({family:'spike', type, facing})` carries `variant` and
  `facing` into the offered op.
- Once a drawer is placed, spike offers at its corners disappear, and
  applying them is refused with `SPIKE_CLASH`.
- `toUrl()` returns a `v2s=` fragment; `load(fragment)` in a fresh tab
  restores the same node count and an identical BOM.

Evidence: `runs/probe-*.json`, `runs/accept-*.json`, `runs/mock-e2e-*.json`.
