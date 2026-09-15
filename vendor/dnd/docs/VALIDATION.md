# Validation record

2026-09-15, macOS arm64, Rust 1.95.0.

| Check | Result |
| --- | --- |
| `cargo fmt --check` | Passed |
| `cargo clippy --all-targets -- -D warnings` | Passed without warnings |
| `cargo test` | 54 tests passed: 26 game/simulation, 1 CLI, 6 core oracle, 1 complete-spell, 4 lifecycle, 4 room, 2 import/migration, 8 map-rendering, 2 visibility oracle |
| `cargo build --release` | Passed; native macOS arm64 executable |
| `python3 scripts/verify_maps.py` | All 80,000 north/west edges match 100 printed DOS maps |
| Map rendering | Purchased-chart boundaries match the original printed Telengard map. Current views ignore exploration memory, follow movement, hide remote levels, react to light expiry, block sight at walls/doors, and preserve stable redraws. The exploration journal accumulates separately across movement, darkness, levels and town visits, hides unknown room contents, updates cleared features, and keeps each dungeon separate. Old exploration memory and purchased maps survive migration. |
| Visibility oracle | 260 original clipping cases and 168 light-recognition cases, including zero light, the 50/51 threshold, and continual light |
| Core original-routine comparisons | 800 captured cases; numerical results and final RNG state match |
| Complete spell captures | 1,368 non-movement casts, 24 Teleport casts and 16 Pass Wall casts cover all 40 spell names |
| Reincarnation | 216 original instruction-block cases, including level-one and exhausted-constitution cases |
| Recovery | 72 original sequences × 160 ticks = 11,520 compared transitions; native save/resume after tick 80 in each sequence |
| Rooms | 936 complete fountain outcomes, 936 hazard routines, 624 pit checks, 312 djinn relocation loops |
| DOS import | Original-writer fixture, selection, field mapping, continual-light flag, secret omission, source preservation, malformed files, overwrite refusal |
| Compatibility | Version-one RNG migration; missing recovery/light fields; legacy permanent-light sentinel migration |
| Release smoke | Create, enter, cast, wait, map, return to town, save, resume and quit in plain mode |
| Interactive PTY (initial build) | Character creation, map/status, clerical spell, save/quit and terminal restoration checked in the earlier build |

The engine suite includes 200 seeded simulations across five dungeons, each bounded to 300 actions or character death. It exercises all 40 spells, original Orb coordinates, surface exits, equipment, secrets, effect/combat state continuity, permanent death, and deterministic save/resume. New regressions ensure held monsters recover only on damage and fatal spells/traps cannot resume their old encounter after reincarnation.

The victory test places the character at the Orb and entrance to exercise those transitions. It is not a complete human expedition. The original-executable comparisons cover representative routine inputs and sequential recovery; they do not establish full DOS input-trace equivalence. Encounter scheduling, several special rooms, treasure, persistent spell-capacity bonuses, fighter wands and high-score/retirement behavior remain as described in [FIDELITY.md](FIDELITY.md).
