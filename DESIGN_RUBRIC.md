# Design rubric

What makes a Hex Cluster build good. The agent reads this when it plans and
when it reviews its own result; each owner review round adds to it.

Three kinds of rule live here and are kept apart on purpose:

- **A. Engineering constraints**: the configurator enforces them, or a
  printed part would not fit or drain. Breaking one is a defect.
- **B. Design guidance**: taste. Breaking one makes a build weaker, not
  wrong. These are never turned into safety rules or hard gates.
- **C. Where each rule came from**: the owner's sandbox reviews in this
  project, or design knowledge observed in OTD's existing (private) catalog
  pipeline. Pipeline-derived lines are marked **[catalog]** and are
  paraphrased observations, not copied code or configurations.

Nothing here certifies strength, drainage performance or print quality. The
configurator checks fit and collisions only.

## A. Engineering constraints

- Full bases cannot stand on half bases (`KIND_MISMATCH_BELOW`): above a
  half cell goes another half cell. *[configurator]*
- A tall column is one fused base (`place` with `storeys: 2|3`), and its bin
  is keyed on the top storey with a depth suffix (`-x2`, `-x3`); a one-storey
  part has no suffix. *[configurator; catalog]*
- Every living-plant bin is a drain variant. *[catalog]*
- Plant depth follows bin depth: one storey (about 69 mm of soil) suits
  seedlings, microgreens and succulents; most crops want two storeys; deep
  crops want three. The largest bin holds about 4.5 L, so full-size tomatoes
  and peppers belong in pots, not bins. *[catalog]*
- A pot wider than a bin's inner opening (about 126 mm for a full bin) perches
  on the rim: big pots stand on lids or the floor, never on an open bin.
  *[catalog]*
- Pockets, ports and notch parts never sit over a planter's rim (they
  clash). *[catalog]*
- Every drawer must open (`setDrawerOpen` accepted). *[checked in code]*
- A joint bolt locks every load surface; notch and bay parts count as locks.
  *[catalog; configurator LOOSE_BODY]*
- A straight run of half cells cannot be locked: no joint bolts are offered
  between them and side connectors clash. *[observed round 3]*
- Notch planters stand at ground level, one tall part per site. Stacked
  single notches roof the one below, which then cannot be planted.
  *[observed round 3]*
- Above three storeys, a column is a second fused part stacked on the first
  (`place` at level 3); its planter takes the top part's depth. *[observed
  round 3]*

## B. Design guidance

### Purpose
- One purpose and one setting per build, stated in one sentence a viewer can
  check by opening the build (a kitchen windowsill, a sunny patio, a desk).
  *[owner R1: "Is it meant to display books? Potted plants? Inside,
  outside?"; catalog: every variation has a one-sentence note]*
- No tool walls. *[owner R1]*

### Shape
- One recognisable silhouette: a staircase, a pyramid, a spiral, a ring, a
  slim trough. Irregular piles of cells read as "odd". *[owner R1]*
- Height is the organising idea, and every tier is used. *[owner R2 picks]*
- Flat walls: half cells on the flanks with the cut face outward.
  *[catalog]*
- Prefer tall fused columns to stacked single storeys. *[catalog]*
- No empty hex: every binnable cell holds a planter, or there is a stated
  reason. Fill gaps the footprint leaves: two touching neighbours take a
  notch planter, three take a bay. *[catalog; owner on the film tables:
  "you're wasting space by not having bins"]*
- **End caps on every open face, staggered, the tallest that fit.**
  Neighbouring faces alternate where their seams fall (brickwork), and within
  that each cap is as tall as it can be (2-storey caps over 1-storey): a
  3-storey face is capped 2+1 or 1+2, a 2-storey face 2 or 1+1. It gives the
  builds a futurist rhythm. Where every open face is one storey (a stepped
  pyramid's bands), single caps are all that fit. *[owner R3: "Always the
  tallest you can and always staggered when you can"]*
- Populate the obvious faces; no wasted perimeter. *[owner on the film
  tables: "The obvious places to put bolt on bins and such aren't
  populated"]*
- No legs that lift a build for no reason, no "foot hexes", no lower shelf
  under a top. *[owner on the film tables: "the legs are too long", "look
  ridiculous", "a table under the table", "Just do normal legs man"]*

### Planting and staging
- Plants go in soil, at rim height: in a drained planter filled with soil, or
  in a real pot that is filled and planted. Never on a lid, never a bare
  plant. *[owner R1: "naked plant cubes"; catalog audit: 88% of plant
  requests went into unsoiled bins]*
- Plant stage matches depth, and plant choice matches position: a herb spiral
  puts dry-loving herbs at the crown and moisture-loving ones at the foot;
  trailing plants low, fruit high. *[owner R2 pick; garden practice]*
- Vary the planting: more than one flower, crops chosen for the build's
  purpose. *[catalog audit: marigold was the only flower]*
- Staging is where a person would put it, and it never hides the unit. No
  props on handles, nothing floating. *[owner R1: battery on the handle;
  owner on the film props: "props are just floating there"; R2: laptop in
  front of the caddy]*
- Foliage must not bury the structure: younger, smaller plants on the outer
  tiers keep the steps of a tiered build readable. *[review round 3]*
- Plant scale matters on screen: very large models (romaine, cabbage, chard
  at harvest) overhang their neighbours and dominate; a pepper without fruit
  does not read as a pepper. *[review round 3]*
- Check the purpose against geometry: a one-cell gap is too small to stand
  in; a sixty-degree wedge does not fit a ninety-degree corner. *[review
  round 3: both builds dropped]*
- A tall single column with a plant on top reads as a bare monolith; height
  should step, so each storey is visible as a change. *[review round 3]*
- Put the tallest part at the back of the expected view so the descent faces
  the viewer. *[review round 3]*
- Props are placed where they rest; a prop is only ever dropped INTO a
  container (a bin or grab bin), never onto a lid or the floor, where it
  tumbles (a lamp lying on the floor, a tilted mug). If it does not rest,
  leave it out. *[review round 4]*
- Deep bins hide what is in them: a tray that should show its parts is a
  shallow one-storey bin on top of a tall column, with that reason stated.
  *[review round 4]*
- A bench needs bench proportions: a seat several cells long, nothing on the
  seat, arms at both ends, mirrored. Three cells reads as a stool or a table.
  *[review round 4]*
- Drawers face the user, on one consistent front (or, for a two-sided piece,
  say so in its purpose). Canted fronts read as
  "use me at an angle", a good primitive for ergonomic desk storage.
  *[owner R1]*

## What the owner picked

- **Round 2: tiered-herbs and plant-pyramid.** Height is the organising
  idea, the silhouette reads at a glance and is symmetric, every planting
  surface is used, and the staging is alive (soil, real pots). Drawer, desk
  and device builds were not picked in either round.

## Using this in the agent (proposal)

Which criteria can steer the agent without becoming a rule engine:

- **Plan step** (cheap, model-read): purpose sentence, silhouette, tier plan
  and planting plan written before the first op. The rubric's B section is
  the prompt material.
- **Code checks** (measurable, few): the A constraints the configurator
  does not already enforce: every drawer opens; living plants sit in soil or
  in a filled pot; no empty binnable hex without a stated reason; plant stage
  versus bin depth. Reported in the verdict, fed back before finish.
- **Critique step** (taste): a vision-capable model compares a screenshot
  against section B and the owner-picked examples, and the agent revises once.
  Aesthetic misses are reported, never gated.
