//! Calculations recovered from DOS 097c:0298–04fb and 0a81–0d3a.
//! Keep action scheduling outside these routines so oracle tests isolate draw order.
use crate::{engine::Monster, player::*, rng::Rng};
#[derive(Debug, PartialEq)]
pub struct Attack {
    pub chance: i32,
    pub hit: bool,
    pub damage: i32,
}
pub fn player_attack(p: &Player, m: &Monster, rng: &mut Rng) -> Attack {
    let mut chance = 3 * p.stats[4] + p.stats[0] + p.weapon + p.level * (6 - p.class.index())
        - m.level * (m.die() / 2);
    if m.held > 0 {
        chance = p.weapon + p.level + 85;
    }
    if p.active(PRAYER) {
        chance += 5;
    }
    let chance =
        (f64::from(chance) * f64::from(p.max_hp + p.hp) / f64::from(2 * p.max_hp)).floor() as i32;
    let hit = rng.die(100) <= chance;
    let mut damage = 0;
    if hit {
        damage = rng.die(10 - 2 * p.class.index()) + p.weapon;
        let strength = p.stats[0] + if p.active(STRENGTH) { 3 } else { 0 };
        if strength > 14 {
            damage += rng.die(strength - 14);
        } else if strength < 7 {
            damage -= rng.die(7 - strength);
        }
        if m.armor > 0 {
            damage -= if m.held > 0 {
                rng.die((m.armor + 1) / 2)
            } else {
                rng.die(m.armor + 1) + rng.die(m.armor)
            };
        }
    }
    Attack {
        chance,
        hit,
        damage: damage.max(0),
    }
}
pub fn monster_attack(p: &Player, m: &Monster, rng: &mut Rng) -> Attack {
    let mut chance =
        40 + m.die() + m.strength + m.armor + 10 * p.class.index() + m.level * (m.die() / 2)
            - p.level * (6 - p.class.index());
    for (effect, penalty) in [(PROTECTION, 10), (SHIELD, 20), (PRAYER, 10)] {
        if p.active(effect) {
            chance -= penalty;
        }
    }
    chance -= 2 * (p.stats[4] - 14).max(0);
    let chance =
        (f64::from(chance) * f64::from(m.max_hp + m.hp) / f64::from(2 * m.max_hp)).floor() as i32;
    let hit = rng.die(100) <= chance;
    let mut damage = 0;
    if hit {
        damage = rng.die(m.die()) + m.level - rng.die(p.shield);
        if damage > 0 {
            damage -= rng.die(p.armor + 3 - p.class.index());
        }
    }
    Attack {
        chance,
        hit,
        damage: damage.max(0),
    }
}

/// DOS 097c:0624–06b2 consumes all three draws, even if dexterity succeeds.
pub fn can_evade(dexterity: i32, boots: i32, rng: &mut Rng) -> bool {
    let agile = rng.dice(3, 8) - 4 <= dexterity;
    let boot_roll = (25.0 * rng.unit() * rng.unit()).floor() as i32 + 1;
    agile || boot_roll <= boots
}
