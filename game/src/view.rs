use dnd_rs::{
    engine::{Game, Phase},
    player, spells, visibility,
    world::{Direction, Edge, Feature, Pos, SIZE},
};
use serde_json::{Value, json};

fn edge(g: &Game, p: Pos, d: Direction) -> Value {
    let kind = match g.dungeon.edge(p, d) {
        Edge::Open => "open",
        Edge::Door => "door",
        Edge::Secret
            if g.edge_key(p, d)
                .is_some_and(|(q, b)| g.world().secrets[q.index()] & b != 0) =>
        {
            "secret"
        }
        _ => "wall",
    };
    json!({"x":p.x,"y":p.y,"direction":d.name(),"kind":kind})
}

/// Uses the exact terminal visibility traversal, including RNG-copy recognition.
/// No unseen rooms, secret-door locations, populations, or RNG are sent to the UI.
pub fn live_map(g: &Game) -> Value {
    let v = visibility::current(g);
    let mut rng = g.rng;
    let mut rooms = Vec::new();
    let mut edges = Vec::new();
    for y in 0..4 {
        for x in 0..4 {
            if let Some(p) = visibility::local_position(g, x, y) {
                if v.north[x][y] != 0 {
                    edges.push(edge(g, p, Direction::North));
                }
                if v.west[x][y] != 0 {
                    edges.push(edge(g, p, Direction::West));
                }
                if v.rooms[x][y] {
                    let glyph = visibility::room_glyph(g, p, &mut rng);
                    let feature = if p == g.pos {
                        format!("{:?}", g.feature())
                    } else if glyph == "???" {
                        "Unknown".into()
                    } else if glyph == "   " {
                        "Empty".into()
                    } else {
                        format!("{:?}", g.dungeon.cell(p).feature())
                    };
                    rooms.push(json!({"x":p.x,"y":p.y,"feature":feature}));
                }
            } else {
                if v.west[x][y] != 0
                    && x > 0
                    && let Some(p) = visibility::local_position(g, x - 1, y)
                {
                    edges.push(edge(g, p, Direction::East));
                }
                if v.north[x][y] != 0
                    && y > 0
                    && let Some(p) = visibility::local_position(g, x, y - 1)
                {
                    edges.push(edge(g, p, Direction::South));
                }
            }
        }
    }
    json!({"rooms":rooms,"edges":edges,"level":g.depth(),"journal":false})
}

pub fn journal(g: &Game, level: u8) -> Value {
    assert!(level < 20);
    let mut rooms = Vec::new();
    let mut edges = Vec::new();
    let purchased = g.world().purchased_maps[level as usize];
    for y in 0..SIZE as u8 {
        for x in 0..SIZE as u8 {
            let p = Pos::new(x, y, level);
            if !purchased && !g.world().visited[p.index()] {
                continue;
            }
            let feature = if g.world().cleared[p.index()] {
                Feature::Empty
            } else {
                g.dungeon.cell(p).feature()
            };
            rooms.push(json!({"x":x,"y":y,"feature":format!("{feature:?}")}));
            for d in Direction::ALL {
                edges.push(edge(g, p, d));
            }
        }
    }
    json!({"rooms":rooms,"edges":edges,"level":level+1,"journal":true,"purchased":purchased})
}

pub fn phase_name(g: &Game) -> &'static str {
    match g.phase {
        Phase::Town => "Town",
        Phase::Exploring => "Exploring",
        Phase::Combat(_) => "Combat",
        Phase::Treasure(_) => "Treasure",
        Phase::Choice(_) => "Choice",
        Phase::Dead => "Dead",
        Phase::Won => "Won",
    }
}

pub fn actions(g: &Game) -> Vec<(&'static str, &'static str)> {
    use Feature::*;
    match g.phase {
        Phase::Town => vec![("Enter the dungeon", "enter")],
        Phase::Exploring => vec![
            ("Wait", "wait"),
            ("Search walls", "search"),
            ("Interact", "interact"),
            ("Upstairs", "up"),
            ("Downstairs", "down"),
        ],
        Phase::Combat(_) => vec![("Fight", "fight"), ("Evade", "evade")],
        Phase::Treasure(_) => vec![("Take treasure", "take"), ("Ignore", "ignore")],
        Phase::Choice(f) => {
            let mut a = match f {
                Down | Pit => vec![("Go down", "down")],
                Up => vec![("Go up", "up")],
                Stairs => vec![("Go up", "up"), ("Go down", "down")],
                Fountain => vec![("Drink", "drink")],
                Altar => vec![("Worship", "worship"), ("Desecrate", "desecrate")],
                Throne => vec![("Sit", "sit"), ("Pry", "pry"), ("Read", "read")],
                Mirror => vec![("Look", "look")],
                _ => vec![],
            };
            a.push(("Ignore", "ignore"));
            a
        }
        Phase::Won => vec![("Continue as an immortal", "continue")],
        Phase::Dead => vec![],
    }
}

pub fn snapshot(g: &Game, revision: u64, save_id: &str) -> Value {
    let mut book = Vec::new();
    for tier in 1..=4 {
        for number in 1..=6 {
            if let Some(s) = spells::spell(g.player.class, tier, number) {
                book.push(json!({"tier":tier,"number":number,"name":s.name,
                "description":s.description,"combat":s.combat}));
            }
        }
    }
    let encounter = match &g.phase {
        Phase::Combat(m) => json!({"name":m.name,"hp":m.hp,"maxHp":m.max_hp,"level":m.level}),
        Phase::Treasure(t) => json!({"name":t.name()}),
        Phase::Choice(f) => json!({"name":format!("{f:?}")}),
        _ => Value::Null,
    };
    let effects: Vec<_> = player::EFFECT_NAMES
        .iter()
        .enumerate()
        .filter(|(i, _)| g.player.active(*i))
        .map(|(i, name)| {
            json!({"name":name,"turns":g.player.effects[i],
            "permanent":i==player::LIGHT && g.player.continual_light})
        })
        .collect();
    json!({"revision":revision,"saveId":save_id,"player":g.player,
        "dungeon":g.dungeon.name(),"position":g.pos,"depth":g.depth(),
        "phase":phase_name(g),"encounter":encounter,"turns":g.turns,
        "actions":actions(g),"log":g.log,"map":live_map(g),"spells":book,
        "effects":effects,"nextXp":player::experience(g.player.class,g.player.level+1)})
}
