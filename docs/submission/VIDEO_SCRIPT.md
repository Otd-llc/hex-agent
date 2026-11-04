# Demo video script, third cut (2026-11-04)

The first cut was rejected by the owner as boring (docs/plans/2026-11-04-video-handoff.md); the
second cut (treatment A, "Typed. Built.", docs/plans/2026-11-04-video-treatments.md) replayed four
demo-set runs. The third cut, the submitted one, is rebuilt on three builds, every one chosen by the
owner from the runs of its brief, none of them an evaluation run: a planter tower from a Muse Wonder
1.0 run, a desk organiser from a Muse Spark 1.3 run, and the printing station from the demo set.
Each build appears as a Blender render of the exact build from its run, labelled as a render; the
tower also appears as a direct replay of its run through the configurator's public API, labelled as
a replay. One segment is live. No number appears on screen; the paper keeps its numbers
(docs/submission/paper/paper.md, Demo and results, and report.md 3.4; data file V1
docs/data/video-demo.json). The owner records the voice; the cut, the furniture and the music are
built by script from files outside the repository (C:/zzz/_video). Under the three-minute limit.

## The three builds

| Build | Run | Model | Suite or run folder | Brief |
|---|---|---|---|---|
| Planter tower with a crescent | 4d10f23e | Muse Wonder 1.0, Meta Model API | runs/suite-2026-11-04T17-07-56-347Z (brief passed 3 of 3; this run's report marks four requirements partial, every coded check passed) | film-tower-crescent, evals/briefs-film.json |
| Desk organiser | 6ad4f332 | Muse Spark 1.3, Meta Model API | runs/suite-2026-11-04T16-22-20-053Z (brief passed 3 of 3; this run strict) | film-desk-organiser, evals/briefs-film.json |
| 3D-printing station | dfdebefd | Muse Spark 1.3, Meta Model API | runs/suite-2026-11-03T03-25-07-282Z (demo set, brief v3 passed 3 of 3 completed) | demo-print-station-v3 |

The film briefs were written by the author on 2026-11-04 for the video, after every result in the
paper, and checked for feasibility with the configurator's tools alone (no model; probe stills in
C:/zzz/_video/work/probe-tower*, probe-h-desk, probe-h-print) before any model ran on them. They
are not an evaluation set. The other two film briefs (herb amphitheatre, 3 of 3; filament wall,
0 of 3) and an open-ended Muse Wonder 1.0 run (e9402f1c, harness error, partial trace) are not in
the video; the paper discloses them.

## The eleven segments

Footage sources are files under C:/zzz/_video (outside the repository) or run folders under runs/.
A "render" is a Blender still or animation made by C:/zzz/_video/work/scene-room.py from the meshes
the configurator drew for that run's build, exported after re-applying the run's accepted operations
(mesh-tower, mesh-desk, mesh-print). A "replay" re-applies only what the configurator accepted in
the recorded run, in order, through `window.hexAPI` (`bin/replay.mjs` is the same mechanism), with
the camera moved by the public `view()` call and no model running; it does not show the model's
messages, tool calls or checks.

| # | Segment | On screen | Footage source | Label on screen | Honesty note |
|---|---|---|---|---|---|
| 1 | Built this week | Card, one line in two halves: the configurator and its crystal pre-existed; the agent, its tools, its checks and its evaluation were built this week | card (overlay, no footage) | OTD · Hex Cluster lockup | The split follows HACKATHON_DELTA.md; the crystal is Otd-llc/emotive-hex-agent (MIT), a dependency, not entered |
| 2 | The brief | The tower brief types itself over the empty bench | direct recording of the configurator (C:/zzz/_video/raw/s-tower.mp4, the opening frames before the first placement) | none | The text typed is the brief from evals/briefs-film.json verbatim, the one the run received |
| 3 | The tower | The finished tower from run 4d10f23e on a patio, materialising, then turning | render from C:/zzz/_video/work/mesh-tower (still: work/room-tower-v3/patio.png) | RENDER OF THE BUILD FROM A MUSE WONDER RUN · NOT A PHOTO | Exact build of run 4d10f23e, nothing added or removed; the scene around it (patio, light) is set dressing; the run's own report calls the crescent partial |
| 4 | The engine room | The tower run replayed at speed in the configurator: parts placed, soil filled, plants set, the NEEDS_TALL_BASE refusal and the rebuild | replay of run 4d10f23e through the public API (C:/zzz/_video/raw/s-tower.mp4, driven by work/s-tower.log from the trace) | REPLAY OF A REAL RUN · MUSE WONDER 1.0 · RUN 4d10f23e · NOT LIVE | Only accepted operations, in order; no model running; tool calls and checks not shown; sped up |
| 5 | The desk | The desk brief typed, then the desk organiser from run 6ad4f332 materialising and turning | brief: direct recording (raw/s-desk.mp4 opening frames); build: render from work/mesh-desk (still: work/room-desk/desk.png) | RENDER OF THE BUILD FROM A MUSE SPARK RUN · NOT A PHOTO | Exact build of run 6ad4f332 (strict pass); the brief shown is the film brief verbatim |
| 6 | The printing station | The printing brief typed, then the printing station from run dfdebefd on a bench, materialising and turning | brief: direct recording (raw/s-print.mp4 opening frames); build: render from work/mesh-print (still: work/room-print/bench.png) | RENDER OF THE BUILD FROM A MUSE SPARK RUN · NOT A PHOTO | Exact build of run dfdebefd, two stray rod stubs included (report 3.4); the brief v3 fixes the layout cell by cell (paper, Demo) |
| 7 | Live | The screen recording of the live run, cropped to the app, the live panel readable, ending on the run's verdict | screen recording 2026-11-04 (C:/zzz/_video/raw/7-live.mp4), run 23ce1844, runs/2026-11-04T11-53-17-254Z-23ce1844 | LIVE · MUSE SPARK 1.3 · META MODEL API · RECORDED 2026-11-04 · SPED UP | The only footage with a model running; a development brief; 13 model calls, $0.0694 at list price; outside every suite; enters no number in the paper; whatever the checks said is what is shown |
| 8 | An honest no | Run aca4ce95's finish, word for word, beside the brief (a step a toddler stands on) | card over the empty bench, text from runs/suite-2026-11-02T17-16-28-256Z (run aca4ce95) | none | A declined brief from the abstention suite; nothing placed; the text is the model's, unedited |
| 9 | Most of the time | Card: on briefs it had never seen it got most of them right; the paper has the exact numbers | card (overlay, no footage) | none | No number on screen by design; the 14 of 18, its interval, the do-nothing floor and the unaudited-passes caveat are in paper.md |
| 10 | Build sheet and assembly | The configurator's build sheet and assembly steps for the agent's build, at speed | configurator recording (C:/zzz/_video/raw/5-assemble.mp4) | HEX CLUSTER PRODUCT · NOT ENTERED FOR JUDGING · PLANNED BY CODE · NO MODEL RUNNING | Product feature, pre-existing; planned by code from the build; nothing has been printed |
| 11 | End card | hex-agent, the repository, the one line again, the logos, and the disclosure: the three builds were chosen by us from their runs; every run is in the repository | card (overlay, no footage) | OTD · Hex Cluster lockup | The owner-pick disclosure is on screen, not only in the paper |

Nothing in the video has been printed. The replays and renders show the configurator's accepted
state only; the paper reports the tool calls, the refusals and the checks.

## The voice (owner, one line at a time)

| Segment | Line |
|---|---|
| 1 built this week | The configurator and its crystal were already ours. The agent that drives it, and its checks, were built this week. |
| 2 brief | You type what you want. |
| 3 tower | Meta's Muse Wonder builds it in our configurator. |
| 4 engine | It reads the build, asks where parts fit, and places them through the public API. The model chooses. The configurator's rules accept or refuse. Here the rules say no: a deep bin needs a taller base. The model reads the refusal and rebuilds the base. |
| 5 desk | A desk organiser, by Muse Spark. |
| 6 print | A printing station. Three builds, picked by us from their runs. |
| 7 live | Those were recordings. This one is live: Muse Spark 1.3 on Meta's Model API, on a brief from our development set. Whatever the checks say at the end is what we show. |
| 8 decline | Asked for a step a toddler stands on, it says no. Nothing placed. |
| 9 most | On briefs it had never seen, it got most of them right. The paper has the exact numbers. |
| 10 parts | From the agent's build, the configurator makes the parts list, the print files and the assembly steps. Nothing has been printed yet. |
| 11 end | hex-agent. Muse Spark and Muse Wonder through the Meta Model API. The paper and every run are in the repository. |

No number is spoken or shown. Every number the video alludes to is in docs/submission/paper/paper.md
as published: 14 of 18 (77.8%, Wilson 54.8 to 91.0%), 4 of 18 do-nothing, the film suites' 6 of 9
and 3 of 3 (V1), the live run's 13 calls and $0.0694. The live run enters no number.

## Music

The owner's Suno track "Half-Time Groove" (C:/zzz/_video/music/ref/half-time-groove.wav; Suno paid
plan, commercial use for songs made and downloaded while subscribed; licence line "Suno, <plan>,
generated 2026-11-04, WAV download"). Fitted to the cut by C:/zzz/_video/music/fit.py: the track's
loudest section is found from its energy curve and slid so that section starts on the live
segment's downbeat of the song's bar grid (C:/zzz/_video/work/grid.json), the track trimmed to
the cut, faded over the end card, mastered to the house bed target (about −15 LUFS) and ducked
under each voice line by the renderer. No library music. (An in-house bed made in REAPER through
the otd-daw-reaper skill was auditioned and rejected; the skill keeps the record.)

## Furniture

The academy cut's kinetic grammar: hero words key-strike in character by character or snap
together from two halves, with the hollow stroke period; quotes in boxed panels with a label
rule and corner ticks; truth chips (RENDER, REPLAY, LIVE) in the same type; the OTD and Hex
Cluster lockup at the open and the end. Fonts: Bebas Neue, Lora, Space Mono (OFL).
