# Design rubric

What makes a Hex Cluster build good, from the owner's sandbox reviews. The
agent reads this; each review round adds to it. Rules marked **[checked]** are
enforced in code; the rest are for the model and the critique step.

## Purpose
- One purpose and one setting per build (a desk, a sunny window, a flying
  field, a kitchen counter). If you cannot say who uses it and where, it is
  not designed yet. (Round 1: "Is it meant to display books? Potted plants?
  Inside, outside?")
- No tool walls. (Round 1)

## Shape
- A silhouette that reads at a glance: a row, a staircase, a tower, a
  pyramid, a symmetric block. Irregular piles of cells read as "odd".
  (Round 1: field kit, workbench, enclosure, sorter)
- Use height. Single-storey builds read as boring. (Round 1: herb garden,
  desk station)
- Full bases cannot stand on half bases; above a drawer cell goes another
  half base, which gives a taller drawer front. **[checked by the
  configurator: KIND_MISMATCH_BELOW]**

## Drawers
- Drawer orientation matters: every drawer faces the user, on one consistent
  front, and must open. **[checked: every drawer opened and closed through
  setDrawerOpen; facing reported]** (Round 1)
- Canted drawer fronts read as "use me at an angle": a good primitive for
  desk and ergonomic storage, fanned around a corner. (Round 1, drawer tower)

## Staging
- Staging tells the story of use: things sit where a person would put them.
  No props perched on handles or balanced on odd parts. (Round 1: battery on
  the handle)
- Plants go in soil: in a planter bin, or in a real pot that is filled and
  planted. Bare plant props read as "naked plant cubes". (Round 1)
- Keep the build visible: staging never hides the unit from the viewer.
  (Round 2: laptop in front of the caddy)
