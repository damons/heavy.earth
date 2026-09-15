use crate::{player::*, rng::Rng, world::*};
use serde::{Deserialize, Serialize};

// DOS 097c:083f–08cb: hit-die sizes for the fifteen creatures.
pub const MONSTERS: [(&str, i32); 15] = [
    ("Kobold", 2),
    ("Goblin", 3),
    ("Orc", 4),
    ("Dwarf", 5),
    ("Harpie", 6),
    ("Troll", 6),
    ("Bugbear", 7),
    ("Doppleganger", 8),
    ("Ghoul", 8),
    ("Minotaur", 10),
    ("Ogre", 10),
    ("Giant", 12),
    ("Vampire", 14),
    ("Balrog", 16),
    ("Dragon", 20),
];
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Monster {
    pub kind: usize,
    pub name: String,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    pub strength: i32,
    pub armor: i32,
    pub held: i32,
    pub boss: bool,
}
impl Monster {
    pub fn generate(kind: usize, level: i32, rng: &mut Rng) -> Self {
        let (name, die) = MONSTERS[kind];
        let strength = rng.die(die);
        let armor = rng.die(level) - 1;
        let hp = rng.dice(level, die) + strength;
        Self {
            kind,
            name: name.into(),
            level,
            hp,
            max_hp: hp,
            strength,
            armor,
            held: 0,
            boss: false,
        }
    }
    pub fn die(&self) -> i32 {
        MONSTERS[self.kind].1
    }
    pub fn undead(&self) -> bool {
        self.kind == 8 || self.kind == 12
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Loot {
    Gold {
        amount: i64,
        label: String,
        trapped: bool,
        chest: bool,
    },
    Item {
        kind: u8,
        power: i32,
    },
    Orb,
}
impl Loot {
    pub fn name(&self) -> String {
        match self {
            Self::Gold { amount, label, .. } => format!("{label} worth {amount} gold"),
            Self::Item { kind, power } => format!("{} +{power}", item_name(*kind)),
            Self::Orb => "the Orb of Zot".into(),
        }
    }
}
pub fn item_name(kind: u8) -> &'static str {
    match kind {
        0 => "Magic weapon",
        1 => "Magic armor",
        2 => "Magic shield",
        3 => "Mysterious book",
        4 => "Magic torch",
        5 => "Ring of regeneration",
        6 => "Elven cloak",
        7 => "Elven boots",
        _ => "Magic wand",
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Phase {
    Town,
    Exploring,
    Combat(Monster),
    Treasure(Loot),
    Choice(Feature),
    Dead,
    Won,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WorldState {
    #[serde(default)]
    pub purchased_maps: [bool; 20],
    pub visited: Vec<bool>,
    pub contents: Vec<u8>,
    pub cleared: Vec<bool>,
    pub secrets: Vec<u8>,
    pub initialized: Vec<bool>,
    pub combinations: Vec<u8>,
}
impl Default for WorldState {
    fn default() -> Self {
        Self {
            purchased_maps: [false; 20],
            visited: vec![false; ROOMS],
            contents: vec![0; ROOMS],
            cleared: vec![false; ROOMS],
            secrets: vec![0; ROOMS],
            initialized: vec![false; 20],
            combinations: vec![255; ROOMS],
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Game {
    pub player: Player,
    pub dungeon: Dungeon,
    pub pos: Pos,
    pub phase: Phase,
    pub rng: Rng,
    pub worlds: Vec<WorldState>,
    pub turns: u64,
    pub log: Vec<String>,
    pub fountain_color: u8,
}
impl Game {
    pub fn new(name: String, class: Class, dungeon: Dungeon, seed: u64) -> Self {
        let mut rng = Rng::new(seed);
        let player = Player::new(name, class, &mut rng);
        let mut game = Self {
            player,
            dungeon,
            pos: dungeon.entrance(),
            phase: Phase::Town,
            rng,
            worlds: (0..5).map(|_| WorldState::default()).collect(),
            turns: 0,
            log: vec![],
            fountain_color: 1,
        };
        game.say("Welcome to DND. Find the Orb and return alive.");
        game.say("Enter the dungeon when ready. The entrance restores health and spells.");
        game
    }
    pub fn world_index(&self) -> usize {
        Dungeon::ALL
            .iter()
            .position(|d| *d == self.dungeon)
            .unwrap()
    }
    pub fn world(&self) -> &WorldState {
        &self.worlds[self.world_index()]
    }
    pub fn world_mut(&mut self) -> &mut WorldState {
        let i = self.world_index();
        &mut self.worlds[i]
    }
    pub fn feature(&self) -> Feature {
        if self.world().cleared[self.pos.index()] {
            Feature::Empty
        } else {
            self.dungeon.cell(self.pos).feature()
        }
    }
    pub fn clear_feature(&mut self) {
        let i = self.pos.index();
        self.world_mut().cleared[i] = true;
    }
    pub fn say(&mut self, msg: impl Into<String>) {
        self.log.push(msg.into());
        if self.log.len() > 100 {
            self.log.remove(0);
        }
    }
    pub fn depth(&self) -> i32 {
        self.pos.z as i32 + 1
    }
    pub fn gain_xp(&mut self, xp: i64) {
        self.player.xp = (self.player.xp + xp).max(-1);
        if let Some(msg) = self.player.check_level(&mut self.rng) {
            self.say(msg);
        }
        self.check_death();
    }
    pub fn check_death(&mut self) {
        if self.player.hp <= 0 {
            if self.player.reincarnate(&mut self.rng) {
                self.say("You are reincarnated, weakened and stripped of your equipment.");
                self.teleport_position(true);
                self.phase = Phase::Exploring;
                self.initialize_level();
                self.reveal();
            } else {
                self.player.hp = 0;
                self.phase = Phase::Dead;
                self.say("You have died. Your adventure is over.");
            }
        }
    }
    /// Returns true when damage ended this life, including reincarnation.
    pub fn hurt(&mut self, damage: i32) -> bool {
        let n = damage.max(0);
        self.player.hp -= n;
        self.say(format!("You suffer {n} damage."));
        let died = self.player.hp <= 0;
        self.check_death();
        died
    }
    pub fn hazard(&mut self, scale: f64) -> bool {
        let n = crate::room_effects::hazard_damage(
            self.player.class.index(),
            scale as i32,
            &mut self.rng,
        );
        self.hurt(n)
    }
    pub fn tick(&mut self) {
        self.turns += 1;
        self.player.tick(&mut self.rng);
    }
    pub fn initialize_level(&mut self) {
        let z = self.pos.z as usize;
        if self.world().initialized[z] {
            return;
        }
        for i in z * 400..(z + 1) * 400 {
            let mut bits = 0;
            if self.rng.chance(0.4) {
                bits = if self.rng.chance(0.5) {
                    if self.rng.chance(0.5) {
                        if self.rng.chance(0.05) { 7 } else { 3 }
                    } else {
                        1
                    }
                } else if self.rng.chance(0.2) {
                    6
                } else {
                    2
                };
            }
            self.world_mut().contents[i] = bits;
        }
        self.world_mut().initialized[z] = true;
    }
    pub fn reveal(&mut self) {
        let i = self.pos.index();
        self.world_mut().visited[i] = true;
        let mut frontier = vec![self.pos];
        let radius = if self.player.active(LIGHT) { 2 } else { 1 };
        for _ in 0..radius {
            let mut next = vec![];
            for p in frontier {
                for d in Direction::ALL {
                    let edge = self.dungeon.edge(p, d);
                    if edge == Edge::Secret
                        && (self.player.active(LIGHT) || self.rng.chance(0.15))
                        && let Some((q, bit)) = self.edge_key(p, d)
                    {
                        self.world_mut().secrets[q.index()] |= bit;
                    }
                    if self.passable(p, d)
                        && let Some(q) = p.step(d)
                    {
                        self.world_mut().visited[q.index()] = true;
                        next.push(q);
                    }
                }
            }
            frontier = next;
        }
    }
    pub fn edge_key(&self, p: Pos, d: Direction) -> Option<(Pos, u8)> {
        match d {
            Direction::North => Some((p, 2)),
            Direction::West => Some((p, 1)),
            Direction::East => p.step(d).map(|p| (p, 1)),
            Direction::South => p.step(d).map(|p| (p, 2)),
        }
    }
    pub fn passable(&self, p: Pos, d: Direction) -> bool {
        match self.dungeon.edge(p, d) {
            Edge::Wall => false,
            Edge::Secret => self
                .edge_key(p, d)
                .is_some_and(|(q, b)| self.world().secrets[q.index()] & b != 0),
            _ => true,
        }
    }
    pub fn enter(&mut self) {
        self.player.restore();
        self.player.reset_recovery(&mut self.rng);
        self.pos = self.dungeon.entrance();
        self.phase = Phase::Exploring;
        self.initialize_level();
        let i = self.pos.index();
        self.world_mut().contents[i] = 0;
        self.say(format!(
            "You enter {}. Stay close to the entrance at first.",
            self.dungeon.name()
        ));
        self.reveal();
    }
    pub fn leave(&mut self) {
        let gold = self.player.gold;
        let xp = self.player.treasure_xp;
        self.player.bank += gold;
        self.player.gold = 0;
        self.player.treasure_xp = 0;
        self.say(format!(
            "You escape with {gold} gold and earn {xp} treasure experience."
        ));
        self.gain_xp(xp);
        self.player.restore();
        self.pos = self.dungeon.entrance();
        // Repopulate rooms on a fresh expedition; keep map memory and consumed specials.
        self.world_mut().initialized.fill(false);
        if self.player.orb {
            self.player.immortal = true;
            self.phase = Phase::Won;
            self.say("You returned with the Orb! The gods grant you immortality.");
        } else {
            self.phase = Phase::Town;
        }
    }
    pub fn move_player(&mut self, d: Direction, pass_wall: bool) {
        if !pass_wall && !self.passable(self.pos, d) {
            self.say("A wall blocks the way. Search may reveal a secret door.");
            return;
        }
        match self.pos.step(d) {
            None => {
                if self.pos.z == 0 {
                    self.leave();
                } else {
                    self.say("Only solid stone lies beyond the dungeon.");
                }
            }
            Some(p) => {
                self.tick();
                self.pos = p;
                self.say(format!("You move {}.", d.name()));
                self.arrive(true);
            }
        }
    }
    /// Resolve compulsory terrain iteratively, with a bound on teleporter chains.
    pub fn arrive(&mut self, wandering: bool) {
        self.phase = Phase::Exploring;
        for _ in 0..64 {
            self.initialize_level();
            self.reveal();
            match self.feature() {
                Feature::Teleporter => {
                    self.say("A teleporter flashes. Space twists around you!");
                    if !self.teleport_spell() {
                        return;
                    }
                    continue;
                }
                Feature::Djinn => {
                    self.say("A djinn appears and transports you elsewhere!");
                    let dungeon = self.dungeon;
                    let index = self.world_index();
                    let cleared = &self.worlds[index].cleared;
                    self.pos =
                        crate::room_effects::djinn_destination(self.pos, &mut self.rng, |p| {
                            !cleared[p.index()] && dungeon.cell(p).feature() == Feature::Djinn
                        });
                    continue;
                }
                Feature::Elevator if !self.player.orb && !self.player.active(TIME_STOP) => {
                    if self.pos.z == 0 {
                        self.leave();
                        return;
                    }
                    self.pos.z -= 1;
                    self.say("The elevator carries you up a level.");
                    continue;
                }
                Feature::Pit if !crate::room_effects::avoids_pit(&self.player, &mut self.rng) => {
                    self.say("You fall into a pit!");
                    if self.pos.z == 19 {
                        self.hurt(self.player.hp);
                        return;
                    }
                    if self.hazard(self.depth() as f64) {
                        return;
                    }
                    if !matches!(self.phase, Phase::Exploring) {
                        return;
                    }
                    self.pos.z += 1;
                    continue;
                }
                _ => {}
            }
            let i = self.pos.index();
            if wandering
                && self.rng.chance(if self.player.active(SILENCE) {
                    0.03
                } else if self.player.orb {
                    0.45
                } else {
                    0.1
                })
            {
                self.world_mut().contents[i] |= 1;
            }
            let bits = self.world().contents[i];
            if bits & 1 != 0 {
                self.world_mut().contents[i] &= !1;
                if !(self.player.active(TIME_STOP)
                    || (self.player.active(INVISIBLE) && self.rng.chance(0.7))
                    || self.rng.chance(self.player.boots as f64 / 30.0))
                {
                    self.start_combat(false);
                    return;
                }
                self.say("A monster passes without seeing you.");
            }
            self.after_combat();
            return;
        }
        self.say("The magic subsides. You regain control.");
        self.phase = Phase::Exploring;
        self.reveal();
    }
    /// False means the original teleport carried the character outside the dungeon.
    pub fn teleport_spell(&mut self) -> bool {
        let [x, y, depth] = crate::spells::teleport_destination(self.depth(), &mut self.rng);
        if !(1..=20).contains(&depth) {
            self.leave();
            return false;
        }
        self.pos = Pos::new((x - 1) as u8, (y - 1) as u8, (depth - 1) as u8);
        true
    }
    pub fn teleport_position(&mut self, random: bool) {
        if random {
            self.pos = Pos::new(
                (self.rng.die(20) - 1) as u8,
                (self.rng.die(20) - 1) as u8,
                (self.rng.die(20) - 1) as u8,
            );
        } else {
            let mut x = self.pos.y as i32 + 1;
            let mut y = self.pos.x as i32 + 1;
            let z = (self.depth() + if (x + y) % 2 == 0 { -1 } else { 1 }).clamp(1, 20);
            x += z * 7 + y * 13;
            y += z * 6 + x * 17;
            self.pos = Pos::new(((y - 1) % 20) as u8, ((x - 1) % 20) as u8, (z - 1) as u8);
        }
    }
    pub fn after_combat(&mut self) {
        if matches!(self.phase, Phase::Dead | Phase::Town | Phase::Won) {
            return;
        }
        self.phase = Phase::Exploring;
        let i = self.pos.index();
        let bits = self.world().contents[i];
        if bits & 2 != 0 {
            self.world_mut().contents[i] = 0;
            let loot = self.roll_loot(bits & 4 != 0);
            self.say(format!("You find {}.", loot.name()));
            self.phase = Phase::Treasure(loot);
            return;
        }
        self.offer_feature();
    }
    pub fn offer_feature(&mut self) {
        let f = self.feature();
        self.phase = Phase::Exploring;
        match f {
            Feature::Empty => {}
            Feature::Dragon => {
                self.start_combat(true);
            }
            Feature::Orb => {
                self.say("You have found the Orb of Zot! Take it and return to the surface.");
                self.phase = Phase::Treasure(Loot::Orb);
            }
            Feature::Fountain => {
                self.fountain_color = self.rng.die(8) as u8;
                self.say(format!(
                    "A fountain flows with {} water.",
                    [
                        "white",
                        "green",
                        "blue",
                        "red",
                        "yellow",
                        "black",
                        "crystal clear",
                        "shimmering"
                    ][self.fountain_color as usize - 1]
                ));
                self.phase = Phase::Choice(f);
            }
            Feature::Teleporter | Feature::Djinn => self.say("Magic swirls around you."),
            Feature::Elevator => {
                self.say("The elevator is motionless while the Orb or stopped time binds it.")
            }
            _ => {
                self.say(match f {
                    Feature::Down => "A stairway leads down.",
                    Feature::Up => "A stairway leads up.",
                    Feature::Stairs => "A spiral stairway leads up and down.",
                    Feature::Transporter => "The Excelsior Transporter awaits a destination.",
                    Feature::Pit => "You stand at the edge of a pit.",
                    Feature::Altar => "An ancient holy altar stands before you.",
                    Feature::Mirror => "A strange mirror reflects the torchlight.",
                    Feature::Throne => "A throne is covered in jewels and mysterious runes.",
                    Feature::Trove => "A locked trove has red, green, blue and orange lights.",
                    _ => "",
                });
                self.phase = Phase::Choice(f);
            }
        }
    }
    pub fn start_combat(&mut self, boss: bool) {
        let depth = self.depth();
        let kind = if boss {
            14
        } else {
            (self.rng.die(15) - 1) as usize
        };
        let level = if boss {
            depth + self.rng.die(20)
        } else {
            self.rng.die(depth * 3 / 2)
        };
        let mut m = Monster::generate(kind, level, &mut self.rng);
        m.boss = boss;
        // DOS initializes helplessness from the remaining Time Stop duration.
        m.held = (self.player.effects[TIME_STOP].saturating_mul(10) - self.rng.die(10) + 1).max(0);
        self.say(format!("A level {} {} attacks!", m.level, m.name));
        self.phase = Phase::Combat(m);
        if !self.player.active(TIME_STOP)
            && self.rng.die(20)
                < (self.player.stats[1] + self.player.stats[4]) / 2
                    + self.player.boots
                    + self.player.level
                    - level
        {
            self.monster_attack();
        }
    }
    pub fn fight(&mut self) {
        let Phase::Combat(mut m) = self.phase.clone() else {
            return;
        };
        self.turns += 1;
        let attack = crate::combat::player_attack(&self.player, &m, &mut self.rng);
        if attack.hit {
            m.hp -= attack.damage;
            if attack.damage > 0 && m.hp > 0 && m.held > 0 {
                m.held -= 1;
            }
            self.say(format!("Your weapon deals {} damage.", attack.damage));
        } else {
            self.say("You miss.");
        }
        self.phase = Phase::Combat(m);
        if !self.resolve_kill() {
            self.monster_attack();
        }
    }
    pub fn resolve_kill(&mut self) -> bool {
        let Phase::Combat(m) = self.phase.clone() else {
            return false;
        };
        if m.hp > 0 {
            return false;
        }
        let xp = ((m.die() * m.level + m.strength * m.armor) * 10 / self.player.level) as i64;
        self.say(format!("The {} falls. You earn {xp} experience.", m.name));
        if m.boss {
            self.clear_feature();
            let i = self.pos.index();
            self.world_mut().contents[i] |= 2;
        }
        self.phase = Phase::Exploring;
        self.gain_xp(xp);
        self.after_combat();
        true
    }
    pub fn monster_attack(&mut self) {
        let Phase::Combat(m) = self.phase.clone() else {
            return;
        };
        if m.held > 0 {
            self.say("The monster is helpless.");
            self.phase = Phase::Combat(m);
            return;
        }
        // Avoid recursive charm attacks. A lost action is represented by another attack.
        for _ in 0..8 {
            let attack = crate::combat::monster_attack(&self.player, &m, &mut self.rng);
            if attack.hit {
                self.hurt(attack.damage);
                if !matches!(self.phase, Phase::Combat(_)) {
                    return;
                }
            } else {
                self.say("The monster misses.");
            }
            if (m.kind == 7
                && self.rng.chance(0.25)
                && self.rng.die(20) >= self.player.stats[1] + self.player.level - m.level)
                || (m.kind == 4
                    && self.rng.chance(0.33)
                    && self.rng.die(20) >= self.player.stats[2] + self.player.level - m.level)
            {
                self.say("You lose a moment to the creature's enchantment!");
                continue;
            }
            break;
        }
        self.phase = Phase::Combat(m);
    }
    pub fn evade(&mut self) {
        let Phase::Combat(m) = self.phase.clone() else {
            return;
        };
        self.turns += 1;
        let exits: Vec<_> = Direction::ALL
            .into_iter()
            .filter(|&d| {
                self.passable(self.pos, d) && (self.pos.step(d).is_some() || self.pos.z == 0)
            })
            .collect();
        if exits.is_empty() {
            self.say("There is nowhere to evade!");
            self.monster_attack();
            return;
        }
        if crate::combat::can_evade(self.player.stats[4], self.player.boots, &mut self.rng) {
            let d = exits[(self.rng.die(exits.len() as i32) - 1) as usize];
            self.say("You escape the monster!");
            let i = self.pos.index();
            if !m.boss {
                self.world_mut().contents[i] |= 1;
            }
            self.phase = Phase::Exploring;
            self.move_player(d, false);
        } else {
            self.say("You cannot get away!");
            self.monster_attack();
        }
    }
    pub fn roll_loot(&mut self, trapped: bool) -> Loot {
        let r = self.rng.die(100);
        let d = self.depth() as f64;
        let u = self.rng.unit();
        let (label, amount, chest) = match r {
            1..=30 => ("Silver", 100.0 * u * d + 10.0, false),
            31..=40 => ("Gold", 500.0 * u * d + 50.0, false),
            41..=60 => ("Platinum", 1000.0 * u * d + 100.0, false),
            61..=72 => ("Gems", 500.0 * u.sqrt() * d + 150.0, false),
            73..=80 => ("Jewels", 6000.0 * u.powi(3) * d + 500.0, false),
            81..=90 => ("Chest", 3000.0 * u * d + 500.0, true),
            _ => {
                let kind = (self.rng.die(9) - 1) as u8;
                return Loot::Item {
                    kind,
                    power: (u.powi(3) * d + 1.0) as i32,
                };
            }
        };
        Loot::Gold {
            amount: amount as i64,
            label: label.into(),
            trapped,
            chest,
        }
    }
    pub fn take_loot(&mut self, take: bool) {
        let Phase::Treasure(loot) = self.phase.clone() else {
            return;
        };
        self.phase = Phase::Exploring;
        if take {
            match loot {
                Loot::Gold {
                    amount,
                    trapped,
                    chest,
                    ..
                } => {
                    if trapped && (!chest || self.rng.chance(0.5)) {
                        self.say("A trap springs!");
                        if self.hazard(if chest {
                            self.depth() as f64 + 5.0
                        } else {
                            self.depth() as f64 / 1.2
                        }) {
                            return;
                        }
                    }
                    if matches!(self.phase, Phase::Exploring) {
                        self.player.gain_gold(amount, self.depth());
                        self.say(format!("You collect {amount} gold."));
                    }
                }
                Loot::Orb => {
                    self.player.orb = true;
                    self.clear_feature();
                    self.say("You carry the Orb. Return to the surface to claim immortality!");
                }
                Loot::Item { kind, power } => self.apply_item(kind, power),
            }
        } else {
            self.say("You leave it behind.");
        }
        if matches!(self.phase, Phase::Exploring) {
            self.offer_feature_after_loot();
        }
    }
    fn offer_feature_after_loot(&mut self) {
        if self.feature() == Feature::Orb {
            self.phase = Phase::Exploring;
        } else {
            self.offer_feature();
        }
    }
    pub fn apply_item(&mut self, kind: u8, power: i32) {
        match kind {
            0 => {
                if self.rng.chance(0.167) {
                    self.say("The weapon is hostile!");
                    self.hazard(self.player.weapon as f64);
                } else if self.player.weapon <= self.depth() {
                    self.player.weapon += 1;
                }
            }
            1 => {
                if self.player.armor < self.depth() + 2 {
                    self.player.armor += 1;
                }
            }
            2 => {
                if self.player.class != Class::Magician {
                    if self.player.shield < self.depth() + 2 {
                        self.player.shield += 1;
                    }
                } else {
                    self.say("Magicians cannot use shields.");
                }
            }
            3 => self.book(self.depth()),
            4 => {
                let n = self.rng.dice(3, 10);
                self.player.effects[LIGHT] = self.player.effects[LIGHT].saturating_add(n);
            }
            5 => self.player.ring = self.player.ring.max(power),
            6 => self.player.cloak = self.player.cloak.max(power),
            7 => self.player.boots = self.player.boots.max(power),
            _ => {
                self.player.wand += power * 3;
                self.say("The wand holds magic spell charges.");
            }
        }
    }
    pub fn book(&mut self, depth: i32) {
        if self.rng.chance(0.5) {
            let n =
                self.rng.die(500) as i64 * depth as i64 * if self.rng.chance(0.5) { 1 } else { -1 };
            self.say(format!("Your experience changes by {n}."));
            self.gain_xp(n);
        } else {
            self.change_stat(depth);
        }
    }
    pub fn change_stat(&mut self, depth: i32) {
        let i = (self.rng.die(6) - 1) as usize;
        let sign = if self.rng.chance(0.5) { 1 } else { -1 };
        let mut n = 1;
        while n < 18 && self.rng.unit() + depth as f64 * 0.02 > 0.9 {
            n += 1;
        }
        self.player.stats[i] = (self.player.stats[i] + sign * n).clamp(1, 18);
        self.say(format!(
            "Your {} is now {}.",
            STAT_NAMES[i], self.player.stats[i]
        ));
    }
    pub fn stairs(&mut self, down: bool) {
        let f = self.feature();
        if !(if down {
            matches!(f, Feature::Down | Feature::Stairs | Feature::Pit)
        } else {
            matches!(f, Feature::Up | Feature::Stairs)
        }) {
            self.say("There are no stairs in that direction.");
            return;
        }
        if down && self.pos.z == 19 {
            self.say("The way down is blocked.");
            return;
        }
        self.tick();
        if !down && self.pos.z == 0 {
            self.leave();
            return;
        }
        self.pos.z = if down { self.pos.z + 1 } else { self.pos.z - 1 };
        self.say(if down {
            "You descend one level."
        } else {
            "You climb one level."
        });
        self.arrive(true);
    }
    pub fn choice(&mut self, input: &str) {
        let f = self.feature();
        if matches!(input, "i" | "ignore" | "s" | "stay" | "no" | "n") {
            self.phase = Phase::Exploring;
            self.say("You leave it alone.");
            return;
        }
        match f {
            Feature::Down | Feature::Up | Feature::Stairs | Feature::Pit => match input {
                "up" | "u" | "9" => self.stairs(false),
                "down" | "d" | "3" => self.stairs(true),
                _ => self.say("Choose up, down, or ignore."),
            },
            Feature::Fountain if matches!(input, "drink" | "y" | "yes" | "") => {
                self.turns += 1;
                self.phase = Phase::Exploring;
                let depth = self.depth();
                let message = crate::room_effects::fountain(
                    &mut self.player,
                    self.fountain_color as i32,
                    depth,
                    &mut self.rng,
                );
                self.say(message);
                self.check_death();
            }
            Feature::Transporter => {
                let Ok(level) = input.parse::<u8>() else {
                    self.say("Choose a level from 1 to 20, or ignore.");
                    return;
                };
                if !(1..=20).contains(&level) {
                    self.say("Choose a level from 1 to 20.");
                    return;
                }
                if self.player.orb || self.player.active(TIME_STOP) {
                    self.say("The transporter controls are dead.");
                    return;
                }
                let cost = ((self.depth() - level as i32).abs() + 1) as i64
                    * (self.depth() + level as i32) as i64
                    * 25
                    / 2;
                if self.player.gold < cost {
                    self.say(format!("That trip costs {cost} carried gold."));
                    return;
                }
                self.player.gold -= cost;
                self.tick();
                self.pos.z = level - 1;
                if let Some(i) = self
                    .dungeon
                    .bytes()
                    .iter()
                    .enumerate()
                    .skip(self.pos.z as usize * 400)
                    .take(400)
                    .find_map(|(i, &b)| if b >> 4 == 4 { Some(i) } else { None })
                {
                    self.pos.x = (i % 20) as u8;
                    self.pos.y = (i % 400 / 20) as u8;
                }
                self.say(format!("The transporter takes {cost} gold."));
                self.initialize_level();
                self.reveal();
                self.phase = Phase::Exploring;
            }
            Feature::Altar => self.altar(input),
            Feature::Throne => self.throne(input),
            Feature::Trove => self.trove(input),
            Feature::Mirror if matches!(input, "look" | "y" | "yes" | "") => {
                self.tick();
                self.phase = Phase::Exploring;
                match self.rng.die(5) {
                    1 => {
                        self.say("The mirror shatters!");
                        self.clear_feature();
                        self.hazard(self.depth() as f64);
                    }
                    2 => {
                        let n = self.rng.die(500) as i64 * self.depth() as i64;
                        self.player.gain_gold(n, self.depth());
                        self.say(format!("A leprechaun tosses you {n} gold!"));
                    }
                    3 => self.change_stat(self.depth()),
                    _ => self.say("A wild-eyed face stares back at you."),
                }
            }
            _ => self.say("That action does not apply here. Type help for choices."),
        }
    }
    fn altar(&mut self, input: &str) {
        self.phase = Phase::Exploring;
        if input == "desecrate" {
            self.tick();
            if self.rng.chance(0.25) {
                self.say("Thunder rolls. The altar crumbles!");
                self.clear_feature();
                if self.rng.chance(0.15) {
                    self.start_combat(true);
                }
            } else {
                self.say("Nothing happens.");
            }
            return;
        }
        if input == "worship" || input == "pray" {
            self.tick();
            if self.rng.chance(0.4) {
                self.say("Your prayer angers the altar's guardian.");
                self.start_combat(false);
            } else {
                self.say("Silence follows your prayer.");
            }
            return;
        }
        if let Some(amount) = input
            .strip_prefix("give ")
            .and_then(|s| s.parse::<i64>().ok())
        {
            if amount < 50 || amount > self.player.gold {
                self.say("Give at least 50 gold, up to the amount you carry.");
                self.phase = Phase::Choice(Feature::Altar);
                return;
            }
            self.tick();
            self.player.gold -= amount;
            if self.rng.chance(0.1) {
                self.book(self.depth());
            } else if self.rng.chance(0.5) {
                let e = (self.rng.unit().powi(2) * 11.0) as usize;
                let n = self.rng.die(20)
                    + (self.rng.unit() * amount as f64 / (self.player.gold + 1) as f64 * 20.0)
                        as i32;
                self.player.effects[e] = self.player.effects[e].saturating_add(n);
                self.say(format!("You receive {} for {n} turns.", EFFECT_NAMES[e]));
            } else {
                self.say("Your offering is accepted.");
            }
        } else {
            self.phase = Phase::Choice(Feature::Altar);
            self.say("Choose worship, give AMOUNT, desecrate, or ignore.");
        }
    }
    fn throne(&mut self, input: &str) {
        if !matches!(input, "sit" | "pry" | "read") {
            self.say("Choose sit, pry, read, or ignore.");
            return;
        }
        self.tick();
        self.phase = Phase::Exploring;
        match input {
            "sit" => {
                if self.rng.chance(0.05) {
                    self.say("A gong sounds!");
                    self.player.xp = experience(self.player.class, self.player.level + 1);
                    self.gain_xp(0);
                } else if self.rng.chance(0.1) {
                    self.teleport_position(false);
                    self.arrive(false);
                } else if self.rng.chance(0.1) {
                    self.dwarf_king();
                } else {
                    self.say("Nothing happens.");
                }
            }
            "pry" => {
                if self.rng.chance(0.1) {
                    self.dwarf_king();
                } else if self.rng.chance(0.3) {
                    let n = (6000.0 * self.rng.unit().powi(2) * self.depth() as f64 + 500.0) as i64;
                    self.player.gain_gold(n, self.depth());
                    self.say(format!("Jewels worth {n} gold come free!"));
                } else {
                    self.say("The jewels will not come loose.");
                }
            }
            _ => {
                if self.rng.chance(0.1) {
                    if self.rng.chance(0.5) {
                        self.dwarf_king();
                    } else {
                        self.change_stat(self.depth());
                    }
                } else {
                    self.say("You cannot decipher the runes.");
                }
            }
        }
    }
    fn dwarf_king(&mut self) {
        self.say("The Dwarven King returns!");
        let level = self.depth() + 10 + self.rng.die(6);
        let hp = self.rng.dice(level, 5);
        self.phase = Phase::Combat(Monster {
            kind: 3,
            name: "Dwarven King".into(),
            level,
            hp,
            max_hp: hp,
            strength: self.rng.die(5) + 5,
            armor: self.rng.die(level),
            held: 0,
            boss: false,
        });
    }
    fn trove(&mut self, input: &str) {
        let colors: Vec<_> = input.chars().filter(|c| !c.is_whitespace()).collect();
        if colors.len() != 2 || colors.iter().any(|c| !"rgbo".contains(*c)) {
            self.say("Enter two colors: r, g, b, o (for example rg), or ignore.");
            return;
        }
        let i = self.pos.index();
        if self.world().combinations[i] == 255 {
            let combo = (self.rng.die(16) - 1) as u8;
            self.world_mut().combinations[i] = combo;
        }
        let guess = ("rgbo".find(colors[0]).unwrap() * 4 + "rgbo".find(colors[1]).unwrap()) as u8;
        self.tick();
        if guess == self.world().combinations[i] {
            let n = (5000.0 * self.rng.unit() * self.depth() as f64 + 1000.0) as i64;
            self.player.gain_gold(n, self.depth());
            self.say(format!("The trove opens! You collect {n} gold."));
            self.clear_feature();
            self.phase = Phase::Exploring;
        } else {
            self.say("An electric shock jolts your body!");
            self.hazard((self.depth() * 2) as f64);
        }
    }
    pub fn buy(&mut self, item: &str, power: i32) {
        if self.phase != Phase::Town {
            self.say("The store is available between expeditions.");
            return;
        }
        if !(1..=20).contains(&power) {
            self.say("Choose a quality from 1 to 20.");
            return;
        }
        let (price, current) = match item {
            "weapon" => (7500, self.player.weapon),
            "armor" => (5000, self.player.armor),
            "shield" if self.player.class != Class::Magician => (8000, self.player.shield),
            "boots" => (7000, self.player.boots),
            "cloak" => (5000, self.player.cloak),
            "ring" => (10000, self.player.ring),
            "book" => (3000, 0),
            "map" => (50000, 0),
            _ => {
                self.say("Choose weapon, armor, shield, boots, cloak, ring, book, or map. Magicians cannot use shields.");
                return;
            }
        };
        if power <= current {
            self.say("You already have equipment at least that good.");
            return;
        }
        let cost = (power - current) as i64 * price;
        if self.player.bank < cost {
            self.say(format!("You need {cost} banked gold."));
            return;
        }
        self.player.bank -= cost;
        match item {
            "weapon" => self.player.weapon = power,
            "armor" => self.player.armor = power,
            "shield" => self.player.shield = power,
            "boots" => self.player.boots = power,
            "cloak" => self.player.cloak = power,
            "ring" => self.player.ring = power,
            "book" => self.book(power),
            "map" => {
                let start = (power as usize - 1) * 400;
                self.world_mut().purchased_maps[power as usize - 1] = true;
                self.world_mut().visited[start..start + 400].fill(true);
                self.world_mut().secrets[start..start + 400].fill(3);
            }
            _ => {}
        }
        self.say(format!("Purchased {item} {power} for {cost} gold."));
    }
    pub fn command(&mut self, input: &str) {
        let text = input.trim().to_lowercase();
        let mut parts = text.split_whitespace();
        let cmd = parts.next().unwrap_or("");
        if matches!(
            cmd,
            "help" | "h" | "0" | "?" | "status" | "map" | "spells" | "save" | "quit" | "q"
        ) {
            return;
        }
        match self.phase.clone() {
            Phase::Dead => {
                self.say("This character has died. Start a new game from the title screen.")
            }
            Phase::Won => {
                if cmd == "continue" || cmd == "enter" {
                    self.player.orb = false;
                    self.phase = Phase::Town;
                    self.say("You may continue your adventures as an immortal.");
                }
            }
            Phase::Town => match cmd {
                "enter" | "e" | "" => self.enter(),
                "buy" => {
                    let item = parts.next().unwrap_or("");
                    if let Some(n) = parts.next().and_then(|s| s.parse().ok()) {
                        self.buy(item, n);
                    } else {
                        self.say("Use buy ITEM QUALITY, for example buy ring 1.");
                    }
                }
                "travel" => {
                    if let Some(d) = parts.next().and_then(Dungeon::parse) {
                        if d != self.dungeon {
                            let cost = self.player.level as i64 * 1000;
                            if self.player.bank >= cost {
                                self.player.bank -= cost;
                                self.dungeon = d;
                                self.pos = d.entrance();
                                self.say(format!("You travel to {} for {cost} gold.", d.name()));
                            } else {
                                self.say(format!("Travel costs {cost} banked gold."));
                            }
                        }
                    } else {
                        self.say(
                            "Travel destinations: telengard, shvenk, lamorte, warren, cavern.",
                        );
                    }
                }
                _ => self.say("Enter to explore, buy ITEM QUALITY, or travel DUNGEON."),
            },
            Phase::Combat(_) => match cmd {
                "fight" | "f" | "1" | "" => self.fight(),
                "evade" | "e" | "7" => self.evade(),
                "cast" | "c" | "-" => self.cast_command(&mut parts),
                _ => self.say("Fight, evade, or cast TIER NUMBER."),
            },
            Phase::Treasure(_) => match cmd {
                "take" | "open" | "yes" | "y" | "" => self.take_loot(true),
                "ignore" | "leave" | "no" | "n" | "i" => self.take_loot(false),
                _ => self.say("Take the treasure, or ignore it."),
            },
            Phase::Choice(_) => {
                if matches!(cmd, "cast" | "c") {
                    self.cast_command(&mut parts);
                } else {
                    self.choice(&text);
                }
            }
            Phase::Exploring => {
                if let Some(d) = Direction::parse(cmd) {
                    self.move_player(d, false);
                    return;
                }
                match cmd {
                    "up" | "u" | "9" => self.stairs(false),
                    "down" | "3" => self.stairs(true),
                    "cast" | "c" | "-" => self.cast_command(&mut parts),
                    "wait" | "s" | "5" | "" => {
                        self.tick();
                        self.arrive(true);
                    }
                    "search" => {
                        self.tick();
                        self.reveal();
                        self.say("You search the nearby walls.");
                        self.arrive(true);
                    }
                    "interact" | "use" => self.offer_feature(),
                    "pray" | "p" => {
                        self.tick();
                        self.player.gold = (self.player.gold as f64
                            * (1.0 - self.rng.unit() * self.rng.unit()))
                            as i64;
                        if self.rng.chance(0.25) {
                            let exhausted = self.player.stats[3] == 1;
                            self.player.stats[3] = (self.player.stats[3] - 1).max(1);
                            let died = self.hurt(if exhausted {
                                self.player.hp
                            } else {
                                (self.player.hp + 2) / 3
                            });
                            if !died && self.phase == Phase::Exploring {
                                self.teleport_position(true);
                                self.arrive(false);
                            }
                        } else {
                            self.say("The nameless god refuses your plea.");
                            self.hurt(1);
                        }
                    }
                    _ => self.say("Unknown command. Type help for controls."),
                }
            }
        }
    }
    fn cast_command<'a>(&mut self, parts: &mut impl Iterator<Item = &'a str>) {
        let tier = parts.next().and_then(|s| s.parse::<usize>().ok());
        let number = parts.next().and_then(|s| s.parse::<usize>().ok());
        if let (Some(t), Some(n)) = (tier, number) {
            self.cast(t, n, parts.next());
        } else {
            self.say("Use cast TIER NUMBER [direction]. Type spells for the spellbook.");
        }
    }
}
