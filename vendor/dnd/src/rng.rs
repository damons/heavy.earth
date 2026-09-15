use serde::{Deserialize, Serialize};

/// DOS v1.2:1 runtime's 32-bit shift register. Legacy saves retain SplitMix64.
/// Untagged numeric saves are accepted solely for migration from version 1.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum Rng {
    Dos { dos: u32 },
    Legacy(u64),
}
impl Rng {
    pub fn new(seed: u64) -> Self {
        // Zero is an absorbing DOS state and cannot produce an accepted character.
        Self::Dos {
            dos: (seed as u32).max(1),
        }
    }
    pub fn state(&self) -> u64 {
        match *self {
            Self::Dos { dos } => dos as u64,
            Self::Legacy(s) => s,
        }
    }
    fn advance(&mut self) -> u64 {
        match self {
            Self::Dos { dos } => {
                for _ in 0..8 {
                    *dos = (*dos << 1) | ((*dos >> 31 ^ *dos >> 28) & 1);
                }
                *dos as u64
            }
            Self::Legacy(state) => {
                *state = state.wrapping_add(0x9e3779b97f4a7c15);
                let mut z = *state;
                z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
                z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
                z ^ (z >> 31)
            }
        }
    }
    pub fn next_15(&mut self) -> u16 {
        (self.advance() & 0x7fff) as u16
    }
    pub fn unit(&mut self) -> f64 {
        let legacy = matches!(self, Self::Legacy(_));
        let n = self.advance();
        if legacy {
            (n >> 11) as f64 / (1u64 << 53) as f64
        } else {
            (n & 0x7fffff) as f64 / 8388608.0
        }
    }
    pub fn chance(&mut self, p: f64) -> bool {
        if matches!(self, Self::Legacy(_)) {
            self.unit() < p
        } else {
            self.die(100) as f64 <= p * 100.0
        }
    }
    pub fn die(&mut self, sides: i32) -> i32 {
        self.dice(1, sides)
    }
    pub fn dice(&mut self, n: i32, sides: i32) -> i32 {
        if matches!(self, Self::Legacy(_)) {
            return if sides <= 0 {
                0
            } else {
                (0..n)
                    .map(|_| (self.unit() * sides as f64) as i32 + 1)
                    .sum()
            };
        }
        // 0f9f:0106: N times ONE roll, even when N is zero. No draw for D=0.
        if sides <= 0 {
            n
        } else {
            n * (1 + i32::from(self.next_15()) % sides)
        }
    }
}
