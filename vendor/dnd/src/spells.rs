use crate::{
    engine::{Game, Phase},
    player::*,
    rng::Rng,
    world::{Direction, Pos},
};
#[derive(Clone, Copy)]
pub struct Spell {
    pub name: &'static str,
    pub combat: bool,
    pub description: &'static str,
}
macro_rules! s {
    ($name:expr,$combat:expr,$desc:expr) => {
        Spell {
            name: $name,
            combat: $combat,
            description: $desc,
        }
    };
}
pub const MAGIC: [[Spell; 6]; 4] = [
    [
        s!("Magic Missile", true, "Level + 1d10 damage; never misses."),
        s!("Charm Monster", true, "Holds a living opponent; may break."),
        s!("Shield", false, "Reduces enemy chance to hit."),
        s!("Sleep", true, "Puts living opponents to sleep."),
        s!(
            "Protection from Evil",
            false,
            "Makes enemy attacks less accurate."
        ),
        s!("Light", false, "Reveals more rooms and secret doors."),
    ],
    [
        s!(
            "Phantasmal Forces",
            true,
            "Frightens an opponent into fleeing."
        ),
        s!("Web", true, "Immobilizes the opponent."),
        s!("Lightning Bolt", true, "Level + 2d8 damage."),
        s!("Strength", false, "Temporarily adds three strength."),
        s!("Levitate", false, "Avoids pits."),
        s!("Invisibility", false, "Helps avoid wandering monsters."),
    ],
    [
        s!("Fireball", true, "Level + 4d6 fire damage."),
        s!(
            "Confusion",
            true,
            "Holds the opponent; damage weakens the hold."
        ),
        s!(
            "Pass Wall",
            false,
            "Move through a wall: add north/east/south/west."
        ),
        s!("Hold Monster", true, "Stops attacks and dodging."),
        s!("Fear", false, "Frightens dungeon creatures."),
        s!("Continual Light", false, "Light for the entire expedition."),
    ],
    [
        s!("Teleport", false, "Moves to a random nearby depth."),
        s!(
            "Power Word Kill",
            true,
            "Attempts to kill an opponent instantly."
        ),
        s!(
            "Prismatic Wall",
            true,
            "Deals 5d8 damage, or 3d8 when resisted."
        ),
        s!("Time Stop", false, "Freezes enemies temporarily."),
        s!("Pillar of Fire", true, "Level + 3d6 damage."),
        s!(
            "Summon Demon",
            true,
            "Summons a demon to remove your opponent."
        ),
    ],
];
pub const CLERIC: [[Spell; 4]; 4] = [
    [
        s!(
            "Protection from Evil",
            false,
            "Reduces enemy chance to hit."
        ),
        s!("Light", false, "Reveals rooms and secret doors."),
        s!("Cure Light Wounds", false, "Heals 1d6 + 1 hit points."),
        s!("Turn Undead", true, "Drives a Ghoul or Vampire away."),
    ],
    [
        s!("Detect Traps", false, "Identifies trapped treasure."),
        s!("Silence", false, "Reduces wandering monster encounters."),
        s!("Pray", false, "Improves combat accuracy and protection."),
        s!("Hold Monster", true, "Stops attacks and dodging."),
    ],
    [
        s!("Cure Serious Wounds", false, "Heals 2d6 + 2 hit points."),
        s!("Dispell Undead", true, "Attempts to destroy undead."),
        s!("Continual Light", false, "Light for the entire expedition."),
        s!("Plague", true, "Kills an opponent; risks infecting you."),
    ],
    [
        s!("Holy Word", true, "Attempts to banish your opponent."),
        s!("Finger of Death", true, "Instant death on a wisdom check."),
        s!("Blade Barrier", true, "Attempts to destroy an attacker."),
        s!("Heal", false, "Restores all hit points."),
    ],
];
pub fn spell(class: Class, tier: usize, number: usize) -> Option<Spell> {
    if !(1..=4).contains(&tier) || number == 0 {
        return None;
    }
    if class == Class::Cleric {
        CLERIC[tier - 1].get(number - 1).copied()
    } else {
        MAGIC[tier - 1].get(number - 1).copied()
    }
}
/// Shared DOS cleric/magician duration helper (060d:000d / 07c9:0009).
pub fn duration(old: i32, level: i32, rng: &mut Rng) -> i32 {
    old.saturating_add(rng.dice(3, 10))
        .saturating_add(level)
        .min(99)
}
/// DOS's strict comparison against the integer average of two attributes.
pub fn resistance(stat_a: i32, stat_b: i32, level: i32, enemy: i32, rng: &mut Rng) -> bool {
    rng.dice(3, 6) < (stat_a + stat_b) / 2 + level - enemy
}
/// Original 0e78:0001. Coordinates are one-based; depth may leave the dungeon.
pub fn teleport_destination(depth: i32, rng: &mut Rng) -> [i32; 3] {
    let x = rng.die(20);
    let y = rng.die(20);
    let delta = match rng.die(100) {
        1..=60 => 0,
        61..=80 => 1,
        81..=90 => 2,
        91..=95 => 3,
        96..=98 => 4,
        _ => 5,
    }
    .min(depth);
    let signed = if rng.chance(0.5) { delta } else { -delta };
    [x, y, depth + signed]
}
/// Original Pass Wall rejects dungeon boundaries and feature 15 (solid rock).
pub fn pass_wall_destination(pos: Pos, direction: Direction, solid_rock: bool) -> Option<Pos> {
    if solid_rock {
        None
    } else {
        pos.step(direction)
    }
}
impl Game {
    pub fn cast(&mut self, tier: usize, number: usize, direction: Option<&str>) {
        let Some(s) = spell(self.player.class, tier, number) else {
            self.say("No such spell. Type spells to read the spellbook.");
            return;
        };
        let combat = matches!(self.phase, Phase::Combat(_));
        if !matches!(
            self.phase,
            Phase::Exploring | Phase::Choice(_) | Phase::Combat(_)
        ) {
            self.say("You cannot cast here.");
            return;
        }
        if s.combat && !combat {
            self.say("That spell requires an opponent.");
            return;
        }
        if s.name == "Pass Wall" && direction.and_then(Direction::parse).is_none() {
            self.say("Use cast 3 3 north (or east/south/west).");
            return;
        }
        let fighter = self.player.class == Class::Fighter;
        if (fighter && self.player.wand < tier as i32)
            || (!fighter && self.player.slots[tier - 1] < 1)
        {
            self.say(if fighter {
                "Your wand lacks enough charges."
            } else {
                "You have no spells left at that level."
            });
            return;
        }
        if fighter {
            self.player.wand -= tier as i32;
        }
        if combat {
            self.turns += 1;
        } else {
            self.tick();
        }
        self.say(format!("You cast {}.", s.name));
        if s.name == "Pass Wall" {
            if !fighter {
                self.player.slots[tier - 1] -= 1;
            }
            let destination = self.pos.step(Direction::parse(direction.unwrap()).unwrap());
            let solid_rock = destination
                .is_some_and(|p| self.dungeon.cell(p).feature() == crate::world::Feature::Djinn);
            if let Some(p) = pass_wall_destination(
                self.pos,
                Direction::parse(direction.unwrap()).unwrap(),
                solid_rock,
            ) {
                self.pos = p;
                if !combat {
                    self.arrive(false);
                } else {
                    self.reveal();
                    self.monster_attack();
                }
            } else {
                self.say("Solid rock prevents passage.");
                if combat {
                    self.monster_attack();
                }
            }
            return;
        }
        if s.name == "Teleport" {
            if !fighter {
                self.player.slots[tier - 1] -= 1;
            }
            if self.teleport_spell() {
                if combat {
                    self.reveal();
                    self.monster_attack();
                } else {
                    self.arrive(false);
                }
            }
            return;
        }
        // Spells do not themselves advance the DOS effect clock. The surrounding
        // encounter scheduler owns elapsed time and the next monster action.
        let mut target = match self.phase.clone() {
            Phase::Combat(m) => m,
            _ => crate::engine::Monster {
                kind: 0,
                name: String::new(),
                level: 1,
                hp: 1,
                max_hp: 1,
                strength: 0,
                armor: 0,
                held: 0,
                boss: false,
            },
        };
        let old_xp = self.player.xp;
        let result = crate::spell_effects::resolve(
            &mut self.player,
            &mut target,
            &mut self.rng,
            tier,
            number,
        );
        self.say(result.message);
        if self.player.xp > old_xp {
            self.say(format!("You gain {} experience.", self.player.xp - old_xp));
        }
        let died = self.player.hp <= 0;
        self.check_death();
        if died {
            return;
        }
        if combat {
            if result.removed {
                if target.boss {
                    self.clear_feature();
                    let i = self.pos.index();
                    self.world_mut().contents[i] |= 2;
                }
                self.phase = Phase::Exploring;
                self.after_combat();
            } else {
                self.phase = Phase::Combat(target);
                self.monster_attack();
            }
        } else {
            self.phase = Phase::Exploring;
            self.reveal();
        }
    }
}
