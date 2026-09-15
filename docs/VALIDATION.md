# Validation — 2026-09-15

## Automated checks

- `cargo test --workspace`: **61 passing tests** — all 54 original DND tests plus 5 Heavy Earth adapter/session tests and 2 dungeon storage tests.
- Adapter coverage: 240 dungeon/position/light combinations; stable render snapshots and unchanged RNG; hidden secret-door masking; separate live/journal visibility; direct-engine command and save equivalence; resume; failed-save rollback; stale revision rejection; distinct new-character saves and invalid save IDs.
- `cargo clippy --workspace --all-targets -- -D warnings`: passed.
- `cargo fmt --all --check`: passed.
- `cargo build --release --locked`: passed on macOS with Rust 1.95.
- `npm test`: **37 passing tests** — 6,400 projection/inverse tile-picking checks, 625 arbitrary board positions, panel permutations, exact SVG seam crossings on all four edges, fixed-standard/legacy rejection, reciprocal links, malformed drafts, and the HE8 example project.
- Half-inch grid update: 0.5 × 0.25 inch diamonds; 16 horizontal and 32 vertical repeats per board. SVG checks cover all 94 lines, with 62 interior endpoints on each vertical edge and 30 on each horizontal edge. Coarse 1-inch drafts are explicitly rejected.
- Grid-first samples: every SVG floor polygon and sidecar polygon matches `cellPolygon`; 2,860 crop positions verify exact size, center, area and slopes. Version-3 tests cover nonmutating v2 upgrade, per-level slots, directed stair/pit links, invalid targets, transport modes and same-level passage constraints.
- PDF checks: two US Letter pages; the tracing square is exactly 576 × 576 points (8 × 8 inches); both pages rendered and visually inspected. The PDF/SVG and fixture generator reads the shared grid module.
- `python3 scripts/verify_engine.py`: all **56 files** match the pinned DND snapshot.
- `python3 scripts/smoke_http.py`: passed against a real server using disposable saves. Covers embedded assets, character creation, actions, stale commands, Host/Origin validation, invalid levels/save IDs, explored maps, and save/resume after server restart.

## Browser checks

Checked the local game in the Codex browser:

- Character creation, class selection, attribute roll/accept, town entry.
- Save selection after restarting the server.
- Keyboard north movement and pointer south movement changed position by one cell and advanced the original turn counter once.
- Live/journal switching, selecting an uncharted level, opening the spellbook, casting clerical Light, and observing the charge/turn changes.
- Desktop layout and 390-pixel compact layout, including camera scaling.
- Scan upload with a synthetic square fixture, grid preview, walkable annotation, connector creation, adding a second panel, reciprocal link selection, threshold preview, draft export, and import into a fresh workshop.
- HE8 follow-up: fixed geometry controls, marked TOP, v2 example import with reciprocal links, and its scan/grid overlay were verified in the browser without errors.
- The half-inch workshop label and updated two-panel example import were verified in the browser, including the reciprocal passage at cell (18, 12).
- The running adventure was restored after the build update; its save file remained byte-for-byte unchanged.
- No browser warnings/errors were reported during the gameplay checks.

## Calibrated-panel and navigation follow-up

- Four calibrated SVG/PNG panels rendered and visually inspected; their v3 draft imports with stairs, pit/landing, local steps and transport markers.
- Verified the rendered destination selectors and that removing a landing clears the incoming pit link to Unassigned.
- Grid and cell-tag visibility controls allow inspection of the artwork beneath annotations.
- Downloaded the actual browser-generated entrance atlas: all 324 embedded PNGs are 50 × 25 RGBA images with transparent corners. The first 24 crop canvases were also inspected in the UI.
- The generator uses the grid before adding artwork. No AI-painted floor grid is treated as calibrated geometry.

## Ink-and-stone artwork refinement

- Added procedural pen-and-ink masonry, carved niches, layered fixtures, floor cracks and masked scratchboard earth details to all four calibrated panels.
- Compared the full draft against the previous version with only image payloads removed: all panel coordinates, classifications and navigation markers are unchanged. Cell sidecars, geometry specification and master grid are byte-for-byte unchanged.
- All 15 JavaScript tests pass against the styled SVGs. All four print PNGs are 2400 × 2400 and strictly grayscale.
- Imported the refreshed draft in the browser and re-exported the Entrance Hall atlas; all 324 PNG cuts remain 50 × 25 RGBA with transparent corners. Inspected the gallery with the exact overlay enabled.

## Detailed connected-panel update

- Rebuilt the four illustrations as a single continuous scene cropped into a 2 × 2, 16-inch assembly. All four panels now share level 1, with four reciprocal passage pairs; stairs and pits use engine-governed destinations.
- Added arches, a raised gate, a broken portal, skull shelves, cobwebs, bones, rubble, urns, crates, barrels, engraved tombs, a fallen column and explicit large-object footprints.
- All 17 JavaScript tests pass. New tests measure every physical edge opening, reject undeclared openings, check the eight reciprocal endpoints against global grid coordinates, and verify all 953 walkable/item cells are connected around objects and pits.
- Compared each 800-pixel panel render against its corresponding assembly crop: only 5–26 raster antialias pixels differ per panel (maximum 7/255 intensity), with exact vector ground geometry unchanged by cropping. Every print image is 2400 × 2400 and strictly grayscale.
- Browser checks: assembled grid/seam toggles, connected draft import, selected passage destinations, and refreshed export of all 359 Entrance Hall diamonds. Every crop is 50 × 25 RGBA with transparent corners.
- The 56-file engine snapshot remains unchanged. The new samples are authoring fixtures; they are not loaded into gameplay.

## Workshop overview and level stack

- Added Panel / Level map / Level stack views, per-level navigation, clickable panel selection, editor handoff, zoom/pan/fit, boundary/link overlays and a destination list.
- All 21 JavaScript tests pass. Overview tests cover reciprocal passage deduplication, actual seam positions, placement offsets, negative assembly coordinates, common stacked origins, directed stair/pit links, game-controlled destinations, missing targets, empty drafts, sparse level numbers and nonmutation of imported data.
- Added an importable six-panel fixture across the surface and three dungeon levels, reusing sample art to exercise navigation topology.
- Browser checked: empty stack, multi-level import, stacked arrows, per-level selection, zoom and fit, selecting a panel from the SVG and opening its editor, plus keyboard pan/zoom/reset. The four-panel map's downloaded draft matches the source JSON exactly after view interactions.
- Release/debug builds, formatting, HTTP smoke (including the new module route), and engine-hash checks pass. The active adventure was resumed after server restart with identical game state and unchanged save-file hashes. The older open workshop draft was exported before updating the app.

## Workshop draft play-test

- All 28 JavaScript tests pass. The runner reaches all 953 walkable world cells of the four-panel fixture and crosses all four seams in both directions. Tests cover blocking, item-cell traversal, placement, restart, unlinked/offset seams, stairs to and from the surface and lower floors, one-way pits, unsafe landings, missing destinations, game-controlled transport and unchanged source drafts.
- Browser checked: empty draft, stacked import, player display, keyboard and click movement, stair descent/return, automatic pit drop, manual placement and zoom.
- Debug/release builds, HTTP smoke (including the play-test module) and the 56-file engine hash verification pass.

## Dungeon library

- Added independent named dungeons with local disk persistence, autosave, safe switching, separate copies and portable imports/exports. Empty HE8 drafts are supported.
- 32 JavaScript tests cover draft geometry and traversal plus autosave edits during an in-flight write, failed/stale saves, copy recovery and save-before-switch ordering.
- Rust storage tests cover independent projects, restart, revisions, invalid paths/envelopes and preservation of unreadable files. HTTP smoke saves/reopens a six-panel stack, creates an empty dungeon, checks conflicts and same-origin enforcement, restarts the server, and verifies that workshop operations leave adventure state unchanged.
- Browser checked: create and name two dungeons, import six stacked panels, add two scanned panels to the other dungeon, link reciprocal passages, save/reload and restore those links, switch back, and traverse the saved stairs. Importing a portable dungeon creates a third independent project with identical panel data, preserving both existing dungeons. The main server update preserved adventure state and all character-save hashes.

## Panel feature editing

- Added a visible feature toolbar with placement and selection modes, an outlined selected diamond, a feature-list shortcut, type editing, relocation and removal. Edits autosave with the dungeon.
- All 37 JavaScript tests pass. Feature tests verify stable IDs and links when moving, selective cleanup on type changes, incoming pit cleanup when deleting a landing, rejection of invalid/duplicate edits, and unchanged artwork/cell tags.
- Browser checked: add a pit, select it, change its type, move an existing linked stair to a different diamond, remove the added feature, delete a landing and save. The saved JSON confirms the moved coordinates, preserved stair link, cleared incoming pit, and byte-identical artwork and cell annotations.
- Release/debug builds, HTTP smoke and the frozen-engine hash check pass.

## Limits

These checks establish the new interface’s integration with the current engine; they do not establish complete equivalence with the original DOS executable. The existing engine’s [fidelity notes](../vendor/dnd/docs/FIDELITY.md) still apply.

The workshop was tested with synthetic fixtures. No production Claybord scan has been calibrated or classified, and no physical printer output has been measured. The fixed HE8 template guarantees digital seam alignment; real board/print/scan tolerances still need checking. It exports reviewed draft metadata and preview images and supports a temporary layout walkthrough. Full custom-world adventure rules, ink classification, production sprite artwork, depth occlusion, and full-resolution asset handling remain on the roadmap.

Windows and Linux graphical play have not been manually checked. The launcher is a macOS `.command`; CLI startup works wherever the Rust dependencies compile and a browser can reach the loopback server. CI uses Linux and pins Rust 1.95.0 to match local validation. The initial run with Rust 1.98 passed all Rust tests but introduced a new Clippy style lint in the frozen engine; the engine was kept unchanged.
