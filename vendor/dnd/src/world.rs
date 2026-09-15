use serde::{Deserialize, Serialize};

pub const SIZE: usize = 20;
pub const ROOMS: usize = SIZE * SIZE * SIZE;
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Dungeon {
    Telengard,
    Shvenk,
    Lamorte,
    Warren,
    Cavern,
}
impl Dungeon {
    pub const ALL: [Self; 5] = [
        Self::Telengard,
        Self::Shvenk,
        Self::Lamorte,
        Self::Warren,
        Self::Cavern,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Telengard => "Telengard",
            Self::Shvenk => "Shvenk's Lair",
            Self::Lamorte => "Lamorte",
            Self::Warren => "The Warren",
            Self::Cavern => "The Cavern",
        }
    }
    pub fn file(self) -> &'static str {
        match self {
            Self::Telengard => "TELENARD",
            Self::Shvenk => "SHVENK",
            Self::Lamorte => "LAMORTE",
            Self::Warren => "WARREN",
            Self::Cavern => "CAVERN",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "t" | "telengard" | "1" => Some(Self::Telengard),
            "s" | "shvenk" | "2" => Some(Self::Shvenk),
            "l" | "lamorte" | "3" => Some(Self::Lamorte),
            "w" | "warren" | "4" => Some(Self::Warren),
            "c" | "cavern" | "5" => Some(Self::Cavern),
            _ => None,
        }
    }
    pub fn bytes(self) -> &'static [u8; ROOMS] {
        match self {
            Self::Telengard => include_bytes!("../assets/dungeons/TELENARD.BIN"),
            Self::Shvenk => include_bytes!("../assets/dungeons/SHVENK.BIN"),
            Self::Lamorte => include_bytes!("../assets/dungeons/LAMORTE.BIN"),
            Self::Warren => include_bytes!("../assets/dungeons/WARREN.BIN"),
            Self::Cavern => include_bytes!("../assets/dungeons/CAVERN.BIN"),
        }
    }
    // Coordinates are zero based (column, row). See docs/REVERSE_ENGINEERING.md.
    pub fn entrance(self) -> Pos {
        match self {
            Self::Telengard => Pos::new(0, 14, 0),
            Self::Lamorte => Pos::new(0, 17, 0),
            Self::Shvenk => Pos::new(4, 4, 0),
            Self::Warren => Pos::new(11, 10, 0),
            Self::Cavern => Pos::new(4, 14, 0),
        }
    }
    pub fn cell(self, p: Pos) -> Cell {
        Cell(self.bytes()[p.index()])
    }
    pub fn edge(self, p: Pos, d: Direction) -> Edge {
        match d {
            Direction::North => self.cell(p).north(),
            Direction::West => self.cell(p).west(),
            Direction::East => p.step(d).map(|q| self.cell(q).west()).unwrap_or(Edge::Wall),
            Direction::South => p
                .step(d)
                .map(|q| self.cell(q).north())
                .unwrap_or(Edge::Wall),
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pos {
    pub x: u8,
    pub y: u8,
    pub z: u8,
}
impl Pos {
    pub const fn new(x: u8, y: u8, z: u8) -> Self {
        Self { x, y, z }
    }
    pub fn index(self) -> usize {
        self.z as usize * 400 + self.y as usize * 20 + self.x as usize
    }
    pub fn valid(self) -> bool {
        self.x < 20 && self.y < 20 && self.z < 20
    }
    pub fn step(self, d: Direction) -> Option<Self> {
        let (dx, dy) = d.delta();
        let x = self.x as i32 + dx;
        let y = self.y as i32 + dy;
        if (0..20).contains(&x) && (0..20).contains(&y) {
            Some(Self::new(x as u8, y as u8, self.z))
        } else {
            None
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    North,
    East,
    South,
    West,
}
impl Direction {
    pub const ALL: [Self; 4] = [Self::North, Self::East, Self::South, Self::West];
    pub fn delta(self) -> (i32, i32) {
        match self {
            Self::North => (0, -1),
            Self::East => (1, 0),
            Self::South => (0, 1),
            Self::West => (-1, 0),
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "w" | "8" | "north" => Some(Self::North),
            "d" | "6" | "east" => Some(Self::East),
            "x" | "2" | "south" => Some(Self::South),
            "a" | "4" | "west" => Some(Self::West),
            _ => None,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::North => "north",
            Self::East => "east",
            Self::South => "south",
            Self::West => "west",
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Edge {
    Open,
    Wall,
    Door,
    Secret,
}
impl Edge {
    pub fn from_bits(b: u8) -> Self {
        match b & 3 {
            0 => Self::Open,
            1 => Self::Wall,
            2 => Self::Door,
            _ => Self::Secret,
        }
    }
}
#[derive(Debug, Clone, Copy)]
pub struct Cell(pub u8);
impl Cell {
    pub fn west(self) -> Edge {
        Edge::from_bits(self.0)
    }
    pub fn north(self) -> Edge {
        Edge::from_bits(self.0 >> 2)
    }
    pub fn feature(self) -> Feature {
        Feature::from_bits(self.0 >> 4)
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Feature {
    Empty,
    Down,
    Up,
    Stairs,
    Transporter,
    Pit,
    Teleporter,
    Fountain,
    Altar,
    Dragon,
    Orb,
    Mirror,
    Elevator,
    Throne,
    Trove,
    Djinn,
}
impl Feature {
    pub fn from_bits(b: u8) -> Self {
        use Feature::*;
        [
            Empty,
            Down,
            Up,
            Stairs,
            Transporter,
            Pit,
            Teleporter,
            Fountain,
            Altar,
            Dragon,
            Orb,
            Mirror,
            Elevator,
            Throne,
            Trove,
            Djinn,
        ][(b & 15) as usize]
    }
    pub fn glyph(self) -> &'static str {
        use Feature::*;
        match self {
            Empty => "   ",
            Down => " \\ ",
            Up => " / ",
            Stairs => "\\ /",
            Transporter => "EXC",
            Pit => "PIT",
            Teleporter => "TPT",
            Fountain => "FNT",
            Altar => "ALT",
            Dragon => "DGN",
            Orb => "ORB",
            Mirror => "MIR",
            Elevator => "ELV",
            Throne => "THR",
            Trove => "TRV",
            Djinn => "GNI",
        }
    }
}
