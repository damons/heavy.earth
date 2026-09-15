# Reverse-engineering notebook

Inspected 2026-09-14. Target: Bill Knight / R O Software DND v1.2:1, 1987-02-22.

## Sources

- DOS archive: https://www.classicdosgames.com/files/games/ro/dnd_121.zip
- Printed maps: https://www.classicdosgames.com/files/extras/ro/dnd_maps.zip
- Game page: https://www.classicdosgames.com/game/DND.html
- Related BASIC: https://github.com/monadicus/dnd/tree/main/dist
- BASIC checkout inspected: `bf3fb05bcb8c2bbb25b19e1ffd7d427279decaca`
- Additional DOS reference: https://www.classicdosgames.com/shrines/DND.html

The BASIC identifies Daniel Lawrence's version 3.0 dated 1978-06-07, with VAX adaptations and subsequent changes. It is not the exact Pascal source of the DOS edition. The repository's existing `rust/` is a small prototype; this implementation was built separately, using the BASIC source as a rules reference.

## Dungeon format

Each `.BIN` is exactly 8,000 bytes: 20 floors × 20 rows × 20 columns. No header. Offsets use zero-based coordinates:

```text
offset = floor * 400 + row * 20 + column
bits 0..1 : west edge
bits 2..3 : north edge
bits 4..7 : permanent room type
```

Edges: `0` open, `1` wall, `2` door, `3` secret door. East and south edges are the neighboring room's west and north edges. The right and bottom dungeon boundary are implicit walls. On the top floor, an open west/north boundary leads outside.

The same low-nibble layout appears in BASIC `FNI` (`newdgn.bas`, BASIC lines 340–370). BASIC packs adjacent bytes into 16-bit virtual-array values; DOS files already have one room per byte in row-major order. No byte swapping is needed in the DOS reader.

The printed map files have a two-line heading, six text columns per cell and four text rows per cell. Sampling `(4*row,6*column+3)` obtains the north wall and `(4*row+2,6*column)` the west wall. Character alphabets are `" I-."` north and `" I :"` west. `scripts/verify_maps.py` independently compares all 80,000 edges. All match.

## DOS room table

Recovered with `strings -t d reference/dos/DND.EXE`. At decimal file offsets 110392–110482 the executable has a sequence of five-character display strings, six bytes apart (a Pascal short-string length byte precedes each):

| ID | Display | Meaning |
| --- | --- | --- |
| 0 | blank | ordinary room |
| 1 | `\` | stairs down |
| 2 | `/` | stairs up |
| 3 | `\ /` | stairs both ways |
| 4 | EXC | Excelsior transporter |
| 5 | PIT | pit |
| 6 | TPT | teleporter |
| 7 | FNT | fountain |
| 8 | ALT | altar |
| 9 | DGN | dragon lair |
| 10 | ORB | Orb |
| 11 | MIR | mirror |
| 12 | ELV | elevator |
| 13 | THR | throne |
| 14 | TRV | treasure trove |
| 15 | GNI | djinn |

This table corrects three misleading inherited BASIC meanings: dragon-with-Orb, unguarded Orb, and solid rock. Treating high-nibble 15 as rock would misinterpret thousands of rooms in the unfinished DOS dungeons.

## Orb landmarks

One ID-10 room exists in each file. Coordinates below are one-based (level, row, column), independent of UI coordinate display (column,row).

| Dungeon | Orb |
| --- | --- |
| Telengard | 19, 20, 1 |
| Shvenk's Lair | 20, 13, 18 |
| Lamorte | 20, 16, 9 |
| The Warren | 20, 19, 1 |
| The Cavern | 20, 14, 16 |

Entrances are recovered from `0428:0005` in the unpacked executable. One-based (column,row): Telengard (1,15), Shvenk (5,5), Lamorte (1,18), Warren (12,11), Cavern (5,15). The previous Warren choice (13,1) was incorrect.

## Binary hashes (SHA-256)

```text
CAVERN.BIN   e327a0961b2cc641a7df728321d60430738c8bb888ec217325ecfcfdb409e412
LAMORTE.BIN  792660ff76318bba12f0bad5e15b514f117f927eaa6611a3be99e58267225e7e
SHVENK.BIN   ab4408a93c7cfae21abab585821dd03740ed2ed997d334f3a6f51b71db82127d
TELENARD.BIN b090d45d4c6cab1ee40e71abaffc2fa669662afc87f036d1f44cb0a96cef1973
WARREN.BIN   11ddb7e4df444b106f0fba4258ec5ff4e06cee28b881652a96e328f68098ad6d
```

## Historical BASIC reference anchors

Numbers here are BASIC line labels, not physical file lines.

- `NEWDND` 1430: attribute dice; 1495–1506: initial HP, CON bonus, slots.
- `NEWDGN` 600–610: XP curve; 20600–20730: level gain/loss and spell progression.
- `NEWDGN` 245–285: room population; 3020: wandering encounters; 12000: escape accounting.
- `NEWCBT` 4760–4870: player attack; 5000–5260: monster attack; 4660: evade check; 6920: XP award.
- `NEWTRS` 7010–7115: treasure distribution and treasure XP; 7500–7770: magic items.
- `NEWSPC` 8100–9295: special rooms. DOS meanings and spell descriptions override BASIC where explicitly recovered.
- DOS strings 110806 onwards: store prices (armor 5,000, book 3,000/level, boots 7,000, cloak 5,000, ring 10,000, shield 8,000, weapon 7,500, maps 50,000/level).

The initial online observation of CHA 3 is explained by DOS's scaled `3d6` routine. Attributes can be 3, 6, 9, 12, 15 or 18; whole sets totaling less than 72 are rejected. The BASIC formula is no longer used.

## Executable oracle

The EXEPACK-compressed MZ was unpacked with David Fifield's `exepack` 1.4.0, built from https://github.com/viiri/exepack. The original and unpacked binary hashes are recorded in `tests/fixtures/dos-routines.json`.

The load image begins at file offset `0x3000`. The Pascal data segment is load-relative `1328`; the player record starts at `DS:4c50`, the monster at `DS:4d50`, and the global RNG state at `DS:a530`. Addresses below are load-relative segment:offset, before MZ relocation.

| Routine | Address |
| --- | --- |
| Random integer / float | `116d:0046` / `116d:0000` |
| Scaled dice / percent | `0f9f:0106` / `0f9f:013c` |
| Attribute generation | `00e0:00e6–012e` |
| Initial class/level/HP | `00e0:01df–0212` |
| Experience threshold | `0f9f:0773` |
| Spell capacity | `0f9f:085d` |
| Level gain/loss | `0f9f:09e0` |
| Player weapon attack | `097c:0298–04fb` |
| Monster weapon attack | `097c:0a81–0d3a` |
| Monster generation | `097c:0821–095e` |
| Evasion | `097c:0624–06b2` |
| Cleric duration / resistance | `060d:000d` / `060d:005e` |
| Magician duration / resistance | `07c9:0009` / `07c9:005a` |
| Complete cleric / magician casts | `060d:010c` / `07c9:03f4` |
| Teleport / Pass Wall | `0e78:0001` / `07c9:0125`, `07c9:01d5` |
| Exploration tick / reincarnation | `0139:042e–0508` / `0139:0982–0cdf` |
| Fountain / pit avoidance | `02d4:000f` / `0343:076d–07ce` |
| Hazard damage / djinn | `0139:02f8` / `0139:0005` |
| Local wall/room clipping | `0a9f:0636–07f8` |
| Room-content recognition | `0a9f:000e–0083` |
| File reader / writer | `0217:00c1` / `0217:0161` |

The RNG shifts eight times per draw, feeding back bit 31 XOR bit 28. Integer output is the low 15 bits; floating output is the low 23 bits divided by 2^23. The original dice routine consumes a single integer and returns `N × (1 + value % sides)`. It does not sum independent dice.

`oracle.py` loads and relocates the original executable into a 16-bit Unicorn guest. The guest has no filesystem access. Whole numerical routines run through their far returns. Larger routines use bounded instruction ranges with documented input stack frames; attack display branches are skipped without changing RNG or arithmetic. DOS interrupts raise an error. The fixture generator never calculates expected game results in Python.

### Reproduce captures

Keep the original executable in `reference/dos/DND.EXE` and decompress a copy to `reference/dos/DND-unpacked.EXE`. Then:

```sh
python3 -m venv /tmp/dnd-research-env
/tmp/dnd-research-env/bin/pip install -r scripts/research/requirements.txt
/tmp/dnd-research-env/bin/python scripts/research/generate_fixtures.py
/tmp/dnd-research-env/bin/python scripts/research/generate_save_fixture.py
/tmp/dnd-research-env/bin/python scripts/research/generate_spell_fixtures.py
/tmp/dnd-research-env/bin/python scripts/research/generate_lifecycle_fixtures.py
/tmp/dnd-research-env/bin/python scripts/research/generate_room_fixtures.py
/tmp/dnd-research-env/bin/python scripts/research/generate_visibility_fixtures.py
cargo test --test dos_oracle --test dos_import --test dos_spells --test dos_lifecycle --test dos_rooms --test dos_visibility
```

Normal Rust builds/tests use the committed captures and need neither Unicorn nor the DOS executable. Research scripts require both. Linear disassembly can mistake inline jump tables for code; `compact_dis.py` is only a reading aid, not a decompiler or a proof of reachability.

## PLAYERS.DAT layout

The original writer copies each linked-list character into a 128-byte file record and appends a full 128-byte record whose first 16 bytes are spaces. There is no header. The reader also accepts EOF. The remaining bytes in the end record can repeat the last character and are ignored.

| Relative offset | Field |
| --- | --- |
| `00`, `10` | Name and secret name, 16 bytes each |
| `20..25` | STR, INT, WIS, CON, DEX, CHA; signed bytes |
| `26`, `28` | Class byte (0/1/2), level signed word |
| `2a`, `2e`, `30` | XP signed dword; maximum/current HP signed words |
| `32`, `36` | Carried/banked gold signed dwords |
| `3a..3d` | One-based column, row, depth; zero-based dungeon |
| `3e` | Pending treasure XP signed dword |
| `42..4c` | Cloak, boots, ring, shield, armor, weapon; six signed words |
| `4e..54`, `56..5c` | Maximum/current spell slots, four words each |
| `5e..72` | Eleven effect counters |
| `74`, `7c` | Immortal and currently carrying Orb flags |
| `76`, `78`, `7a` | Exploration action count, autosave counter, recovery countdown |
| `7e` | Flags; bit mask 1 is continual light, 8 indicates a magic wand |

A position with column/row/depth all between 1 and 20 is in the dungeon (`0f9f:0192`). Outside coordinates indicate town; new records start with zero coordinates and current HP, restored by the entry routine. The test file uses synthetic names and input state, original character initialization, and the original file writer with only file I/O intercepted. It contains no real player's data.

## Lifecycle and room capture boundaries

`spell_oracle.py` supplies normalized keyboard values to the original spell entry points and suppresses only text, colors and delays. Pass Wall directions use the DOS routine's uppercase W/A/X/D inputs. The normalized Return value at `0f9f:0435` is 99, not raw ASCII 13.

`generate_lifecycle_fixtures.py` executes the recovery block repeatedly with persistent player/RNG state. Reincarnation's DOS file write is intercepted; exhausted immortality stops before file deletion and terminal UI. `generate_room_fixtures.py` executes fountain and hazard routines through far return, pit avoidance through its final condition, and whole djinn relocation loops on explicitly constructed maps. The in-memory dungeon is padded with a stride of 23: `(depth * 23 + row) * 23 + column`, all one-based. It is distinct from the compact 20×20 asset format.

Throne routine `0e1a:000f` was inspected during this pass but is not fully ported: successful rune reading adds a current spell charge and can increase the corresponding maximum. Its floating-point tier selection and persistent capacity need an explicit model before claiming parity.

## Visibility capture

`generate_visibility_fixtures.py` supplies local west/north edge arrays to the original clipping block, with the player at local (1,1). The block changes both wall arrays and room-content masks. Nonzero edge values, including doors, obstruct sight. Expected arrays are read from the original stack frame, not calculated by the generator.

The recognition helper executes two percentage checks: 95% for light above 50 or the continual-light flag, OR 10% for any positive light, OR the player's own room. Both checks execute even for the player's room. The full renderer suppresses neighboring contents entirely without light and uses its unidentified-content glyph when recognition fails. The native renderer uses `???` and snapshots its random stream for stable redraws; a whole-display differential trace remains separate work.
