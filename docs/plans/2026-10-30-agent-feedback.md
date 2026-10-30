# Agent feedback: improve the agent's use of the system, fast

Date: 2026-10-30 (owner asked). Pick up after the owner's premades review
(bioscale-viz branch `feat/catalog-premades`, worktree `C:/zzz/bs-premades`).

## Goal

Every change to the agent (hints, tools, checks, model, effort) answered in
minutes with what it fixed and what it broke, and every owner judgment reused
on every later run, not spent on one.

## The four loops, fastest first

1. **Automatic (minutes, no human): a failure breakdown per change.** After a
   suite run, classify every trace, not only pass/fail: refusals by code, the
   same refusal repeated (a loop), wasted ops, overclaims, out-of-scope claims
   (`claimsInScope`), calls, time, cost. Each top cause maps to exactly one fix:
   an API item (bioscale-viz backlog A11-A25), an agent hint, or a check. Screen
   on a cheap model across many briefs, confirm on a strong one. Run against the
   local configurator with branch features too, to measure API items before
   they ship.
2. **Owner verdicts, reusable (the scarce signal).** A review page for agent
   output, built from the premades review page (`tools/catalog/review.html` in
   bioscale-viz: Keep / Fix / Drop, a note per build, a copy-feedback box): per
   brief, the agent's build as a still beside its claims. A Keep becomes a golden
   build (a regression check on that brief); a Fix note becomes a rule (a rubric
   line, a code check, or an API default, as "always staggered caps" became
   caps.mjs); a Drop becomes a negative example.
3. **Design critique, calibrated against the owner.** A vision pass scores agent
   builds against `DESIGN_RUBRIC.md` (bioscale-viz backlog A18 + A24), trusted
   only once it agrees with the owner's verdicts: measure agreement on builds the
   owner already judged (the 370 drafts, the 204 premades). Below a threshold it
   screens, it does not decide.
4. **Product loop.** A configurator gap a run hits (as F1-F8 were) becomes a
   backlog row with the run that found it, automatically.

## The scoreboard

One row per agent version: structural pass rate, design score (once 3 is
calibrated), honesty (overclaims, out-of-scope), calls, latency, cost, and the
site / contract version it ran on. Whether a change helped, at a glance; and the
evidence for the write-up. A page that reads the suite results, not a hand table.

## Order

1. Failure breakdown (loop 1): a few hours, here.
2. Agent review page (loop 2): carries over from the premades page.
3. Scoreboard over 1 and 2.
4. Calibrated critique (loop 3), then the product loop (4).

## Constraints

- Credits (owner 2026-10-30): all Claude and Baseten first; Meta ($150) LAST, once
  the agent's use of the system is done improving; Modal and Fireworks may go to
  other things. No GPU deployment (Baseten dedicated, Modal) without owner OK.
- Viz deploys mid-hackathon are fine: pause live A/B runs before one, re-run
  acceptance after, re-baseline on the new version.
- Agent-ability API items to land before the Meta runs where possible:
  bioscale-viz `docs/plans/2026-10-27-catalog-premades.md`, backlog A11-A25
  (ranked there: A19 house rules as ops and A20 premades as starting points first).
