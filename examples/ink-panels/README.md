# Ink dungeon sample panels

Four original AI-generated pen-and-ink dungeon illustrations for HEAVY.EARTH scan-import testing. Created with the built-in image-generation tool on 2026-09-15, using the architectural ink treatment of [Dungeon Architecture's reference page](https://ipainthings.itch.io/isometric-modular-dungeon-tiles) as visual inspiration. No images from its commercial pack are included.

| Original PNG | Subject | Useful test |
| --- | --- | --- |
| [Entrance Hall](01-entrance-hall.png) | Gatehouse, piers, guard alcove | Broad open floors, thin grid ink |
| [Silent Shrine](02-silent-shrine.png) | Altar, dais, niches | Fixtures and raised surfaces |
| [Dry Cistern](03-dry-cistern.png) | Pit, bridge, surrounding walkways | Dark voids versus walkable surfaces |
| [Ossuary](04-ossuary.png) | Sarcophagi, burial niches, rubble | Decorative ink and obstacles |

## Load the samples

Open **Panel workshop → Import panel draft** and choose [four-panel-draft.json](four-panel-draft.json) in an empty workshop. It contains all four 800 × 800 grayscale previews, produced by the application's normal scan uploader. Alternatively, add each original PNG using **Add scanned panel**.

Each image represents an **8 × 8 inch board**, with its existing upper edge kept TOP up. Originals are 1254 × 1254 pixels; the generation request asked for 2048 square but the tool returned 1254 square. To print artwork, explicitly set its output dimensions to 8 × 8 inches; do not infer physical size from the PNG's resolution metadata. Preserve these original files separately from the workshop's smaller previews.

## Geometry status

**Scan-test artwork, not certified HE8 geometry or playable dungeon maps.** The generation prompts specified 2:1 axes and ½ × ¼ inch diamonds. Visual inspection against the exact workshop overlay shows drift in the drawn angles, spacing, and origin. The metadata configures the correct HE8 overlay; it does not certify the painted floor lattice. Correcting/reauthoring the art is required before use as aligned gameplay geometry. For exact seam tests use the existing mathematical SVG and synthetic two-panel fixture instead.

The draft has no asserted walkable cells or passage links. Assembly slots [0,0] through [3,0] are storage positions, not validated physical connections. Stairs, pits, hatching, fixtures and light walls all need explicit navigation review. White pixels alone do not establish walkability.

## Checked

- All four original images were visually inspected and successfully uploaded.
- The normal uploader converted each to an 800 × 800 grayscale preview.
- The four-panel draft was exported, its schema validated, and all four panels re-imported in a fresh workshop.
- Grid overlay and black/white threshold preview were checked in the workshop.

The complete final prompts and generation provenance are in [prompts.json](prompts.json).
