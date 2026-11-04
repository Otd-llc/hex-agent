# Demo video handoff (2026-11-04)

Hand-off to a fresh session. The first full cut exists and the owner rejected it as boring. The next session researches what makes the most compelling three-minute demo, then redesigns and rebuilds the video.

Deadline: submissions due 2026-11-04 9:00 PM ET, which is 2026-11-05 02:00 UTC (docs/submission/RULES.md). Handed off about 12:20 UTC.

## The owner's verdict on the first cut

- Too much boring technical information that no one will understand or care about.
- The plant runs keep flipping the soil on and off hundreds of times.
- The strawberry tower run has false starts.
- The transitions are boring and flat.
- The video furniture (cards, captions, labels) is dull, ugly, lifeless and too small.
- The words are boring. The presentation is boring. It is not compelling.

Owner's offer: Meta credit remains and anything can be re-run to get a better narrative. Any free software may be installed, and the agent can drive it directly.

## Measured causes

- Soil flipping is not the model. Strawberry run 9329ae20 issued 7 fillSoil ops and terrace run a1530f79 issued 12. The flicker comes from the crystal replay player in the configurator (viz `src/hex/agent/film/film.js`, `pace.js`, `src/hex/agent/area/*`). So a re-run alone will not cure it if the footage comes from `?replays`. Fix it in the film player (lane 1 owns that repo and its deploys), or record a live run directly, which does not use the film player. Unverified: check that a directly recorded run has no flicker.
- The strawberry false start is real: 28 place ops and 22 remove ops, one rolled-back batch. The model tore most of the build down after the NEEDS_TALL_BASE refusal. A fresh run of the brief may not do this; every run must still be kept.

## What exists

Everything below is on disk at C:/zzz/_video, outside the repo on purpose (the repo is public and these are working files).

- `final.mp4`, `review-phone.mp4`: the rejected first cut, 178.8 s, computer scratch voice.
- `raw/`: 1-strawberry-8, 2-terrace-8, 3-drone-8, 4-print-8 (off-screen captures of `?replays`, label "REPLAY OF A MUSE SPARK 1.3 RUN (META MODEL API) · NOT LIVE"), 5-assemble (Make it build sheet, then all 28 Assemble steps on the agent's printing station), 6-render (6 s Cycles film of that station on a wooden bench, 1280x720 upscaled), 7-live (real screen recording of the live run).
- `work/edl.json`: the timeline. `work/render.mjs`: per-segment cached render with NVENC, then a stream-copy join; a full render is about 70 s and a one-segment edit about 20 s. `work/preview.html` with `node work/serve.mjs`: instant preview at http://127.0.0.1:5390/ (start it again; it is not running after a reboot). `work/overlay.js`: card and caption styles shared by preview and render. These are a means, not a constraint: replace them if the research points to a better tool.
- `work/capture.mjs`: off-screen capture of a page through CDP screencast, 52 to 56 fps with a warm persistent profile (`work/profile`). `work/flow.mjs`: scripted clicks through Make it and Assemble. `work/live.mjs`: records a live `npm start` run with ffmpeg ddagrab. `work/export.mjs`: pulls the live three.js scene (exact meshes and positions of any share link) through `__THREE_DEVTOOLS__` into `work/mesh/`. `work/scene.py`: Blender scene from those meshes (pinned build in the otd-blender skill; Cycles OptiX, about 6 s a frame at 720p, 40 spp).
- Live run: runs/2026-11-04T11-53-17-254Z-23ce1844 (dev brief from evals/briefs.json, passed, 13 model calls, 6 refusals, $0.0694). The live panel in the tab reads "META · MUSE-SPARK-1.3 · LIVE" and shows the model's choices and the configurator's rulings as they happen.
- Machine: Windows, GTX 1650 Ti (NVENC h264/hevc/av1), ffmpeg 8.0.1, DaVinci Resolve 21 and OBS installed (OBS not needed so far; its websocket is off, and if it is ever enabled generate a new password first).
- Configurator, live: `https://hex.onethousanddrones.com/hex.html?replays` then Agent then a pick (4 to 7 are the four video builds). Browse, Build it, Assemble it and Ask (closed alpha) on any open build. Build and Assemble are planned by code, not the model, and say so on screen.

## Hard constraints (still apply)

- Rules: the demo must highlight only what was built during the hackathon, and the submission must make clear what was built during the event, else disqualification. Three minutes maximum. Rubric: Impact 30%, Use of Meta AI tooling 25%, Technical depth and execution 20%, Demo 25%; the top 5 per track are ranked from the videos.
- Organiser rulings (relayed by lane 1 on 2026-11-03, not read at source): the video opens with one line on what pre-existed and what was built this week; it names the pre-existing things it uses; it shows live Meta model calls, not only replays; only open-source event work is judged.
- Truth: nothing was printed, so never imply it was. A render is labelled as a render. A replay is labelled as a replay and a live run as live. Build and Assemble are never presented as Muse. No Claude run appears as Muse. Every number comes from paper.md as published; 14 of 18 carries its "passes not audited" sense. The owner's choice stands: contradicted met lines stay off screen, so THE MODEL'S OWN REPORT panel at the end of each replay is cut for drone and printing runs (it lands about 10 s before the clip's end). New runs are kept, never dropped for looking bad, and the on-screen pick is disclosed as chosen by the owner.
- Honest compression is allowed: shorter, plainer, fewer numbers. Leaving out detail is fine; misleading is not. The paper carries the caveats.
- Model rules: runs need META_API_ALLOWED=1 on the command line, `--purpose=demo`. About $21.05 of the $150 credit is left (the ledger read $128.95 after the live run). Single `npm start` runs land in `runs/<id>`, outside every suite and every paper number; do not run `bin/suite.mjs` for video footage without checking how the demo suite is counted. Never open .env, .env.example or evals/briefs-heldout.json. `src/` stays at eval-final (pre-flight: `git diff --quiet 0c840bc HEAD -- src ':!src/runkey.mjs' bin/run.mjs bin/suite.mjs package.json package-lock.json`).
- New briefs for footage are allowed. A new brief written for the video is a demo brief, disclosed as such.
- The owner's voice is the plan for the voiceover (recorded last, one line at a time). The owner picks by looking: show options, not descriptions.
- Lane 1 owns the configurator: message it through C:/zzz/_premades/lane3-notes.jsonl and give the owner a paste box if it is offline. Deploys need the owner's OK in lane 1's chat.

## Traps already paid for

- Bash heredocs strip backslashes: write Windows paths with forward slashes, or use the Write tool. This cost a 20-minute empty recording.
- A desktop capture shows the owner's email in VS Code. Crop to the app, check the first and last frames, and do not ship raw desktop.
- ffmpeg gdigrab at 4K gets about 3.5 fps; ddagrab gets 23 or more.
- CDP screencast frames arrive out of order: sort by timestamp before encoding.
- A cold browser cache drops the capture to 15 fps: warm the persistent profile first.
- Delete nothing in C:/zzz/_video/raw until its replacement is checked.
- Probe every Blender change before a film. An unprobed tweak cost an 18-minute render.
- The terminal window in `live.mjs` did not stay on top of Chrome.

## After the video is approved

1. Owner records the voice lines.
2. Update docs/submission/VIDEO_SCRIPT.md to match the cut.
3. Update the video description in paper.md (Demo paragraph), report.md section 3.4 and ledger rows C33, C57, C91. The current text says each build shows the model's messages and tool calls, and that no longer holds for the crystal replays. Disclose the live run and its spend ($0.0694, after the paper's $128.88 total). Re-run number_trace (command in ledger.md); 0 untraced, 0 dashes required.
4. Fill the demo-video placeholder in paper.md, then `node bin/paper-render.mjs && node bin/paper-pdf.mjs`, commit, push.
5. Form answers one field at a time in chat (ledger.md form appendix). Owner submits.
