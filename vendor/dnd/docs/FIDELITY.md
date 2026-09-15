# Fidelity and remaining work

This is a playable native Rust recreation of DOS DND v1.2:1. It now includes calculations recovered from, and differentially tested against, the original executable. **It is not yet a complete behavioral port.**

## Verified against the executable

`scripts/research/generate_fixtures.py` executes original 16-bit instructions in Unicorn. The committed fixture contains **800 cases**, checked by `tests/dos_oracle.rs`. Expected values come from the DOS binary, not a second implementation of the Rust formulas. Every random calculation also compares the final random state.

| Area | Evidence and resulting behavior |
| --- | --- |
| RNG | Original integer and floating streams; 32-bit shift register, eight shifts per draw. Dice multiply one roll: `3d6 = 3 × d6`. A zero-sided die returns its count without a draw. |
| Attributes | Six `3d6` values; reroll the whole set until the total is at least 72. Initial maximum HP equals Constitution. |
| Experience | Class bases 2,000 / 1,500 / 2,500, doubling through level 10; each subsequent level adds half the level-10 threshold. |
| Level gain | One level per award with excess XP capped; HP uses `d(10 − 2 × class) + max(STR − 14, 0)`. The Strength bonus is what the DOS code actually reads. |
| Spell capacity | Both caster classes, levels 1–30, match the original slot calculations. |
| Monster records | All 15 hit-die sizes; strength, armor and HP generated in original draw order. HP includes strength. |
| Weapon attacks | Player and monster chance, wound adjustment, damage and armor rolls. Held monsters can still be missed. Division rounds the monster die before multiplication by its level. |
| Spell helpers | Duration adds `3d10 + player level`, capped at 99; resistance compares `3d6` strictly against the integer average of two attributes plus the level difference. |
| Evasion | Dexterity and boots checks, including the three draws even when dexterity succeeds. |

The 800 cases cover representative inputs and boundaries; they are not an exhaustive proof over all possible states. Rust deliberately uses wider arithmetic rather than reproducing 16-bit overflow at extreme values.

## Complete casts, lifecycle and selected rooms

Additional generators execute the original spell and room entry points and bounded lifecycle blocks. Output, delay, keyboard and file-write interfaces are substituted; game arithmetic executes in the DOS image. Captures compare final random state as well as player and monster changes.

| Capture | Coverage |
| --- | --- |
| `dos-spells.json` | 1,368 complete casts of the 38 non-movement spells: six seeds and six opponent/attribute variants per spell. Includes slots, HP, XP, helplessness, effects and room monster bits. |
| `dos-lifecycle.json` | 24 Teleport casts and 16 Pass Wall casts complete coverage of all 40 spell names; 216 reincarnations include level-one and exhausted-constitution cases. |
| `dos-lifecycle.json` | 72 sequences of 160 exploration ticks, comparing every state and resuming a Rust save halfway through each sequence. Includes rings, depleted spell tiers and continual light. |
| `dos-rooms.json` | 936 full fountain outcomes, 936 hazard routines, 624 pit checks and 312 djinn relocations through synthetic maps requiring retries. |

These establish representative state transitions, not every spell context or complete input-trace equivalence. Fighter wand charges and invalid/out-of-combat spell handling remain native interface rules. Extreme 16-bit overflow is not reproduced. Negative spell slots after a severely depleted character reincarnates are clamped to zero for valid native saves.

Corrections from these comparisons:

- Summon Demon removes the combat opponent and awards XP on both resistance branches. Prismatic Wall and Pillar of Fire deal reduced damage when resisted. Holy Word and Power Word Kill have a vampire-specific counterattack; there is no generic maximum-roll backfire.
- Phantasmal Forces draws an illusion kind and level before resistance. Turn Undead awards no XP; Dispell Undead and Plague do. Removal need not set monster HP to zero.
- Teleport draws column, row, a nearby-depth offset and its sign. It has no intelligence-based solid-rock death check. A destination outside depth 1–20 is an exit. Pass Wall rejects outside coordinates and feature 15, and works during combat.
- The exploration clock restores the first missing spell tier on recovery, applies ring healing and ages effects. Combat does not age those counters. Helplessness decreases on surviving damage, not on the monster's skipped action. Continual light has its own flag and refreshes its counter to 50.
- Reincarnation decrements Constitution, halves level with upward rounding, rolls maximum-HP losses, adjusts slots, clears equipment and carried gold, retains banked gold and effects, and selects random dungeon coordinates. Zero Constitution ends immortality.
- Fountains use eight colors and can alter XP, attributes, HP, effects or pending treasure XP. Pit avoidance uses Dexterity plus two boot rolls. Hazard damage retries with increasing severity. Djinn destinations remain at or above the original depth ceiling across retries.

## Current visibility

The gameplay viewport shows only the current local surroundings. Previous exploration does not supply live visibility. The wall/room clipping order at `0a9f:0636–07f8` is compared against 260 original cases, and the light-recognition helper at `0a9f:000e–0083` against 168 cases. Walls, doors and secret doors obstruct sight; the local footprint covers the player's room and its eight neighbors, with boundary walls.

Light controls recognition of neighboring room contents, not an expanding permanent map. Without light their details are hidden. Ordinary light can leave `???` markers; a light counter above 50 or the continual-light flag greatly improves identification. The original helper's two random checks and thresholds are preserved.

Rendering uses a copy of the current RNG so repeated redraws and opening the map do not change gameplay or reroll the view. This deliberately does not reproduce the original renderer's complete sequence of display-related RNG consumption. Secret-door discovery retains the native engine's existing knowledge rules. Rendering remains a compact terminal layout, not a pixel-for-pixel DOS screen.

Purchased maps are tracked separately and can show their full level in the map overlay; they never expand the gameplay viewport. Older save files retain purchases through the old purchase signature (every room visited and both secret bits set on every cell). The M/map screen is a cumulative exploration journal, an intentional convenience in this recreation. It uses the saved visited-room and secret-door knowledge independently of current lighting, shows known room features and cleared specials, and remains available in town and for previously explored levels through `map LEVEL`. The existing engine discovery rules automatically update that memory during exploration. Older saves recover their explored maps without conversion. Unexplored rooms stay blank unless their level has been purchased. Town and remote levels have no live gameplay view.

## Other recovered behavior

- All five original 8,000-byte maps; all 80,000 stored north/west edges independently match 100 printed maps.
- Room IDs and monster roster, spell names and tier placement, and store unit prices.
- Exact entrance assignments from DOS segment `0428`; the Warren starts at column 12, row 11 (one-based), correcting the earlier selection.
- Ordinary monster kind selection is uniform across 15 kinds; level uses a die scaled to dungeon depth. Full population and encounter scheduling still need comparison.
- Charm, Sleep, Web, Confusion and Hold durations and checks were recovered from their branches. Sleep also excludes Balrogs. Time Stop sets an existing opponent's helplessness to 100.
- Blade Barrier uses an Intelligence-based resistance check and a conditional dodge, rather than always killing.
- Speculative dragon breath, Balrog whip, vampire energy drain and per-round Troll regeneration were removed from the normal weapon-attack path; those operations do not appear in that DOS combat loop.
- Read-only import of v1.2:1 `PLAYERS.DAT` records. A synthetic two-character file was emitted by the original DOS initialization/file writer, then imported in tests. No real user's secret name is included.

## Remaining differences

| Area | Remaining work |
| --- | --- |
| Encounters | Match room population, stored monster kinds, wandering checks, regeneration, initiative and action scheduling as complete traces. |
| Spells | Complete encounter/action traces, movement during combat, fighter wands and additional non-combat contexts. All 40 spell names now have representative original-entry captures. |
| Special rooms | Altar, throne, mirror, transporter and trove still need full ports and differential traces. Fountain, pit and djinn state changes now have captures; room arrival/choice scheduling remains to audit. Throne disassembly shows spell-slot changes, including maximum-slot increases, which the current capacity model does not yet preserve. |
| Treasure/equipment | Recover category odds, curses, wand acquisition and tiered charges, repeat finds and trade-in behavior. |
| Travel | Confirm the current `1,000 × character level` price. |
| Timing | The numerical recovery/effect tick is verified. Match its placement in full exploration/encounter traces and original idle-input timing. The native UI remains explicitly turn-based. |
| Maps/interface | Current wall clipping and light recognition are verified. Complete display RNG scheduling, secret-door recognition and the original 80×25 layout still differ. |
| Persistence | Determine which room mutations reset per level, expedition or dungeon. |
| Death/victory | Reincarnation penalties are verified. Orb return accounting, retirement and high-score behavior still need complete traces. |
| DOS import | Fresh RNG and room state; no secret-name authentication, map-display flags or autosave counters. Recovery and continual-light state are imported. Characters holding a DOS wand are explicitly rejected until tiered charges are supported. Older DOS formats and export are unsupported. |

Version-1 Rust saves remain readable and retain their legacy SplitMix64 stream. New characters use the DOS stream. All adventures use the corrected rules; loading an old save is not a replay of the old engine. New saves use JSON version 2. Missing recovery/light fields default safely; the old permanent-light sentinel migrates to the DOS flag and a counter of 50. A native spell-slot recovery clock is preserved in saves. Seed zero (or a seed whose low 32 bits are zero) becomes one to avoid the DOS register's absorbing zero state.

The online original was inspected through character creation. The differential tests execute original routines and sequential recovery blocks; there has not yet been an exhaustive end-to-end DOS input replay or a human playthrough of every dungeon.
