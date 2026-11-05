# Event rules that shape the submission

From the Participant Guide and the Official Rules (event waiver page), as
supplied by the owner on 2026-11-02. Re-check the live pages before
submitting: https://cerebralvalley.ai/e/meta-ai-developer-hackathon

## Deadline and where

- Submit by Wed 2026-11-04, 9:00 PM ET, at
  https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit
- Tue 2026-11-03 is the last full day for submission questions (Discord
  #questions, #office-hours 10 to 11 AM ET).
- Judging 2026-11-05 to 11-08; top 5 per track announced 2026-11-09.

## Judging

- Stage 1, pass/fail: the project reasonably fits a problem statement and
  reasonably used the Meta Model API and/or Meta open-weight models, built
  during the hackathon.
- Stage 2, each 0 to 10:
  - Impact (30%): real-world potential, who benefits, how much it matters,
    whether it could become something people use, fit to a problem statement.
  - Use of Meta AI Tooling (25%): how creatively Meta's AI was used, beyond a
    basic integration, unexpected capabilities surfaced.
  - Technical Depth & Execution (20%): sound, thoughtfully refined
    engineering; real craft.
  - Demo (25%): a working, impressive demo; the product holds up live; the
    quality of the demo video.
- Stage 3: top 5 per track ranked on the same rubric from the videos.

## Problem statements (pick one on the form)

- Build for Your World: bring Meta's models into your domain; a problem you
  know firsthand.
- Push the Frontier: software, robotics, manufacturing, energy, materials;
  give a machine a new capability; understand and control a physical system.

## Rules

- Repositories must be public.
- The demo must highlight only what was built during the hackathon, and the
  submission must make clear what was built during the event. Failing to
  identify original contributions can mean disqualification.
- Three-minute demo video required; it is a primary judging artifact, with
  the code and the live product.
- Tracks: Indie Developer (individual builders and students, teams up to
  four) and Startup (technical founders building a product; the
  representative must be an active employee). The Official Rules say a
  participant may apply for one track only and a project is entered in one
  track only. The submit form asks which track.

## Bonus prizes that fit this entry

- Best Build on Meta Open Weight Models ($10,000): Muse Glimmer or Muse
  Spark Open served on own hardware or partner inference.
- Best Agentic Use-Case ($5,000).
- Most Viral ($20,000, X post link on the form), Community Vote ($10,000).

## Submit form fields

Team name; team members; track; problem statement; X post link (optional,
Most Viral); Project Description; Public GitHub Repository; 3-Minute Demo
Video; "Describe your use of Meta products to build the submitted project";
"Why are Meta's models important to your solution?"; partner feedback
(Fireworks, Modal, Baseten); survey questions on the Meta Model API and
Muse Code.

## Decisions

- 2026-11-02, owner: **Startup track.** Cerebral Valley in Discord
  (2026-10-26): the track is picked on the submission form and may be
  switched. The entry is One Thousand Drones' existing configurator plus the
  agent built during the event; the new work is marked per HACKATHON_DELTA.md.
- 2026-11-02, owner: **Problem statement: Push the Frontier** (manufacturing; give a
  machine a new capability).
- 2026-11-02, owner: **Keep git history when the repo goes public.** The held-out
  briefs (evals/briefs-heldout.json, in history since 76e977d) become public, and
  so do their runs (see below). Rewriting history would break the agent
  commit recorded in every trace.
- 2026-11-02, owner: **Keep contract/hex-api-public.json** in the public repo: its content is already
  published at https://academy.onethousanddrones.com/hex/api (contract da0834cc); NOTICE keeps it
  under the API terms, outside Apache-2.0.
- 2026-11-02, owner: **Keep the commit author emails** (aol + company) in public history.
- 2026-11-02, owner: **Leave private repo names and C:/zzz paths** in docs as they are.
- 2026-11-02, owner: **.env.example reviewed** (all 6 versions): every key empty, only credit numbers. Clean.
- 2026-11-02, owner: **Flip the repo public once the paper is final.**
- 2026-11-02, owner: **No hosted live agent for judges.** Meta Model API credit ($150) now funds agent development; keep about $50 for the demo recordings (the code's demo reserve). Claude stays development-only, never in the demo or results.
- 2026-11-02, owner: **Run the held-out briefs once**, on the frozen agent (tag eval-final), plus the 36 briefs x5, both on Muse Spark 1.3 via the Meta Model API, purpose eval. Supersedes "never run evals/briefs-heldout.json".
- 2026-11-02, owner: **Run the held-out briefs four more times** (x4, 72 runs, suite
  2026-11-02T15-47-26-043Z), decided AFTER seeing the pre-committed x1 result (14/18, suite
  2026-11-02T14-02-50-056Z). The x1 stays the headline held-out number; the x4 is reported as a
  later extension, pooled only with an interval clustered by brief.
- 2026-11-02, owner: **Run the fixes-off harm test** (fixes 1 to 4 off, 13 briefs x5, suite
  2026-11-02T16-56-59-857Z) **and the abstention A/B** (6 briefs x3 per arm, suites
  2026-11-02T17-16-28-256Z on, 17-22-33-831Z off), both on the frozen agent.
- 2026-11-02: **Muse Wonder 1.0** smoke (17-46-26-922Z) and 36 briefs x1 (17-48-59-000Z) ran on
  the frozen agent, eval purpose. Its own row; never pooled with Muse Spark 1.3.
- 2026-11-02, owner: **Run screenshots:** traces and summaries of new suites are committed; their
  PNGs (final.png, still-N.png) are published as a GitHub Release zip instead of in git.
- 2026-11-05 01:30 UTC (2026-11-04 19:30 CST), owner: **SUBMITTED**, entry 4349 (joshtol), Startups Track, Push the Frontier, repository Otd-llc/hex-agent at main 347157c, demo video https://youtu.be/H9a_9u3i0gI (2:53, unlisted). Partner feedback field (150 chars): Baseten steadiest, Modal fastest but idle GPU billing, Fireworks hung calls behind a green status page.
