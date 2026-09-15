//! State changes recovered from the original special-room routines.
use crate::{player::Player, rng::Rng};
/// DOS 0139:02f8. Failed severity rolls retry with increasing depth.
pub fn hazard_damage(class: i32, mut depth: i32, rng: &mut Rng) -> i32 {
    if depth < 0 {
        return -depth;
    }
    loop {
        let damage = rng.die((4 - class) * depth);
        depth += 1;
        if rng.chance(0.75) {
            return damage;
        }
    }
}
/// DOS 0343:076d. Both boot rolls occur even when dexterity succeeds.
pub fn avoids_pit(p: &Player, rng: &mut Rng) -> bool {
    if p.active(crate::player::LEVITATE) {
        return true;
    }
    let dex = rng.dice(3, 6) + 2 <= p.stats[4];
    let boots = rng.die(20) * rng.die(20) <= 25 * p.boots;
    dex || boots
}
/// DOS 02d4:0188 onward. Color is the 1..8 roll shown on arrival.
pub fn fountain(p: &mut Player, mut color: i32, mut depth: i32, rng: &mut Rng) -> String {
    match rng.die(4) {
        1 => color = rng.die(8),
        2 => {
            depth = (3 * depth + 1) / 2;
            color = if color % 2 == 1 { color + 1 } else { color - 1 };
        }
        _ => {}
    }
    let positive = color % 2 == 1;
    match (color + 1) / 2 {
        1 => {
            let amount = i64::from(rng.die(500) * depth) * if positive { 1 } else { -1 };
            p.xp += amount;
            let level = p.check_level(rng).unwrap_or_default();
            // Keep terminal death representable in the native save format.
            p.xp = p.xp.max(-1);
            format!("The water changes your experience by {amount}. {level}")
        }
        2 => {
            let mut amount = 1;
            while rng.die(100) > 90 - 2 * depth {
                amount += 1;
            }
            let stat = (rng.die(6) - 1) as usize;
            let old = p.stats[stat];
            p.stats[stat] = if positive {
                (old + amount).min(20)
            } else {
                (old - amount).max(1)
            };
            format!(
                "Your {} changes from {old} to {}.",
                crate::player::STAT_NAMES[stat],
                p.stats[stat]
            )
        }
        3 => {
            if positive {
                let hp = rng.die(3 * depth);
                p.heal(hp);
                format!("The water restores up to {hp} hit points.")
            } else {
                let damage = hazard_damage(p.class.index(), depth, rng);
                p.hp -= damage;
                format!("Poison! You suffer {damage} damage.")
            }
        }
        _ => {
            if positive {
                let effect = rng.die(9) as usize;
                let duration = rng.dice(3, 5 * depth);
                p.effects[effect] += duration;
                format!(
                    "The water grants {} for {duration} exploration turns.",
                    crate::player::EFFECT_NAMES[effect]
                )
            } else {
                if rng.die(100) > 99 - depth / 3 {
                    p.treasure_xp /= 2;
                }
                "Your thirst is quenched.".into()
            }
        }
    }
}

/// DOS 0139:0005: keep the initial depth ceiling across rejected destinations.
pub fn djinn_destination(
    mut pos: crate::world::Pos,
    rng: &mut Rng,
    is_djinn: impl Fn(crate::world::Pos) -> bool,
) -> crate::world::Pos {
    let ceiling = i32::from(pos.z) + 1;
    // A malformed map must not lock the native UI forever.
    for _ in 0..64 {
        if !is_djinn(pos) {
            break;
        }
        let z = rng.die(ceiling) - 1;
        let y = rng.die(20) - 1;
        let x = rng.die(20) - 1;
        pos = crate::world::Pos::new(x as u8, y as u8, z as u8);
    }
    pos
}
