//! Complete non-movement spell effects. Slot spending, XP, holds and random draw
//! order are compared with the original Pascal spell entry points in tests.
use crate::{
    engine::Monster,
    player::*,
    rng::Rng,
    spells::{duration, resistance, spell},
};
#[derive(Debug, Default)]
pub struct SpellResult {
    pub removed: bool,
    pub finished: bool,
    pub message: &'static str,
}
pub fn resolve(
    p: &mut Player,
    m: &mut Monster,
    rng: &mut Rng,
    tier: usize,
    number: usize,
) -> SpellResult {
    let name = spell(p.class, tier, number).expect("validated spell").name;
    if p.class != Class::Fighter {
        p.slots[tier - 1] -= 1;
    }
    let level = p.level;
    let intel = p.stats[1];
    let wisdom = p.stats[2];
    let mut result = SpellResult {
        message: "The spell has no effect.",
        ..Default::default()
    };
    let mut damage = None;
    let mut award = false;
    let effect = match name {
        "Light" => Some(LIGHT),
        "Protection from Evil" => Some(PROTECTION),
        "Shield" => Some(SHIELD),
        "Strength" => Some(STRENGTH),
        "Levitate" => Some(LEVITATE),
        "Invisibility" => Some(INVISIBLE),
        "Fear" => Some(FEAR),
        "Detect Traps" => Some(DETECT),
        "Silence" => Some(SILENCE),
        "Pray" => Some(PRAYER),
        "Time Stop" => Some(TIME_STOP),
        _ => None,
    };
    if let Some(e) = effect {
        p.effects[e] = duration(p.effects[e], level, rng);
        if e == TIME_STOP {
            m.held = 100;
        }
        result.message = "The enchantment takes effect.";
    }
    match name {
        "Continual Light" => {
            p.continual_light = true;
            p.effects[LIGHT] = p.effects[LIGHT].saturating_add(50);
            result.message = "A lasting light surrounds you.";
        }
        "Cure Light Wounds" => {
            p.heal(rng.die(6) + 1);
            result.message = "Your wounds begin to close.";
        }
        "Cure Serious Wounds" => {
            p.heal(rng.dice(2, 6) + 2);
            result.message = "Your wounds begin to close.";
        }
        "Heal" => {
            p.hp = p.max_hp;
            result.message = "All your wounds close.";
        }
        "Magic Missile" => damage = Some(level + rng.die(10)),
        "Lightning Bolt" => damage = Some(level + rng.dice(2, 8)),
        "Fireball" => damage = Some(level + rng.dice(4, 6)),
        "Charm Monster" | "Sleep" | "Web" | "Hold Monster" | "Confusion" => {
            let immune = (matches!(name, "Charm Monster" | "Sleep")
                && matches!(m.kind, 7 | 8 | 12))
                || (name == "Sleep" && m.kind == 13);
            let second = match name {
                "Charm Monster" => p.stats[5],
                "Web" => p.stats[4],
                _ => intel,
            };
            let mut success = !immune && resistance(intel, second, level, m.level, rng);
            if success && name == "Web" {
                let roll = rng.dice(3, 6);
                if m.kind == 12 && roll < m.level - level + 10 {
                    success = false;
                }
            }
            if success {
                m.held = match name {
                    "Charm Monster" | "Sleep" => rng.die(6),
                    "Web" => rng.dice(2, 8),
                    "Confusion" => level + rng.dice(2, 6),
                    _ => rng.dice(3, 10),
                };
                result.message = "The creature is helpless.";
            }
        }
        "Phantasmal Forces" if m.held <= 0 => {
            while rng.die(8) + 7 == m.kind as i32 + 1 {}
            let _illusion_level = level + rng.dice(2, 6) + 10;
            if resistance(intel, intel, level, m.level, rng) && rng.chance(0.85) {
                m.hp = 0;
                result.removed = true;
                award = true;
                result.message = "The creature flees the illusion!";
            }
        }
        "Turn Undead" if m.undead() && rng.dice(3, 6) + 3 <= wisdom + level - m.level => {
            result.removed = true;
            result.message = "The undead creature flees!";
        }
        "Dispell Undead" if m.undead() && rng.dice(3, 6) + 2 <= wisdom => {
            result.removed = true;
            award = true;
            result.message = "The undead creature vanishes.";
        }
        "Plague" if rng.dice(3, 6) + 2 <= wisdom => {
            if rng.chance(0.9) {
                result.removed = true;
                award = true;
                result.message = "The creature succumbs to the plague.";
            } else {
                p.hp = 0;
                result.finished = true;
                result.message = "You catch the plague too!";
            }
        }
        "Power Word Kill" | "Holy Word" if resistance(intel, intel, level, m.level, rng) => {
            let vampire_roll = rng.dice(3, 6);
            if m.kind == 12 && vampire_roll < m.level - level + 10 {
                result.message = "The vampire resists the word of death.";
                if rng.dice(3, 6) < m.level - level + 13 {
                    p.hp = 0;
                    result.message = "The vampire turns the word of death against you!";
                }
            } else if name == "Holy Word" {
                m.hp = 0;
                result.removed = true;
                award = true;
            } else {
                damage = Some(m.hp);
            }
        }
        "Finger of Death" if rng.die(20) <= wisdom => {
            damage = Some(m.hp);
        }
        "Blade Barrier" if resistance(intel, intel, level, m.level, rng) => {
            let roll = level + rng.die(6);
            if !(roll < m.level && m.strength > 17) {
                damage = Some(m.hp);
            }
        }
        "Prismatic Wall" => {
            let success = resistance(intel, intel, level, m.level, rng);
            let strong = level + rng.dice(2, 6) > m.level;
            damage = Some(rng.dice(if success && strong { 5 } else { 3 }, 8));
        }
        "Pillar of Fire" => {
            damage = Some(if resistance(intel, intel, level, m.level, rng) {
                level + rng.dice(3, 6)
            } else {
                level + rng.dice(2, 6) - 2
            });
        }
        "Summon Demon" => {
            let success = resistance(intel, intel, level, m.level, rng);
            result.message = if success {
                "A fiend carries your opponent away!"
            } else {
                "Your opponent flees with a demon in pursuit!"
            };
            m.hp = 0;
            result.removed = true;
            award = true;
        }
        _ => {}
    }
    if let Some(n) = damage {
        m.hp -= n;
        result.message = "The spell strikes your opponent.";
        if m.hp <= 0 {
            result.removed = true;
            award = true;
        } else if m.held > 0 {
            m.held -= 1;
        }
    }
    if award {
        let xp = i64::from((m.die() * m.level + m.strength * m.armor) * 10 / p.level);
        p.xp += xp;
        p.check_level(rng);
        if result.message == "The spell has no effect." {
            result.message = "The creature is destroyed.";
        }
    }
    result.finished |= result.removed;
    result
}
