# Sandbox round 3: planter builds

Hand-built reference configurations, made through the configurator's public
browser API (`window.hexAPI`), not by the agent. Informed by the owner's
round-2 picks (tiered-herbs, plant-pyramid) and by design principles observed,
read-only, in OTD's existing catalog pipeline (see `DESIGN_RUBRIC.md`, marked
`[catalog]`). No catalog code or configuration was copied.

Every build passed the configurator's placement rules and collision check and
reloads from its share link. That proves fit and clearance only: not
strength, drainage performance or print quality.

## How the round was judged

Three rounds of independent review by fresh agents that had not seen the
design reasoning, each trying to refute every pitch claim from the screenshots
(the otd-hex-builds rule: no stills reach the owner until a round fails
nothing). Seven builds went in; three came out.

| Build | Parts | Final verdict | Notes from review 3 |
|---|---|---|---|
| **Strawberry pyramid** (hero) | 120 | pass with notes | Symmetric pyramid reads at a glance; red fruit inner tier, young plants outer tier and rim notches, nasturtium crown. Stepping reads shallow from this camera; a bare column face shows at the front centre. |
| Succession salad theatre | 63 | pass with notes | Three stages read as a staircase; middle-row bok choy is nearly harvest size, so "young" is a stretch; no setting stated; right flank shows its full side. |
| Tomatoes with companions | 37 | pass with notes | Clearest purpose (companion planting); peppers are large for one cell; right column's side fully exposed. |

Dropped, with the reason:

| Build | Why |
|---|---|
| Herb spiral | A spiral that peaks at its centre hides the cell behind it from the configurator's fixed camera, and the public API has no camera control. Two layouts each left a planter and its claimed herb unseen. |
| Raised salad ring | The "open heart" was one cell, too small to stand in, and the lettuces hid it. |
| Corner wedge | A sixty-degree wedge does not fit a ninety-degree corner; its purpose was false. |
| Windowsill trough | A straight run of half cells cannot be locked: no joint bolts offered, side connectors clash. |

## Hero: strawberry pyramid

All three reviewers chose it independently. It is the only build whose
silhouette reads instantly as its name, it is symmetric, it uses height as
the organising idea and fills every planting surface: the same qualities as
the owner's round-2 pick. As a live agent build it has a clear sequence (19
columns rise in three tiers, then 31 plants, ending on the nasturtium crown).

Risks before it is filmed:
- Size: 120 parts and about 55 s for a scripted build; an agent build will be
  slower. Time it before planning the video.
- Foliage still flattens the tiers from the default camera; show the bare
  stepped structure before planting, and check the front-centre column face.
- The configurator's placement-anchor rings clutter every still.
- Content rule: if it becomes promo content, it should be rebuilt through the
  catalog family pipeline in the private repo (otd-hex-builds: content builds
  come from a generator that reproduces an owner build), not shipped from this
  hand-built spec.

Fallback: tomatoes with companions (37 parts, about 24 s, most legible purpose).

## Recommendations for the agent

What can guide the agent without becoming another rule engine:

1. **Plan step (prompt, no code):** before the first op the agent writes a
   purpose and setting sentence, a silhouette, a tier plan with heights, and a
   planting plan by depth. `DESIGN_RUBRIC.md` section B is the prompt
   material, with the owner's picks as examples.
2. **A few code checks, reported not gated:**
   - every planter has soil and a plant that rests (`PROP_NO_REST` is a
     signal);
   - plant stage against planter depth (seedling in one storey, harvest in
     two or three);
   - no stacked notch planters;
   - every drawer opens (already in place).
   These are facts the configurator reports; aesthetic preferences stay out.
3. **Critique step (taste, one pass):** a vision-capable model reviews the
   screenshot against section B and the pitch, the same way these reviewers
   did; the agent revises once. Misses are reported, never gated.
4. **What not to encode:** aesthetic preferences as physical rules; the
   catalog generator itself; camera tricks the public API cannot do.

Labels: these builds are hand-built reference material. The hackathon demo
must show a live Meta-model build; a hand-built spec is never presented as
agent output.
