# DND in Rust

A playable native terminal recreation of Bill Knight's DOS **DND v1.2:1**, informed by Daniel Lawrence's BASIC source. Explore the **five original dungeons and all 100 levels**, fight monsters, cast spells, find treasure, and return with the Orb of Zot.

**This is a source-informed recreation, not yet an exact DOS port.** Dungeon bytes are original and verified. Random, character, combat, spell, recovery, reincarnation and several room rules are checked against captured DOS execution. Encounter scheduling and several special rooms still need work. See [fidelity notes](docs/FIDELITY.md).

## Play

Requires a current stable Rust toolchain (developed and tested with Rust 1.95 on macOS).

```sh
cargo run --release
```

On macOS, you can also double-click `Play DND.command` in Finder.

Choose a name, class, and dungeon. Review the rolled attributes; press **R** to reroll or **Enter** to accept. The game begins in town; **Enter** starts an expedition. **Telengard** is the default.

To choose everything on the command line:

```sh
cargo run --release -- --new --name Damon --class cleric --dungeon telengard
cargo run --release -- --resume --name Damon
```

The compiled game is `target/release/dnd-rs`. Dungeon data is embedded; it needs no DOS emulator, BASIC interpreter, network connection, or external data files at runtime.

Use a terminal at least **78 columns × 24 rows**. For a scrolling interface, accessibility tools, or scripts:

```sh
cargo run --release -- --plain --new --name Explorer --class fighter --seed 42
```

The default save is `saves/NAME.json` in the current directory. Use `--save /path/to/adventure.json` to choose a stable location. `--new` refuses to overwrite an existing save. `--resume --save PATH` loads it. Character names are sanitized for default filenames, so use explicit paths if two names produce the same filename.

## Import an original DOS character

```sh
cargo run --release -- --import-dos /path/to/PLAYERS.DAT --name "DOS Hero" --save saves/imported-hero.json
```

The importer reads v1.2:1 records and creates a separate save. If the file contains several characters, `--name` selects one; omitting it lists the available names in the error message. Existing saves are never overwritten. The DOS file is unchanged, and secret names are omitted. Character progress and position are preserved; room populations, exploration memory and RNG start fresh. DOS wand holders are rejected until their tiered charges can be represented faithfully. Older DOS file formats are unsupported.

New games use the original DOS random generator. `--seed` uses the low 32 bits; zero becomes one. Existing version-1 Rust saves retain their previous random stream, with the corrected game rules, and migrate to JSON version 2 when saved.

## Controls

| Action | Keys |
| --- | --- |
| Move | Arrow keys or **W** north, **A** west, **X** south, **D** east |
| Wait | **S** or keypad **5** |
| Stairs | **U / 9** up; **3** down |
| Fight / evade | **F / 1** fight; **E / 7** evade |
| Cast | **C**, then enter tier and spell number |
| Take treasure | **Enter / Y** |
| Ignore encounter | **I / Delete** |
| Search for secret doors | **R** while exploring |
| Interact with current room | **I** while exploring |
| Spellbook / help / map | **B / H / M** |
| Full command | **:** |
| Save / save and quit | **F5 / Q**; Ctrl-C also saves |

Examples of full commands (or one command per line in `--plain` mode):

```text
enter
north
cast 1 3
cast 3 3 east
drink
give 100
pry
rg
buy ring 1
travel lamorte
map 2
quit
```

`rg` tries red then green at a treasure trove. Choices on the prompt apply to the current room. At a transporter, enter a destination level. Press **H** for the complete command reference. Spells validate their targets and charges before spending a slot. Fighters need a magic wand.

## Staying alive

Stay near the entrance until you have gained experience and equipment. **Escaping banks your carried gold, awards treasure experience, and restores health and spells.** The store uses banked gold and is available between expeditions. Combat experience is immediate; treasure experience is paid on returning to town.

Exploration advances recovery: it periodically restores health and one missing spell charge, starting with the lowest tier. A ring heals on each exploration turn. Combat does not age exploration effects; damaging a held opponent weakens the hold. Search and waiting also risk encounters. The live map shows only your current surroundings; walls and doors block sight. Light helps identify nearby contents (shown as `???` when indistinct), and brighter light improves recognition. Rooms outside current sight disappear from gameplay. Press **M** to consult your cumulative explored map, updated automatically and retained in saves. Use `map LEVEL` to consult explored or purchased maps on other levels; purchased maps reveal a full level. An Orb disables elevators and the Excelsior Transporter; magic can still help you return. Bring the Orb to the surface to win and gain immortality. You can continue afterward. Reincarnation costs one Constitution point, roughly half your levels, equipment and carried gold; banked gold survives. It returns you to a random dungeon location. At zero Constitution, immortality ends.

Mortal death is permanent for that character. The game saves after each submitted action, including death. Saves preserve active combat, treasure choices, RNG state, explored rooms, spell durations, and spent troves. Invalid saves are rejected without replacing them.

The Warren and Cavern retain the unfinished layouts of the DOS release. Some deep areas require teleportation. The game does not silently replace them with newly generated levels.

## Development and verification

```sh
cargo test
cargo clippy --all-targets -- -D warnings
cargo fmt --check
cargo build --release
python3 scripts/verify_maps.py
```

The map check uses the original printed map files under `reference/maps`, separate from the implementation. It verifies **80,000 stored walls against all 100 printed maps**. The 54 tests include original-executable comparisons for 800 core cases, 1,408 spell casts across all 40 spells, 216 reincarnations, 11,520 consecutive recovery ticks, 936 fountains, 936 hazards, 624 pit checks 312 djinn relocations, and 428 visibility/light cases. They also check dungeon landmarks and exits, state continuity, spells, level progression, equipment, secret doors, the Orb return, permanent death, save validation and reproducible simulated playthroughs. Tests are not evidence of complete DOS behavioral equivalence.

| File | Responsibility |
| --- | --- |
| `src/world.rs` | Original map decoder, room types, walls, coordinates |
| `src/player.rs` | Character attributes, experience, equipment, spell slots |
| `src/engine.rs` | State machine, encounters, treasure, town |
| `src/combat.rs` | DOS attack and evasion calculations |
| `src/spells.rs`, `src/spell_effects.rs` | Spellbook, validation, movement and effects for all 40 spells |
| `src/room_effects.rs` | Recovered fountains, pits, hazard damage and djinn movement |
| `src/rng.rs` | DOS random stream and legacy save compatibility |
| `src/save.rs` | Versioned, validated, atomic JSON persistence |
| `src/dos_save.rs` | Read-only original character-file import |
| `src/ui.rs`, `src/visibility.rs` | Terminal UI, current visibility, cumulative exploration maps, purchased maps, help and line mode |
| `tests/game.rs` | Integration and simulation tests |
| `tests/dos_oracle.rs`, `tests/dos_spells.rs`, `tests/dos_lifecycle.rs`, `tests/dos_rooms.rs` | Comparisons against original x86 execution, including recovery across save/resume |

Original downloads and BASIC source are retained locally in the ignored `reference/` directory. See [reverse-engineering notes](docs/REVERSE_ENGINEERING.md) for provenance and [third-party notices](THIRD_PARTY.md) for attribution. No changes were made to the upstream repository.
