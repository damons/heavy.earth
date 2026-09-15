# Calibrated HE8 samples — grid first

These four samples are constructed directly from HEAVY.EARTH's shared projection. They replace the earlier AI-painted samples **for geometry and slicing tests**. The earlier illustrations remain available as visual references; no warp or relabeling of their inaccurate grids was performed.

## Files

- [Visual gallery](index.html), including an exact overlay toggle and 8-inch print layout.
- [Four-panel workshop draft](four-panel-draft.json), with cell tags and level markers.
- [Exact transparent grid](grid-overlay.svg).
- [Physical geometry specification](geometry.json).
- [Entrance Hall cell-art atlas](entrance-cell-art.json), exported by the workshop: 324 transparent diamond cuts with classifications.

| Panel | Files | Level / navigation example |
| --- | --- | --- |
| Entrance Hall | [SVG](01-entrance-hall.svg) · [PNG](01-entrance-hall.png) · [Cells](01-entrance-hall-cells.json) | Level 1; stairs down to Ossuary, Excelsior Transporter |
| Silent Shrine | [SVG](02-silent-shrine.svg) · [PNG](02-silent-shrine.png) · [Cells](02-silent-shrine-cells.json) | Level 1; local steps and pit to Cistern landing |
| Dry Cistern | [SVG](03-dry-cistern.svg) · [PNG](03-dry-cistern.png) · [Cells](03-dry-cistern-cells.json) | Level 2; arrival point, upward elevator |
| Ossuary | [SVG](04-ossuary.svg) · [PNG](04-ossuary.png) · [Cells](04-ossuary-cells.json) | Level 2; return stairs, random teleporter |

Use **Panel workshop → Import panel draft** in an empty workshop. Hide **Show cell tags** to inspect the art beneath the exact overlay. The tags deliberately record object footprints separately from open floors. Toggle **Show grid overlay** to compare the illustration with the master grid.

## Exact construction

1. Use the master HE8 origin, angle, and physical scale to create the cell graph.
2. Draw each floor polygon from `cellPolygon(x,y)`; do not estimate the grid from the picture.
3. Add deterministic pen-and-ink textures on those cells: fine cracks, stippling, and chipped stone contours.
4. Extrude architectural ground edges vertically, using the same projection for their horizontal axes; add masonry courses, crosshatching, carved niches, and scratched highlights within those surfaces.
5. Export the SVG, 2400 × 2400 PNG, 800 × 800 preview, and cell-coordinate sidecar.

An 8-inch SVG has viewBox `0 0 800 800`. A diamond is exactly 50 × 25 preview units, or ½ × ¼ inch, with slopes ±1/2. All 94 master grid lines derive from the shared module. No generative image model controls this sample set's geometry.

The ink-and-stone treatment preserves the original cell classifications, floor polygons, and level-navigation markers. Earth scratches are masked away from floor cells, and recessed masonry is clipped to the pit footprints. Ornament is procedural vector artwork, not scanned or hand-drawn art.

SVG groups are `grid-first`, `ink-detail`, and `architecture`. The transparent full-panel grid is a separate file. Raised surfaces have a vertical screen offset; their ground anchors still follow the grid. The PNG is a flattened preview of these layers; the SVG retains the layers for later authoring tools.

The 2400-pixel PNG corresponds to 300 pixels per inch **when printed at 8 × 8 inches**. Set print dimensions explicitly; automatic printer scaling or PNG resolution metadata must not change the board size. Keep TOP up. The exact grid can tile with any conforming panel, but this sample pack's artwork at panel edges is not a certified network of connecting passages.

## What is and is not verified

Automated tests compare every rendered floor polygon and every sidecar cell polygon with the shared projection. They check exact slopes, diamond size/area, master-grid seams, destination levels, and draft validity. Illustrations were rendered and visually inspected.

These are deterministic calibration fixtures, not finished hand-drawn art or playable custom maps. Navigation markers are authoring metadata. Tall architecture can cover neighboring ground cells in the flattened picture; cell cuts preserve visible pixels, not hidden surfaces. Detailed navigation, room effects, edge passability and full-resolution sprite extraction still need implementation.

The atlas is an application export; re-export it after changing the entrance artwork or annotations.

Regenerate with `node scripts/generate_calibrated_panels.mjs` (Node and `rsvg-convert` required), then run `npm test`. The process renders new vector artwork and leaves the earlier raster illustrations unchanged.
