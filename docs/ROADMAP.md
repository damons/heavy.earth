# Heavy Earth roadmap

## Vision

Turn the existing DOS DND recreation into a graphical, monochrome isometric dungeon crawler. Keep its current gameplay and rules while making room for a world built from the artist’s physical dungeon drawings.

The intended source medium is pen and ink / scratch art on Ampersand Claybord panels, primarily **8 × 8 inches**, with **10 × 10 inches** supported as a physical-size variant. Each panel depicts part of a level, not an entire level. All panels share identical grid angles and physical scale. Assemble a level from panels and join them at explicitly identified tunnels, doorways, stairs, and other passages. White represents potential navigable space; black represents solid earth or off-limits regions.

## 1. Play the existing dungeons in isometric view — implemented

- Separate Heavy Earth repository, build, launcher, and saves.
- Unchanged, pinned Rust DND engine and original 100 levels.
- True isometric 30° axes, grayscale floors and raised wall geometry.
- Instant player movement; no walking animation or real-time simulation.
- Placeholder graphical player, monster, and fixture forms.
- Original character creation/rerolls, combat, spells, room actions, store, travel, death, victory, and save/resume.
- Current sight/light visibility and separate explored-map journals.
- Keyboard, pointer navigation, camera pan/zoom, smaller-screen layout.

## 2. Establish the art-panel workflow — initial skeleton implemented

- Local square-scan upload and grayscale preview.
- Physical dimensions, isometric pitch, and origin calibration.
- Adjustable threshold preview with pixel inspection.
- Explicit walkable/blocked annotations, separate from image pixels.
- Named panels, assembly coordinates, connector locations and directions.
- Reciprocal passage links; portable JSON export/import with preview art.

Still needed before this becomes a production authoring tool:

- Work with the artist’s real 8 × 8 and 10 × 10 samples to settle graph spacing, margins, and registration marks. **Do not print a batch of physical boards against the provisional 0.8-inch diagonal.**
- A printable, measured grid master and scanner calibration target.
- High-resolution originals, nondestructive crop/deskew, image rotation and perspective correction; distinguish scanning resolution from in-world scale.
- A visual overview for arranging an entire mosaic of physical panels.
- Undo/redo, draft autosave, project asset storage, panel replacement/removal, and export validation reports.
- Fixture and spawn authoring separate from walkability.

## 3. Convert reviewed scans into navigable maps — planned

1. Register the scanned panel to the canonical graph.
2. Normalize lighting and separate paper/clay ground from ink.
3. Estimate white navigable regions and black solid regions.
4. Remove known guide lines and account for hatching, ornament, text, shadows, and fixture art.
5. Sample cell interiors **and cell boundaries**; a white center does not prove a corridor connects to its neighbor.
6. Mark uncertain classifications for human review; do not silently choose a path through ambiguous ink.
7. Validate a connected walkability graph, legal entry points, reciprocal boundaries, fixture placement, reachable exits, and intended isolated areas.
8. Export reviewed navigation and display data as separate assets.

The drawing remains the visual authority. The reviewed navigation graph is the gameplay authority. Preserve the original scan unchanged, and make automatic classification reversible.

## 4. Connect playable panels — planned

- Introduce a map-provider interface that can read both legacy DND maps and reviewed panel graphs.
- Use stable panel IDs, local cell coordinates, and explicit connectors; physical mosaic neighbors do not imply a traversable connection.
- Require aligned scale and compatible passage directions/elevation.
- Validate links reciprocally and move the player exactly to the destination endpoint.
- Define visibility, exploration memory, encounter generation, room IDs, and save compatibility across seams.
- Remove the current legacy provider’s 20 × 20 × 20 size assumption for custom worlds without changing the pinned legacy behavior.
- Keep custom-world saves distinct and versioned. Never reinterpret legacy coordinates as panel coordinates.

Acceptance example: enter a tunnel on panel A; emerge at its configured tunnel cell on panel B; exploration, room state, position, and RNG survive save/reload and returning through the passage. Ordinary combat and room rules remain governed by the selected rules engine.

## 5. Replace placeholders with hand-drawn assets — planned

- Grayscale transparent PNG player, monster, and fixture sprites with consistent scale and ground anchors.
- Draw depth ordering, walls/door cutaways, and foreground masking against panel art.
- Separate static panel backgrounds from interactive fixtures so a drawing of an altar can be identified and used without becoming a wall.
- Full-resolution scanned panel rendering, stitching, and visible seam treatment.
- Animation remains optional and out of the initial scope.

## Open art decisions

- Does the existing hand-drawn graph use true 30° axes or a 2:1 game projection? The initial renderer uses 30°. An example board should settle the production standard before new art is commissioned.
- What measured tile size gives comfortable drawing density on an 8-inch board?
- How should intentional overhangs, tunnels under other rooms, and elevation appear in navigation metadata?
- Are 10-inch panels larger areas at the same scale, or are they cropped into 8-inch modules? The current direction is the former, preserving common physical scale.
