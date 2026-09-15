# Engine and presentation boundaries

## Repository boundary

The original DND checkout remains the parent directory, with remote `damons/dnd`. This independent nested Git checkout has remote `damons/heavy.earth`. No Rust source, map, save, or Cargo configuration in the parent checkout is changed. The old Heavy Earth website directories and design archive are also preserved.

The Heavy Earth workspace pins a complete source snapshot of DND commit `a2032b8ff153e2bd15e52d9d28a1af922c2a9367` in `vendor/dnd/`. The snapshot compiles as the `dnd-rs` dependency. Its files are byte-for-byte originals, not a second independently maintained implementation. `scripts/verify_engine.py` checks all 56 files against the committed SHA-256 manifest.

To update the engine intentionally: select and review a new DND commit, replace the snapshot from that Git tree, regenerate the manifest with the new commit, run all original and adapter tests, and explain rule changes in the update. Do not patch vendored rules incidentally while changing graphics.

## Turn boundary

```
Browser input → command + state revision → Session
             → clone Game → Game::command (unchanged DND)
             → validated atomic save → publish updated Game
             → filtered view snapshot → Canvas redraw
```

Failed saves leave the previous in-memory state and revision intact. GET views do not mutate state. Each accepted POST command increments the presentation revision, including commands that the engine rejects without spending a turn. This rejects commands based on an older active adventure in another tab. Network failures are not automatically retried because a submitted turn may already have committed; the UI reloads the current state.

The server binds IPv4 loopback, serves an explicit asset allowlist, validates Host/Origin, and requires a non-simple custom header and JSON for mutations. It is a local single-player service, not a public multiplayer server. No browser receives a raw `Game`, save file, RNG state, unseen population data, or unfiltered world maps.

## Visibility boundary

`view::live_map` reproduces the existing terminal view’s row-major visibility traversal. It calls the same clipping and feature recognition helpers against a copied RNG. Secret edges appear as ordinary walls until discovered. Town has no live dungeon cells.

`view::journal` exposes only visited cells or a purchased level chart, using the original feature/secret memory rules. The UI labels this separately and does not allow movement by clicking a journal cell. Rendering never calls `Game::reveal`, `tick`, or mutates exploration memory.

## Renderer boundary

The canvas projects integer map coordinates into 2:1 dimetric diamonds. `game/web/grid.js` is shared by rendering, panel authoring and the printable asset generator; its exact rational slope also guarantees identical 8-inch templates meet at every horizontal/vertical seam. It draws raised floors, walls, doors, geometric fixtures, and player/encounter tokens in grayscale. Projection inversion supports one-square pointer movement; arbitrary click-to-path movement is not implemented. The engine decides whether a submitted cardinal step is legal.

Drawing uses deterministic texture formulas independent of gameplay RNG. There is no animation loop. Redraws occur on state changes, resize, pan/zoom, and pointer feedback. Current fixtures are geometric placeholders. `registerSprite(key, image, anchor)` provides a replacement point for loaded grayscale PNG sprites with a ground-contact anchor. A production asset loader and unique monster artwork are future work.

## Custom worlds

Panel draft version 2 enforces the HE8 physical standard and rejects legacy 30° version-1 drafts and earlier 1-inch-diamond drafts without changing their files or annotations. Grid alignment is independent of connection placement. Original game save coordinates do not change.

The current engine addresses hardcoded original `Dungeon` data and 20 × 20 × 20 coordinates. Panel metadata cannot simply be attached to it to make arbitrary maps playable. The next stage needs a deliberate map-provider abstraction, stable room IDs, custom-world state, connector transitions, and versioned saves. Keep the legacy provider’s behavior covered by original oracle tests while introducing that extension separately.
