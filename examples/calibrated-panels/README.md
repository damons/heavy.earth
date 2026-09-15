# Connected HE8 ink panels

Four detailed, grayscale vector illustrations constructed on the exact HE8 floor grid. The artwork includes rubble, bones, skull niches, cobwebs, urns, crates, barrels, engraved tombs, an altar, a fallen column, torches, stone chips and scratchboard earth textures.

## Assemble the boards

Keep TOP up and place the panels flush, without gutters or rotation:

| | Left column | Right column |
| --- | --- | --- |
| Top row | Entrance Hall (0, 0) | Silent Shrine (1, 0) |
| Bottom row | Dry Cistern (0, 1) | Ossuary (1, 1) |

The four rooms form a continuous loop on **dungeon level 1**. Corridors bend between the rooms; doorways include stone arches, a damaged portal and a raised gate. The complete assembly measures **16 × 16 inches**.

| Shared edge | Opening measured from the edge's top/left corner |
| --- | --- |
| Entrance Hall right ↔ Silent Shrine left | 3–3½ inches down |
| Entrance Hall bottom ↔ Dry Cistern top | 3–4 inches across |
| Silent Shrine bottom ↔ Ossuary top | 5–6 inches across |
| Dry Cistern right ↔ Ossuary left | 5–5½ inches down |

All other physical edges are closed. Full and partial floor diamonds continue through each seam. A single continuous scene supplies the wall, earth and prop artwork on both sides of every cut. Reciprocal workshop connectors identify the same split diamond at each boundary.

Any HE8 panel's **grid** can match another HE8 panel. These particular **passages** match in the arrangement above; rearranging boards requires matching their passage positions too.

## Files and workshop use

- [Gallery](index.html): seamless assembly, separate panels, grid overlay and seam toggle.
- [Assembled PNG](assembly.png) / [16-inch SVG](assembly.svg).
- [Four-panel workshop draft](four-panel-draft.json): reviewed cell tags, eight reciprocal passage endpoints and level markers.
- [Level-stack example](stacked-levels-draft.json): six panels across the surface and three dungeon levels, using the same sample art. Import separately into an empty workshop.
- [Passage specification](assembly.json), [geometry](geometry.json), [transparent grid](grid-overlay.svg).
- [Entrance Hall atlas](entrance-cell-art.json): browser-exported transparent diamond cuts.
- Each numbered panel has an 8-inch SVG, 2400 × 2400 print PNG, 800 × 800 preview, and `-cells.json` sidecar with projected polygons and object footprints.

In an empty **Panel workshop**, choose **Import panel draft**. Hide **Show cell tags** to inspect artwork beneath the exact overlay. Choose **Level map** to see all four boards joined; **Level stack** shows the draft’s authored floors. This four-board draft is all on level 1; use the separate stack example to explore several levels. Passage destinations are already linked. Stairs, pits and magical transport retain explicit level markers; their destinations use game rules or are unassigned arrivals. This replaces the earlier sample's two-level arrangement so all four physical boards can connect on one level.

## Artwork and classification

1. Construct the complete floor graph with exact ½ × ¼ inch diamonds, slopes ±½ (±26.565051°).
2. Illustrate that graph using projected surfaces and deterministic pen-and-ink detail.
3. Crop the shared scene into four 8-inch boards, preserving the top-left grid origin and partial edge cells.
4. Export cell metadata separately from the visible artwork.

SVG layers remain `grid-first`, `ink-detail`, and `architecture`. Raised objects have a vertical offset; their ground footprints use the same projection. Large rubble piles, the fallen column, furniture and fixtures are tagged **object**. Chests are **item**. Small loose bones, chips, floor engravings, and wall-mounted details are decorative; they do not automatically block movement. Recessed pits are **blocked**. The sidecars list the large features explicitly.

This deliberately exercises the ambiguity of a detailed user scan: dark ink can be a wall, a bone, an engraving or a shadow. Thresholding alone cannot resolve those meanings. Manual cell review is still required. Flattened diamond cuts contain visible pixels, including any tall structure occluding that cell; they do not recover hidden floors or isolate whole sprites.

## Validation and printing

Tests compare every rendered ground polygon with the shared grid, measure every edge opening, verify reciprocal connector coordinates, and flood-fill all walkable cells around pits and objects. The four preview crops are also compared with the rendered assembly to check visible continuity. This is calibrated procedural artwork, not AI-painted geometry or scanned hand-drawn art.

Print each panel at **8 × 8 inches**, Actual Size / 100%, with TOP up. A 2400-pixel panel gives 300 pixels per inch at that size. Measure the physical output; print/scan distortion is outside the digital geometry guarantee.

Regenerate with `node scripts/generate_calibrated_panels.mjs` (Node and `rsvg-convert` required), then re-export the Entrance Hall cell atlas from the workshop and run `npm test`. The earlier AI-painted reference panels remain unchanged in `examples/ink-panels`.

The sample draft is not yet playable as a custom dungeon; engine integration remains on the roadmap.
