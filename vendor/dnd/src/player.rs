use crate::rng::Rng;
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Class {
    Fighter,
    Cleric,
    Magician,
}
impl Class {
    pub fn index(self) -> i32 {
        match self {
            Self::Fighter => 0,
            Self::Cleric => 1,
            Self::Magician => 2,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Fighter => "Fighter",
            Self::Cleric => "Cleric",
            Self::Magician => "Magician",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "f" | "fighter" => Some(Self::Fighter),
            "c" | "cleric" => Some(Self::Cleric),
            "m" | "magician" | "mage" => Some(Self::Magician),
            _ => None,
        }
    }
}
pub const STAT_NAMES: [&str; 6] = ["STR", "INT", "WIS", "CON", "DEX", "CHA"];
pub const EFFECT_NAMES: [&str; 11] = [
    "Light",
    "Protection",
    "Shield",
    "Prayer",
    "Detect traps",
    "Silence",
    "Levitation",
    "Strength",
    "Fear",
    "Invisibility",
    "Time stop",
];
pub const LIGHT: usize = 0;
pub const PROTECTION: usize = 1;
pub const SHIELD: usize = 2;
pub const PRAYER: usize = 3;
pub const DETECT: usize = 4;
pub const SILENCE: usize = 5;
pub const LEVITATE: usize = 6;
pub const STRENGTH: usize = 7;
pub const FEAR: usize = 8;
pub const INVISIBLE: usize = 9;
pub const TIME_STOP: usize = 10;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Player {
    pub name: String,
    pub class: Class,
    pub stats: [i32; 6],
    pub level: i32,
    pub xp: i64,
    pub hp: i32,
    pub max_hp: i32,
    pub gold: i64,
    pub bank: i64,
    pub treasure_xp: i64,
    pub weapon: i32,
    pub armor: i32,
    pub shield: i32,
    pub ring: i32,
    pub boots: i32,
    pub cloak: i32,
    pub wand: i32,
    pub slots: [i32; 4],
    pub effects: [i32; 11],
    pub orb: bool,
    pub immortal: bool,
    #[serde(default)]
    pub continual_light: bool,
    #[serde(default)]
    pub recovery_clock: i32,
}
impl Player {
    pub fn new(name: String, class: Class, rng: &mut Rng) -> Self {
        let stats = loop {
            let rolls: [i32; 6] = std::array::from_fn(|_| rng.dice(3, 6));
            if rolls.iter().sum::<i32>() >= 72 {
                break rolls;
            }
        };
        let max_hp = stats[3];
        Self {
            name,
            class,
            stats,
            level: 1,
            xp: 0,
            hp: max_hp,
            max_hp,
            gold: 0,
            bank: 0,
            treasure_xp: 0,
            weapon: 0,
            armor: 0,
            shield: 0,
            ring: 0,
            boots: 0,
            cloak: 0,
            wand: 0,
            slots: spell_capacity(class, 1),
            effects: [0; 11],
            orb: false,
            immortal: false,
            continual_light: false,
            recovery_clock: 0,
        }
    }
    pub fn active(&self, e: usize) -> bool {
        self.effects[e] > 0 || (e == LIGHT && self.continual_light)
    }
    pub fn heal(&mut self, hp: i32) {
        self.hp = (self.hp + hp).min(self.max_hp);
    }
    /// DOS exploration clock (0139:042e). Combat rounds do not advance it.
    pub fn tick(&mut self, rng: &mut Rng) {
        self.heal(self.ring);
        self.recovery_clock -= 1;
        if self.recovery_clock <= 0 {
            self.reset_recovery(rng);
            if self.ring == 0 {
                self.heal(1);
            }
            let capacity = spell_capacity(self.class, self.level);
            for (slot, max) in self.slots.iter_mut().zip(capacity) {
                if *slot < max {
                    *slot += 1;
                    break;
                }
            }
        }
        for t in &mut self.effects {
            if *t > 0 {
                *t -= 1;
            }
        }
        if self.continual_light {
            self.effects[LIGHT] = 50;
        }
    }
    pub fn reset_recovery(&mut self, rng: &mut Rng) {
        self.recovery_clock = rng.dice(12 - self.stats[3] / 3, 12);
    }
    /// DOS reincarnation (0139:0982): returns false when immortality is exhausted.
    pub fn reincarnate(&mut self, rng: &mut Rng) -> bool {
        if !self.immortal {
            return false;
        }
        self.stats[3] -= 1;
        if self.stats[3] < 1 {
            self.immortal = false;
            self.hp = 0;
            return false;
        }
        let old_level = self.level.max(1);
        let old_capacity = spell_capacity(self.class, old_level);
        self.level = (old_level + 1) / 2;
        for _ in self.level..=old_level {
            self.max_hp -= rng.die(10 - 2 * self.class.index()) + (self.stats[0] - 14).max(0);
        }
        self.max_hp = self.max_hp.max(self.stats[3]);
        self.hp = self.max_hp;
        self.xp = experience(self.class, self.level);
        self.gold = 0;
        self.treasure_xp = 0;
        let capacity = spell_capacity(self.class, self.level);
        for i in 0..4 {
            self.slots[i] = (self.slots[i] + capacity[i] - old_capacity[i]).clamp(0, capacity[i]);
        }
        self.cloak = 0;
        self.boots = 0;
        self.ring = 0;
        self.shield = 0;
        self.armor = 0;
        self.weapon = 0;
        self.wand = 0;
        true
    }
    pub fn restore(&mut self) {
        self.hp = self.max_hp;
        self.slots = spell_capacity(self.class, self.level);
        self.effects = [0; 11];
        self.continual_light = false;
        self.recovery_clock = 0;
    }
    pub fn gain_gold(&mut self, amount: i64, depth: i32) {
        self.gold += amount;
        self.treasure_xp += (amount as f64 * (depth as f64 / self.level as f64).min(1.0)) as i64;
    }
    /// DOS 0f9f:09e0: one advancement per award, excess capped below next level.
    pub fn check_level(&mut self, rng: &mut Rng) -> Option<String> {
        let old = spell_capacity(self.class, self.level);
        let up = self.xp >= experience(self.class, self.level + 1);
        let down = self.xp < experience(self.class, self.level);
        if !up && !down {
            return None;
        }
        let hp = rng.die(10 - 2 * self.class.index()) + (self.stats[0] - 14).max(0);
        if up {
            self.level += 1;
            self.max_hp += hp;
            self.hp += hp;
            self.xp = self.xp.min(experience(self.class, self.level + 1) - 1);
        } else {
            self.level -= 1;
            self.max_hp -= hp;
            self.hp -= hp;
            if self.level < 1 || self.max_hp < 1 {
                self.hp = 0;
                self.level = 1;
                self.max_hp = self.max_hp.max(1);
            }
        }
        let new = spell_capacity(self.class, self.level);
        for i in 0..4 {
            self.slots[i] = (self.slots[i] + new[i] - old[i]).max(0);
        }
        Some(format!(
            "You {} to level {}. {} {} hit points.",
            if up { "advance" } else { "fall" },
            self.level,
            if up { "Gained" } else { "Lost" },
            hp
        ))
    }
}
pub fn experience(class: Class, level: i32) -> i64 {
    let base = match class {
        Class::Fighter => 2000,
        Class::Cleric => 1500,
        Class::Magician => 2500,
    };
    match level {
        ..=1 => 0,
        2..=10 => base * (1 << (level - 2)),
        _ => {
            let ten = base * 256;
            ten + ten * i64::from(level - 10) / 2
        }
    }
}
pub fn spell_capacity(class: Class, level: i32) -> [i32; 4] {
    if class == Class::Fighter {
        return [0; 4];
    }
    std::array::from_fn(|i| {
        let tier = i as i32 + 1;
        let n = if class == Class::Cleric {
            level - ((tier + 1) as f64 / 0.75) as i32 + 1
        } else {
            level - (tier as f64 / 0.8) as i32 + 1
        };
        n.max(0) + if i == 0 { 2 } else { 0 }
    })
}
