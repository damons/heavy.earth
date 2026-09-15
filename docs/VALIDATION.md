# Validation — 2026-09-15

## Automated checks

- `cargo test --workspace`: **59 passing tests** — all 54 original DND tests plus 5 Heavy Earth adapter/session tests.
- Adapter coverage: 240 dungeon/position/light combinations; stable render snapshots and unchanged RNG; hidden secret-door masking; separate live/journal visibility; direct-engine command and save equivalence; resume; failed-save rollback; stale revision rejection; distinct new-character saves and invalid save IDs.
- `cargo clippy --workspace --all-targets -- -D warnings`: passed.
- `cargo fmt --all --check`: passed.
- `cargo build --release --locked`: passed on macOS with Rust 1.95.
- `npm test`: **7 passing tests** — 6,400 projection/inverse tile-picking checks, 625 arbitrary board positions, panel permutations, exact SVG seam crossings on all four edges, fixed-standard/legacy rejection, reciprocal links, malformed drafts, and the HE8 example project.
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
- The running adventure was restored after the build update; its save file remained byte-for-byte unchanged.
- No browser warnings/errors were reported during the gameplay checks.

## Limits

These checks establish the new interface’s integration with the current engine; they do not establish complete equivalence with the original DOS executable. The existing engine’s [fidelity notes](../vendor/dnd/docs/FIDELITY.md) still apply.

The workshop was tested with synthetic fixtures. No production Claybord scan has been calibrated or classified, and no physical printer output has been measured. The fixed HE8 template guarantees digital seam alignment; real board/print/scan tolerances still need checking. It exports reviewed draft metadata and preview images, not playable custom levels. Ink classification, edge-level navigation, physical panel assembly, cross-panel gameplay, production sprite artwork, and full-resolution asset handling remain on the roadmap.

Windows and Linux graphical play have not been manually checked. The launcher is a macOS `.command`; CLI startup works wherever the Rust dependencies compile and a browser can reach the loopback server. CI uses Linux and pins Rust 1.95.0 to match local validation. The initial run with Rust 1.98 passed all Rust tests but introduced a new Clippy style lint in the frozen engine; the engine was kept unchanged.
