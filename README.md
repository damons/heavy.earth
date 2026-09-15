# HEAVY.EARTH

**The old dungeons, seen from a new angle.** A playable, black-and-white isometric front end to the existing Rust DND recreation, with a first workshop for scanned dungeon art.

## Play

Requires stable Rust with edition 2024 support (tested with Rust 1.95). No Node, emulator, account, or JavaScript package installation is needed to play.

```sh
cargo run --release -- --open
```

On macOS, double-click **`Play Heavy Earth.command`**. Or run `cargo run --release` and open **http://127.0.0.1:7878** in your browser. First compilation downloads Rust dependencies; subsequent play works offline. Stop the local server with Ctrl-C. Closing its browser tab does not stop the server.

Create a fighter, cleric, or magician; select one of the five original dungeons; roll and accept attributes. New adventures begin in town. All 100 original levels are present.

### Controls

| Action | Control |
| --- | --- |
| North / east / south / west | W / D / X / A, or arrow keys |
| Isometric directions | North ↗, east ↘, south ↙, west ↖ |
| Move one square | Click an adjacent visible floor tile |
| Camera | Drag to pan, scroll or +/− to zoom, Center to recenter |
| Wait / search / interact | S / R / I |
| Up / down | U or 9 / 3 |
| Fight / evade | F / E |
| Cast / spellbook | C / B |
| Explored map | M; choose a level to consult another journal/chart |
| Help / full command | H / : |
| Save / save and return to title | F5 / Q |

Context buttons cover encounters, treasure, stairs, altars, fountains, thrones, troves, and transporters. The original command vocabulary remains available: `cast 1 6`, `give 100`, `buy ring 1`, `travel lamorte`, `map 2`. The outfitter uses the original prices and banked gold. Color words in fountain and trove rules are retained as text; all graphics are grayscale.

Movement is instantaneous. Camera motion and redraws do not advance time or consume random numbers. The **live view** follows the existing sight/light rules; the **explored map** is a separate persistent journal. Darkness is intentionally restrictive. Looking at a chart does not reveal more of the live dungeon.

### Saves and separation

Heavy Earth saves each submitted action into this checkout’s **`saves/`** directory. It lists those adventures on the title screen. A new character gets a distinct filename, including when a name is reused. Failed disk writes do not commit the action in memory. Stale commands from another tab are rejected.

```sh
cargo run --release -- --port 7879 --saves /absolute/path/to/heavy-earth-saves
```

The browser connects to a local Rust server bound to `127.0.0.1`. One server owns one active adventure; multiple tabs share that active character. Stop and restart the launcher, then select the saved adventure to resume.

DND’s original checkout and saves are unchanged. To bring an existing Rust character over, **copy** its JSON file into Heavy Earth’s `saves/` folder under a unique filename containing only letters, digits, hyphens, and underscores. Do not point both games at the same live save file. The save format remains DND version 2, with the existing version-1 migration.

## Panel workshop — prototype

The **Panel workshop** tab is the beginning of the hand-drawn map pipeline:

1. Add a square PNG, JPEG, or WebP scan, up to 8 MB.
2. Use an **8 × 8 inch** board with its marked **TOP up**.
3. Draw from the shared HE8 template: **½ × ¼ inch diamonds, exact 2:1 slope, top-left origin**. Crop the scan to the board edges and compare it to the fixed overlay.
4. Preview a black/white threshold and inspect sampled pixels.
5. Mark reviewed cells as walkable or blocked.
6. Add passage endpoints, choose their directions, and link them between panels. Links are reciprocal.
7. Record each panel’s assembly coordinates and export a JSON draft; import it to continue later.

Try [the synthetic two-panel draft](examples/two-panel-draft.json) using **Import panel draft**, or the [synthetic scan](game/tests/fixtures/panel-scan.png) using **Add scanned panel**. These are calibration fixtures, not hand-drawn art or playable dungeon maps.

For richer scan tests, try the [four original ink dungeon panels](examples/ink-panels/README.md): entrance hall, shrine, cistern, and ossuary. The pack includes PNGs and an importable draft. These AI-generated drawings require grid alignment review; they are not exact calibration fixtures or playable maps.

The workshop works locally in the browser and sends no artwork to the Rust server. It exports 800 × 800 grayscale preview images inside the draft. **Keep original high-resolution scans separately.** Drafts are not autosaved; export before closing. Imports merge into the current workshop and reject duplicate IDs.

**Custom panels are not playable yet.** Thresholding is a preview, not an automatic navigation classifier. Grid lines, hatching, shadows, and furniture must be distinguished from solid earth before maps enter gameplay. Every conforming HE8 panel’s grid matches any other panel on all four sides. Actual scan alignment still needs review. Earlier version-1 drafts and drafts using 1-inch diamonds are rejected rather than silently reinterpreted.

Print the [measured 8-inch template](output/pdf/heavy-earth-8x8-template.pdf) at Actual Size / 100%, or use the [8-inch SVG](game/web/panel-grid.svg). Its second PDF page demonstrates horizontal and vertical seams. Mark TOP on each board.

See the [roadmap](docs/ROADMAP.md) and [panel format / art specification](docs/PANELS.md).

## Architecture

| Location | Responsibility |
| --- | --- |
| `game/src/` | Local HTTP server, save/session transactions, visibility-safe presentation adapter |
| `game/web/grid.js` | Shared game/panel/print projection and fixed HE8 physical dimensions |
| `game/web/renderer.js` | Canvas projection, picking, grayscale geometry, sprite registration seam |
| `game/web/app.js` | Character creation, controls, context actions, spellbook, journal |
| `game/web/panels.js` | Scan calibration, reviewed cells, passage links, draft import/export |
| `vendor/dnd/` | **Unmodified** snapshot of the existing DND Rust repository |
| `vendor/dnd-provenance.json` | Source commit and SHA-256 hashes for all 56 snapshot files |
| `doc/`, `public/`, `Heavy.Earth/` | Preserved original Heavy Earth art and website concept |

Rules, encounter scheduling, random state, original dungeon bytes, and persistence come directly from `dnd-rs`. This is a new renderer for the **current recreation**, with the same [known fidelity limitations](vendor/dnd/docs/FIDELITY.md). It is not a claim of exact equivalence to every DOS behavior.

The graphical fixtures and character are geometric placeholders. Sprite artwork can replace them through a registry with ground-contact anchors. The renderer uses the same exact **2:1 dimetric projection** as the physical panels, no walking animation, and grayscale only.

## Verify

```sh
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
cargo build --release
python3 scripts/verify_engine.py
cargo build
python3 scripts/smoke_http.py
npm test  # optional development check; Node 22+, no npm install required
```

The workspace runs 54 original tests and 5 adapter tests. Node checks projection/picking, arbitrary panel placement, printable grid seams, and panel draft integrity. HTTP smoke tests use disposable saves, including a full server restart. [Validation notes](docs/VALIDATION.md) record browser checks and limits.

CI pins Rust 1.95.0, the engine snapshot’s tested toolchain, so new Clippy lints do not force edits to the frozen source.

Cargo reports an ignored profile in the vendored manifest: the workspace applies the same release profile, and the original file is retained byte-for-byte for provenance.

## Origins and attribution

Heavy Earth is Damon’s long-standing idea for an isometric dungeon crawler using pen-and-ink and scratch-art panels. The original art and design archive remains under `doc/`; its existing `HeavyIcon.png` supplies the interface mark. [Ampersand Claybord](https://ampersandart.com/tools-accessories/claybord) is the physical-art reference, not a software dependency or sponsor.

DND source snapshot: [`damons/dnd` at a2032b8](https://github.com/damons/dnd/commit/a2032b8ff153e2bd15e52d9d28a1af922c2a9367). Original dungeon data and source attribution: [third-party notices](vendor/dnd/THIRD_PARTY.md). See [architecture](docs/ARCHITECTURE.md) before updating the rules snapshot.
