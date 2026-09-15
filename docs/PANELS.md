# Panel art and draft format

## Coordinate contract

- Art is monochrome; grayscale antialiasing and pencil/ink texture are allowed.
- World coordinates use a square grid. X increases east, Y increases south.
- Projection: `screenX = (x - y) * pitch / 2`; `screenY = (x + y) * pitch / 2 * tan(30°)`.
- `pitch` is a tile’s full **horizontal diagonal** in preview pixels, not the length of its drawn edge. The projected diamond has height `pitch / sqrt(3)`.
- North points upper right; east lower right; south lower left; west upper left.
- Art alignment uses an origin in image coordinates for world intersection `(0, 0)`. Negative local cell coordinates are valid in the draft.
- A physical 10-inch panel covers more space at the same grid scale; it should not enlarge the world’s tiles.

These are initial technical choices. Compare with a real art board before fixing the production grid template. The workshop defaults to an 800-pixel square preview and 80-pixel tile diagonal on an 8-inch board: **0.8 inches per tile diagonal**. On a 10-inch board the same scale is 64 preview pixels. This is provisional, not a requirement to redraw existing art.

## Layers

1. **Original scan**: high-resolution archival image; retained outside the current prototype.
2. **Display art**: grayscale image, nondestructively aligned to the world grid in the future importer.
3. **Navigation**: reviewed cells and edge passability. Independent of decorative ink.
4. **Fixtures/encounters**: room type, interaction anchors, spawn metadata. Independent of navigation.
5. **Connections**: explicit links to cells on other panels, with direction and eventually elevation.

The prototype stores a downsampled 800 × 800 PNG preview. PNG is appropriate for lossless grayscale and future alpha sprites. JPEG/WebP are accepted as scan inputs, but original scans should remain available for a future full-resolution pipeline.

## Current portable draft, version 1

```json
{
  "format": "heavy-earth-panel-draft",
  "version": 1,
  "projection": { "angleDegrees": 30, "previewPixels": 800 },
  "panels": [{
    "id": "stable-panel-id",
    "name": "North passage",
    "inches": 8,
    "pitch": 80,
    "origin": [400, 100],
    "assembly": [0, 0],
    "threshold": 150,
    "art": "data:image/png;base64,...",
    "cells": [{ "x": 1, "y": 2, "kind": "open" }],
    "connectors": [{
      "id": "stable-passage-id",
      "x": 1, "y": 2,
      "direction": "east",
      "target": null
    }]
  }]
}
```

`assembly` records the physical mosaic slot only; it does not connect paths. A connector’s `target` identifies a connector on another panel, whose `target` points back. Unlinked endpoints are allowed in a work-in-progress draft. Directions are recorded but production compatibility is not enforced yet.

The loader checks format/version, 30° axes, preview resolution, numeric ranges, image types, unique IDs, annotation shapes, and reciprocal cross-panel links. It accepts at most 16 panels and 100 connectors per panel. Imports merge; duplicate IDs are rejected. Exports warn about inconsistent physical pitch. This remains an **authoring draft**, not a validated runtime level format.

## Why white pixels alone are insufficient

Grid lines cross navigable tiles. Hatched floors may be darker than some walls. A drawn fountain has both dark and light areas. Scanned panel edges can include white margins that are not playable space. Therefore a global threshold can suggest regions, but must not be allowed to define gameplay directly.

The future classifier needs calibrated grid sampling, boundary tests, recognition or exclusion of fixture art, and explicit uncertain/review states. Every accepted runtime boundary must agree with its neighboring cell. Narrow corridors and doors need edge-level metadata; the current prototype’s cell annotations do not yet represent those boundaries.

## Try it

Import `examples/two-panel-draft.json` in the workshop. It contains synthetic calibration images and two reciprocal connector endpoints. Review and relink endpoints, mark cells, adjust the threshold, export, reload, and import again. It is intentionally not a playable dungeon.
