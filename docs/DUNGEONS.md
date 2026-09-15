# Build and save multiple dungeons

Open **Panel workshop → Your dungeons**.

1. Choose **New dungeon** and enter a **Dungeon name**. An empty dungeon is valid. Each dungeon has a separate identity, so names and panel IDs can be reused across dungeons.
2. Use **Add scanned panel** in Panel view, or **Import panel draft** to add an existing panel set to the active dungeon. Imports preserve the existing panels; duplicate IDs or occupied slots within that dungeon are rejected. The current limits are 16 panels and 40 MB per dungeon, with 8 MB per uploaded scan.
3. Set each panel’s **Dungeon level** and **Assembly X/Y**. Choose **Add connector**, click a passage endpoint on each panel, and select its destination. Same-level links become reciprocal. Use **Panel features → Feature type → Add feature**, then click a diamond to place stairs or a pit. The **Feature list** lets you move features, change their types/destinations or remove them.
4. Use **Level map** to check adjoining panels, **Level stack** to inspect floors, and **Play-test draft** to walk the reviewed cells and fixed routes.
5. Choose another entry under **Saved dungeons**, then **Open dungeon**. The workshop saves pending edits before switching. A failed save or invalid incoming project leaves the current editor intact.

## Saving and copies

Edits autosave after a short pause. **Save dungeon** saves immediately. Wait for **Saved locally** before closing. Reopening the same browser tab restores its most recently opened dungeon; another tab can use the saved-dungeon picker independently. **Refresh list** discovers dungeons created in other tabs.

The local Rust server stores each dungeon in `saves/dungeons/dungeon-<id>.json`. When launched with `--saves PATH`, the library is in `PATH/dungeons/`. Artwork previews and navigation metadata live together in each file. Writes use a temporary file and atomic replacement; the library checks the saved revision before overwriting. An older tab cannot silently replace newer edits. **Save as new dungeon** keeps its local work as a separate copy if there is a conflict.

**Export dungeon** produces a portable JSON backup containing its name and draft. **Import dungeon** accepts this format or an existing panel-draft JSON file and always creates a new local dungeon. Exported IDs never overwrite a local project. **Import panel draft** instead adds panels to the current dungeon. An old in-memory workshop tab still needs to export its draft once; import that file into the library using the updated app.

Dungeon export format: `heavy-earth-dungeon`, version `1`, with `name` and `draft`. The draft uses `heavy-earth-panel-draft`, version `3`, and the fixed HE8 projection. Empty panel arrays are supported. Server files also include a stable `id`, revision, and creation/update timestamps in Unix milliseconds. The source scans remain separate; the stored art is the normalized 800 × 800 preview.

## Scope

Library persistence saves authored dungeons, not adventure progress. Play-test movement does not edit the saved dungeon. The original Rust engine, character saves, and gameplay rules remain separate. Full custom-world adventures, project deletion, panel replacement/removal, undo, larger projects and high-resolution asset storage remain future work.
