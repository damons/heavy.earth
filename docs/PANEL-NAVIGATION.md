# Panel levels, markers, and cell artwork

The workshop records navigation intent separately from the illustration. Custom panels are still authoring drafts, not loaded into gameplay. The original Rust game rules remain unchanged.

## Levels and passages

Each panel has a `level`: 0 represents the surface, 1 is the first dungeon level, and higher numbers go deeper. The authoring format permits 0–1000; this does not expand the existing game's 20-level dungeons. Assembly coordinates are unique **within a level**. Two boards can occupy [0,0] on different levels.

Ordinary passage connectors remain reciprocal and must join two panels on the same level. Use level markers for vertical travel. A scan is assigned to one dungeon level; artwork that depicts stacked, overlapping floors will eventually need separate selectable floor layers.

## Marking level navigation

Choose **Add level marker**, select a kind, and click the source cell. The square symbol and L-number identify the marker; the list below the canvas shows its kind, cell, and destination.

| Kind | Symbol | Meaning |
| --- | --- | --- |
| Stairs up | ↑ | Climb to the adjacent shallower level |
| Stairs down | ↓ | Descend to the adjacent deeper level |
| Pit drop | ⇣ | One-way drop; avoidance and damage are game rules |
| Arrival / landing | ◎ | Explicit arrival cell, with no outgoing travel |
| Steps within this level | ≋ | Visual elevation change; no dungeon-level transition |
| Excelsior Transporter | EX | Player-selected level, governed by the engine |
| Random teleporter | TP | Random destination governed by the engine |
| Elevator up | ⇡ | Automatic upward travel, governed by the engine |

For stairs, pits, and elevators, choose **Game rules** or an explicit stair/landing on the adjacent level. Fixed links are directed: create and link a return stair separately. For an up-and-down staircase, place both kinds on the same source cell. Removing a destination clears incoming links to **Unassigned — needs review**; it never invents a replacement.

A panel's level cannot be changed if doing so would break an existing passage/level link or collide with another board. Unassign the affected links first. This protects authored destinations from silent reinterpretation.

Transporters and teleporters cannot be authored as fixed links in this skeleton. The Excelsior Transporter uses the current game’s level selection, price, Orb, and Time Stop behavior. Random teleporters use its random destination rules. An `engine` destination records intent only; it does not enable these fixtures on custom panels yet. The same is true of pit damage/avoidance and elevator restrictions. No new navigation behavior has been added to the frozen engine.

## Cell classification and cutting artwork

The click tools label a cell as walkable (`open`), blocked, wall, object, or item. An object/item label does **not** declare that cell walkable or blocked. Object identity, multi-cell footprints, independent passability, collectible behavior and inventories are later authoring work.

**Export marked cell artwork** creates a JSON atlas containing every marked cell on the selected panel. Each cell includes:

- Its grid coordinates and classification.
- An exact ground-plane polygon and pixel origin.
- An embedded 50 × 25 pixel PNG clipped to the diamond, with transparent corners.
- Panel ID/level; the atlas also retains the panel's level markers.

The cuts use the source preview image, excluding editor grid lines, cell tags, and navigation badges. The first 24 cuts can be inspected in the export preview. A download link stays available after export. Save the full panel draft separately; exporting an atlas does not save workshop edits.

These are screen-space cuts of a flattened illustration. They cannot reconstruct hidden floor pixels or turn a tall sarcophagus spanning several diamonds into an isolated sprite. The calibrated SVG samples retain separate architecture and ink groups for that future work. The atlas currently exports at workshop preview resolution; full-resolution cutting remains planned.

## Version 3

New exports use draft version 3. Current half-inch version-2 drafts import by copying each panel with `level: 1` and `transitions: []`; existing artwork, cell coordinates, passages, origins, and IDs remain intact. The original file is untouched. Older 30-degree or 1-inch standards remain incompatible.

A marker has the form:

```json
{"id":"hall-down","x":29,"y":8,"kind":"stairs-down","destination":{"marker":"crypt-up"}}
```

`destination` is `null` (unassigned / no outgoing travel), `"engine"`, or an explicit `{ "marker": "stable-id" }`. Marker IDs must be unique across the draft. Landings and local steps require null; magical transport allows null or engine; fixed destinations must match travel direction and adjacent level. Missing targets and invalid levels are rejected.

See [calibrated panels](../examples/calibrated-panels/README.md) for an importable four-board assembly with reciprocal passages and engine-governed level markers.

## Overall map and stacked levels

The workshop has three views:

- **Panel** edits one scan's cells, passages, level markers, and placement.
- **Level map** joins all panels on the selected dungeon level without gutters, using their Assembly X/Y coordinates. Select a floor with **View level**. Click a panel and choose **Edit selected panel** to annotate or move it.
- **Level stack** shows every authored level in ascending order, with the surface at level 0. Each layer uses the same X/Y extent so vertically aligned panel positions line up. The stack compresses images vertically for a schematic overview; source artwork, physical calibration and exported drafts keep their original geometry.

Drag to pan, scroll or use +/− to zoom, and choose **Fit map** to reset. Keyboard users can focus the map and use arrow keys, +/−, and 0; the panel buttons below the map provide another selection route. Panel boundaries and link overlays can be hidden independently.

Solid passage markers identify reciprocal endpoints that coincide at a shared physical edge. Dashed links indicate connected endpoints whose positions do not meet. These checks compare connector positions; they do not infer corridor width or passability from scanned pixels. The destination list includes all visible passages and level markers.

In the stack, arrows follow explicit stair/pit destinations; reciprocal stairs have arrows at both ends, and a one-way pit has one arrow. Game-controlled transport and unassigned destinations are listed without inventing a destination on the map. Only authored levels are shown, including their actual numbers if some levels are missing.

To add a level, upload a panel in **Panel** view and set its **Dungeon level** and **Assembly X/Y**. Existing linked panels may need their passage/level destinations adjusted before a move is valid. A shared X/Y slot is allowed on different levels, but two panels cannot occupy the same slot on the same level.

The [six-panel stack example](../examples/calibrated-panels/stacked-levels-draft.json) demonstrates the surface plus three dungeon levels, aligned slots, paired stairs, a one-way pit, game-controlled transport and an unassigned elevator. Import it into an empty workshop; it reuses the sample artwork to demonstrate topology and is not a complete playable dungeon. Regenerate it with `node scripts/generate_stack_example.mjs` after regenerating the calibrated illustrations.

Views and selection do not change draft contents. **Export panel draft** saves the whole draft from either an overview or the editor. Export before refreshing; workshop drafts remain in browser memory until downloaded.
