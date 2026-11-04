# Text changes for the second cut (apply after the video is approved)

Handoff plan step 3. Each edit replaces the sentence about the first cut's content. Numbers for the
live run come from its committed trace (runs/2026-11-04T11-53-17-254Z-23ce1844/trace.json).

## paper.md, Demo and results, first paragraph

Replace from "The video shows four runs from a demo set" to "which enters no number in this paper." with:

> The video shows four runs from a demo set written for the video (planters, workbenches and their
> brief revisions, five runs each, 70 runs, not an evaluation), each with its brief on screen and the
> configurator accepting placements as the run's recorded trace is re-applied through the public API
> in order (the same mechanism as bin/replay.mjs), the model's own messages from the trace quoted on
> screen at the moments they were sent, and the strawberry run's refusal shown as a card quoting the
> configurator's code and the model's reply. Each of the four builds is a direct replay of its recorded
> trace, labelled REPLAY, with no model running; the replays do not show the tool calls or the checks,
> which the paper reports. One further segment shows a live Muse Spark 1.3 run on the Meta Model API,
> labelled LIVE, recorded on 2026-11-04 after the review gate (run 23ce1844, a development brief, 13
> model calls, $0.0694 at list price, outside every suite), which enters no number in this paper. The
> product's build sheet and assembly steps (planned by code, labelled as the product and not entered
> for judging) and a Blender render of the printing station from the run's meshes (labelled as a
> render) close the video; nothing has been printed.

## paper.md, Reproduce, spend sentence

After "$128.88 in all, against $150 in credit (owner-attested)" add:

> , plus $0.0694 for the live demo run recorded after the gate (run 23ce1844, not in any suite or
> number above)

## report.md 3.4, the paragraph beginning "The video shows four runs"

Same replacement as paper.md, first paragraph.

## ledger.md

- C33: status from "needs evidence until the video exists" to "video exists (second cut, 2026-11-04);
  evidence: docs/submission/VIDEO_SCRIPT.md; replays are direct re-application of accepted ops with
  the model text quoted from the trace; live run 23ce1844".
- C57: unchanged counts; add "shown as direct replays with the trace's model text on screen, tool
  calls and checks not shown".
- C91: "accelerated replays labelled REPLAY" to "direct replays labelled REPLAY (no model running,
  tool calls and checks not shown)".

## Then

`node bin/paper-render.mjs && node bin/paper-pdf.mjs`; number_trace (ledger.md line 37 command) must
report 0 untraced and 0 dashes; the two live-run numbers trace to the committed trace.json. Fill the
demo-video placeholder with the link. Commit, push.
