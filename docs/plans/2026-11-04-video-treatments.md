# Demo video, second cut: research and three treatments (2026-11-04)

The first cut (178.8 s, docs/plans/2026-11-04-video-handoff.md) was rejected as boring. This note records what the research says a compelling three-minute demo does, then three story concepts built from the footage on disk, with a recommendation. The owner picks one; the rebuild follows the pick. Every hard constraint in the handoff plan stands.

## What the research says (and what it does not)

Sources are blogs, agency write-ups and one organiser (Devpost); none is a judging rubric, so the timings are conventions. The points that recur:

- Say what the thing does in the first few seconds, as a concrete outcome, not a category (Devpost; Product Marketing Alliance, "180-second demo"). Judges watch many entries back to back and form a view early.
- Show the real product working early and for most of the run time. Slides, architecture and team bios are the first things to cut. Figma's and Vimeo's launch films open on the product with no preamble.
- One message. "Adding too much creates confusion." Technical detail only where it changes what the viewer sees.
- Show, don't tell: real inputs, real outputs. For an agent, judges value seeing it handle a failure (the refusal, the decline), which reads as maturity.
- Audio leads, picture follows: write or record the voice first, cut to it; sync each narration beat to its screen; pause after a key moment.
- Calm, genuine voice; no hype, no rushing. Do not speed the audio to fit.
- Hero shot, detail shots, product in context (the Apple three-part structure). Motion should carry meaning: a cut on the beat where something lands.
- Judges must be able to see it: large type, legible interface, the thing that matters filling the frame.

What the first cut did against this list: it opened on a two-paragraph card; the builds sat small in the middle of an ivory field; the captions were 36 px on a 1080 frame; every segment carried numbers; nothing moved except the replay; there was no music.

## Measured causes, and what the rebuild changes

- Soil flicker is the configurator's film player (`?replays`), not the model. The rebuild records replays directly through bin/replay.mjs, which re-applies accepted ops through the public API and never uses the film player. A direct recording is checked for flicker before it is used.
- The camera never moves in the first cut. The public API has `view(az, polar, fit)`; the rebuild drives it during the replay, so builds are shown close and turning.
- The strawberry false start (28 place, 22 remove ops, one rolled-back batch) is cut around, and the refusal that caused it becomes a beat, not a bug.
- Furniture: Bebas Neue headlines at 130 to 190 px, Space Mono labels, Lora body, the house ivory, navy and gold; a dark field for cards; truth chips (REPLAY, LIVE, RENDER) in the same type, large.
- Music: a bed scored on the 120 BPM grid from the CC0 percussion kit (project-foundry tools/hex-bed.py, provenance per sample), extended to the cut's length with a sub line, mastered with tools/hex-master.py; cuts land on downbeats. Original, so the licence is recorded by the sample provenance file.

## Treatment A: "Typed. Built." (recommended)

One sentence becomes one object, shown big and close; the other three builds follow as a rhythm; a live run proves it; one number; the parts.

Opening line (owner's voice, over the brief typing itself): "You type what you want. Meta's Muse Spark builds it in our configurator."

Beats, 120 BPM, bar = 2 s, about 2:50:

1. 0:00 Black. The brief types itself in large mono over the empty bench: "A strawberry tower for a small balcony..." Music: a single tick.
2. 0:04 Downbeat. Smash cut to the finished tower, close, turning. TYPED. / BUILT. Voice: the opening line.
3. 0:10 One line, big, both halves: "Pre-existing: the Hex Cluster configurator and its crystal (One Thousand Drones; Emotive Engine, MIT). Built this week: the agent, its tools, its checks, its evaluation." Voice says it.
4. 0:16 The engine room. The strawberry replay, 3 to 4x, camera moving, the model's own messages as large captions timed to the trace: "Building your strawberry tower — seven planters rising around a tall centre." Chip: REPLAY · MUSE SPARK 1.3 · NOT LIVE.
5. 0:40 THE RULES SAID NO. The configurator's refusal (NEEDS_TALL_BASE, shortened) beside the model's verbatim reply: "The deep planters need taller single-piece frames — rebuilding the tower that way." Voice: "The configurator's rules say no. The model reads the refusal and rebuilds the base."
6. 0:52 The rebuild and the planting, fast, ending on the tower full of strawberries.
7. 1:00 Three more sentences, 8 s each, on the beat: kitchen terrace (12 planters, 11 species), drone pit station (108 parts), 3D-printing station (133 parts). Each: the brief typed, then the finished build close and turning. Caption: "chosen by the owner from its brief's runs; every run counted in the paper."
8. 1:24 LIVE. The screen recording of the live run, cropped to the app, the live panel readable, LIVE chip with the date and the speed-up. Voice: "That was a recording. This is live: Muse Spark 1.3 on Meta's Model API, right now. Whatever the checks say is what we show." Ends on the run's own verdict.
9. 1:56 The honest no. Empty bench. "Declined: toddler step stool unsafe to build from 3D-printed parts. Nothing placed." Voice: one sentence.
10. 2:08 One number, large: 14 of 18 held-out briefs, Muse Spark 1.3, one pre-committed run each, 95% interval 54.8 to 91.0%. "Passes not audited; see the paper." Do-nothing: 4 of 18.
11. 2:20 From sentence to parts: the build sheet, the assembly steps at speed (chip: Hex Cluster product, not entered for judging; planned by code, no model running), then the bench render (chip: RENDER, NOT A PHOTO). Voice: "The configurator makes the parts list and the print files. Nothing here has been printed yet."
12. 2:44 End card: hex-agent · github.com/Otd-llc/hex-agent · Muse Spark 1.3 via the Meta Model API · paper and every run in the repository.

Style frame: `_video/treatments/frame-a.png` (ivory, the tower filling the frame, the brief in mono, TYPED. BUILT.).

Why this one: it opens on the outcome in four seconds, spends 70% of its time on the product working, keeps the refusal as the one piece of mechanism judges are told to value, keeps the live Meta call and the numbers the rules need, and the only numbers on screen are the paper's headline ones.

## Treatment B: "The rules said no"

The film is a conversation between the configurator's rules and the model. It opens on the red NO. Each build is told through its refusals and the model's replies: the tower (NEEDS_TALL_BASE), the live run (PROP_NO_REST, refused five times on screen in the recording), the toddler stool (the model's own decline). The builds appear between the exchanges as the result of each reply.

Opening line: "Every time our configurator said no this week, a Meta model listened."

Style frame: `_video/treatments/frame-b.png` (the tower frames mid-build, THE RULES SAID NO, the two quotes side by side on a dark panel).

Strengths: the strongest on Use of Meta AI tooling (25%), since it shows the capability that is actually new (reading a rule engine's refusals and acting on them). Risks: more cards, more mechanism, closer to the "technical detail" the owner rejected; the builds get less screen time.

## Treatment C: "Four sentences"

A music-led montage with almost no voice. Dark field, big gold type. Four briefs typed, four builds revealed close and turning, with Blender renders of each on the bench as the hero shots (one exists; three more are about 40 minutes of GPU). The live run sits in the middle as the one long take. The numbers and the honesty line close it.

Opening line: none spoken; on screen, "Four sentences. Four builds." then the first brief.

Style frame: `_video/treatments/frame-c.png` (dark field, four tiles, corner ticks).

Strengths: the most cinematic; the best Demo (25%) score on look alone; the simplest to cut. Risks: the least explanation of how it works, so Technical depth (20%) rests on the paper; a wordless film needs every chip and label to carry the truth rules on its own.

## Recommendation

A, taking B's NO beat as its centre and C's dark tiles for the end. It satisfies every organiser ruling in the first 16 seconds, shows the mechanism once where it matters, and the rest is the product. If the owner prefers C, the render queue starts first because it is the long pole.

## After the pick

1. Direct replay recorder with camera moves (bin/replay.mjs + `view()`), flicker check on the output before any use.
2. Bed scored to the beat grid; mastered; `normalization_type` checked.
3. Kinetic overlay renderer (per-frame HTML to PNG, NVENC), replacing the static card overlays.
4. Cuts shown to the owner as they land (phone-sized mp4s), then the voice lines, then the steps in the handoff plan's "After the video is approved".
