# HE8: interchangeable 8-inch panels

**Every conforming panel uses the same template.** Put any panel beside, above, or below any other, with TOP up and the physical edges flush, and the grid lines continue across the seam. Artwork and passage placement can differ.

## Fixed standard

| Property | Required value |
| --- | --- |
| Physical board | 8 × 8 inches only |
| Projection | 2:1 dimetric, commonly called isometric-style |
| Grid-line slopes | Exactly +1/2 and −1/2 |
| Angles to horizontal | ±atan(1/2), approximately ±26.565051° |
| Full diamond diagonals | 1/2 inch horizontal × 1/4 inch vertical |
| Origin | Grid intersection at the top-left physical corner |
| Orientation | TOP up; no 90° rotations or reflections |
| Normalized scan preview | 800 × 800 pixels |
| Preview diamond | 50 × 25 pixels; origin [0, 0] |
| Standard ID | `HE8-2to1-0.5in-v1` |

The game renderer, workshop and printable assets use the same exact slope. Game camera zoom is independent of physical diamond size. An 8-inch board spans 16 horizontal grid repeats and 32 vertical repeats. The decimal angle is for explanation only; code uses division by 2 and 4 to avoid rounding drift.

## Why arbitrary neighbors match

In inches, world-grid coordinates `(u, v)` project to:

```text
X = (u − v) / 4
Y = (u + v) / 8
```

Moving one physical board to the right adds 8 inches to X. That is exactly the integer world-grid translation `(u + 16, v − 16)`.

Moving one physical board down adds 8 inches to Y. That is exactly `(u + 32, v + 32)`.

Both moves take every grid line and vertex onto the same repeating grid. Their inverses cover left and up, and combining them covers any row/column in the mosaic. No alternating templates or position-specific offsets are needed. Horizontal edge intersections repeat every 1/2 inch; vertical edge intersections repeat every 1/4 inch.

This is why restricting to 8-inch boards helps assembly but **does not, by itself, fix the former 30° projection**. A repeating true-30° lattice has an irrational √3 ratio between its horizontal and vertical periods; an identical square template cannot repeat exactly in both directions. HE8 deliberately uses the rational 2:1 projection instead.

## Print and trace

- [Measured US Letter PDF](../output/pdf/heavy-earth-8x8-template.pdf): page 1 contains an exact 8-inch square; page 2 shows four neighboring templates at reduced scale.
- [Exact-size SVG](../game/web/panel-grid.svg): an 8 × 8 inch vector grid with no drawing labels inside it. Its upper edge is TOP.

Print PDF page 1 at **Actual Size / 100%**. Disable Fit, Shrink, and borderless enlargement. The square must measure **8 inches in both directions**; the separate scale bar must measure **1 inch**. The panel outline is at the physical board edges, not inside an extra margin. Mark TOP on the back of each board before tracing. Keep grid scale, origin, orientation, and panel edges consistent across all drawings.

Printer scaling, scanner skew, cropping mistakes, board manufacturing tolerance, or inaccurate tracing can cause physical mismatch even when the digital geometry is exact. Check a print with a ruler before making multiple boards. The workshop displays a fixed overlay but does not automatically certify a scan’s drawn grid.

## Panel placement versus dungeon connections

`assembly: [column, row]` means a physical offset of `[column × 8, row × 8]` inches. Negative coordinates are allowed. Overlapping slots are rejected. Placement does not change a panel’s local grid origin.

Grid seams match for any compliant neighbor. Doors and tunnels only connect if the artwork and authored endpoints agree. Two arbitrary dungeon drawings are not guaranteed to have a doorway at the same location. Passage conventions, edge validation, and custom-panel gameplay are separate roadmap work.

## Layers

1. **Original scan:** archival high-resolution image retained outside the prototype.
2. **Display art:** grayscale, cropped to the board edges with TOP up, then normalized to the canonical square preview.
3. **Navigation:** reviewed cells and eventually edge passability, separate from decorative ink.
4. **Fixtures/encounters:** room types and interaction/spawn anchors, separate from navigation.
5. **Connections:** explicit links to endpoints on other panels, eventually with compatible edge/elevation validation.

The prototype exports 800-pixel grayscale PNG previews. Keep original scans for future nondestructive registration and full-resolution rendering. A wrongly aligned image must be corrected; moving or resizing the grid to fit it would break interchangeability.

## Portable authoring draft, version 2

```json
{
  "format": "heavy-earth-panel-draft",
  "version": 2,
  "projection": {
    "standard": "HE8-2to1-0.5in-v1",
    "ratio": "2:1",
    "previewPixels": 800,
    "tileWidthInches": 0.5
  },
  "panels": [{
    "id": "stable-panel-id",
    "name": "North passage",
    "inches": 8,
    "pitch": 50,
    "origin": [0, 0],
    "top": "up",
    "assembly": [0, 0],
    "threshold": 150,
    "art": "data:image/png;base64,...",
    "cells": [{ "x": 9, "y": 6, "kind": "open" }],
    "connectors": [{
      "id": "stable-passage-id",
      "x": 9, "y": 6,
      "direction": "east",
      "target": null
    }]
  }]
}
```

Grid properties are fixed, not independent calibration knobs. Import/export rejects 10-inch boards, a different pitch, shifted origins, a different TOP orientation, mismatched projection, and duplicate assembly positions. It also checks unique IDs, image/annotation shapes, and reciprocal cross-panel links. A project supports at most 16 panels and 100 connectors per panel.

A connector’s `target` identifies another panel’s connector, whose `target` points back. Unlinked endpoints are valid in a draft. Draft validation does not imply the image conforms, navigation is classified correctly, or passages align physically. This is not yet a runtime dungeon format.

### Earlier drafts

Version 1 used 30° axes, adjustable origins/scale, and 8- or 10-inch boards. It is rejected with an explicit explanation, as are earlier version-2 drafts using `HE8-2to1-1in-v1` (1-inch diamonds). The finer grid retains draft schema version 2 with a distinct standard ID. No automatic migration is attempted: changing only metadata would reinterpret existing artwork and cell annotations incorrectly. Keep that original draft and reauthor/register its art and annotations against HE8 separately. Existing **game saves** are unaffected by the projection change.

## Verification and regeneration

`npm test` verifies integer world translations across 625 assembly positions, multiple panel permutations, rejection of incompatible drafts, and the actual SVG’s line slopes and intersections on all four edges. It checks 62 interior line endpoints on each vertical side and 30 on each horizontal side, including their slope directions.

The single geometry source is `game/web/grid.js`. Run `python3 scripts/generate_panel_assets.py` with Node and ReportLab installed to regenerate the PDF, SVG and synthetic example fixtures. The generator reads this shared module directly.

Try `examples/two-panel-draft.json` in the workshop. Its synthetic images follow HE8; its example connector links demonstrate authoring metadata, not validated seam-crossing gameplay.
