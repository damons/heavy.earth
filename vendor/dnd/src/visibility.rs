//! Current surroundings: DOS 0a9f:066c–07f8 wall clipping and 0007 light checks.
use crate::{
    engine::{Game, Phase},
    player::LIGHT,
    rng::Rng,
    world::{Direction, Edge, Pos, SIZE},
};

/// Local coordinates are [column][row]; the player occupies [1][1].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct View {
    pub west: [[u8; 4]; 4],
    pub north: [[u8; 4]; 4],
    pub rooms: [[bool; 4]; 4],
}
impl View {
    pub fn clip(&mut self) {
        let Self {
            west: w,
            north: n,
            rooms: r,
        } = self;
        for i in 0..4 {
            w[i][3] = 0;
            n[3][i] = 0;
        }
        // Preserve the original order: later clipping checks use earlier results.
        if n[1][1] != 0 {
            n[0][0] = 0;
            n[1][0] = 0;
            n[2][0] = 0;
            w[1][0] = 0;
            w[2][0] = 0;
            r[1][0] = false;
            if w[1][1] != 0 || n[0][1] != 0 {
                r[0][0] = false;
            }
            if n[2][1] != 0 {
                r[2][0] = false;
            }
        }
        if w[1][1] != 0 {
            w[0][0] = 0;
            w[0][1] = 0;
            w[0][2] = 0;
            n[0][1] = 0;
            n[0][2] = 0;
            r[0][1] = false;
            if n[1][2] != 0 || w[1][2] != 0 {
                r[0][2] = false;
            }
            if w[1][0] != 0 {
                r[0][0] = false;
            }
        }
        if n[1][2] != 0 {
            n[0][3] = 0;
            n[1][3] = 0;
            n[2][3] = 0;
            w[1][2] = 0;
            w[2][2] = 0;
            r[1][2] = false;
            if w[2][1] != 0 || n[2][2] != 0 {
                r[2][2] = false;
            }
            if n[0][2] != 0 {
                r[0][2] = false;
            }
        }
        if w[2][1] != 0 {
            w[3][0] = 0;
            w[3][1] = 0;
            w[3][2] = 0;
            n[2][1] = 0;
            n[2][2] = 0;
            r[2][1] = false;
            if n[1][1] != 0 || w[2][0] != 0 {
                r[2][0] = false;
            }
            if w[2][2] != 0 {
                r[2][2] = false;
            }
        }
        if w[1][0] != 0 {
            n[0][0] = 0;
        }
        if w[2][0] != 0 {
            n[2][0] = 0;
        }
        if w[1][2] != 0 {
            n[0][3] = 0;
        }
        if w[2][2] != 0 {
            n[2][3] = 0;
        }
        if n[0][1] != 0 {
            w[0][0] = 0;
            if w[1][0] != 0 {
                r[0][0] = false;
            }
        }
        if n[0][2] != 0 {
            w[0][2] = 0;
            if w[1][2] != 0 {
                r[0][2] = false;
            }
        }
        if n[2][1] != 0 {
            w[3][0] = 0;
            if w[2][0] != 0 {
                r[2][0] = false;
            }
        }
        if n[2][2] != 0 {
            w[3][2] = 0;
            if w[2][2] != 0 {
                r[2][2] = false;
            }
        }
    }
}
fn bits(edge: Edge) -> u8 {
    match edge {
        Edge::Open => 0,
        Edge::Wall => 1,
        Edge::Door => 2,
        Edge::Secret => 3,
    }
}
pub fn local_position(g: &Game, x: usize, y: usize) -> Option<Pos> {
    let x = i32::from(g.pos.x) + x as i32 - 1;
    let y = i32::from(g.pos.y) + y as i32 - 1;
    if !(0..SIZE as i32).contains(&x) || !(0..SIZE as i32).contains(&y) {
        None
    } else {
        Some(Pos::new(x as u8, y as u8, g.pos.z))
    }
}
pub fn current(g: &Game) -> View {
    let mut view = View {
        west: [[0; 4]; 4],
        north: [[0; 4]; 4],
        rooms: [[false; 4]; 4],
    };
    if matches!(g.phase, Phase::Town | Phase::Won) {
        return view;
    }
    for x in 0..4 {
        for y in 0..4 {
            if let Some(p) = local_position(g, x, y) {
                view.west[x][y] = bits(g.dungeon.edge(p, Direction::West));
                view.north[x][y] = bits(g.dungeon.edge(p, Direction::North));
                view.rooms[x][y] = x < 3 && y < 3;
            } else {
                // Boundaries on the eastern/southern edge have no room of their own.
                if x > 0
                    && let Some(p) = local_position(g, x - 1, y)
                {
                    view.west[x][y] = bits(g.dungeon.edge(p, Direction::East));
                }
                if y > 0
                    && let Some(p) = local_position(g, x, y - 1)
                {
                    view.north[x][y] = bits(g.dungeon.edge(p, Direction::South));
                }
            }
        }
    }
    view.clip();
    view
}
/// The original helper always makes both percentage draws, even for the center.
pub fn recognizes(light: i32, continual: bool, center: bool, rng: &mut Rng) -> bool {
    let bright = rng.chance(0.95);
    let ordinary = rng.chance(0.10);
    ((light > 50 || continual) && bright) || (light > 0 && ordinary) || center
}
pub fn room_glyph(g: &Game, p: Pos, rng: &mut Rng) -> &'static str {
    let center = p == g.pos;
    let recognized = recognizes(
        g.player.effects[LIGHT],
        g.player.continual_light,
        center,
        rng,
    );
    if center {
        return " @ ";
    }
    if !g.player.active(LIGHT) || g.world().cleared[p.index()] {
        return "   ";
    }
    let glyph = g.dungeon.cell(p).feature().glyph();
    if glyph == "   " || recognized {
        glyph
    } else {
        "???"
    }
}
