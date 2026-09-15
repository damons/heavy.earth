use dnd_rs::{
    engine::{Game, Phase},
    player::{Class, LIGHT},
    save, visibility,
    world::{Direction, Dungeon, Edge, Pos},
};
use heavy_earth::{session::Session, view};
use serde_json::json;
use std::{fs, path::PathBuf};
fn temp(label: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("heavy-earth-{label}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
}

#[test]
fn view_preserves_engine_visibility_and_random_stream() {
    for dungeon in Dungeon::ALL {
        for level in [0, 9, 19] {
            for (x, y) in [(0, 0), (19, 19), (10, 10), (0, 14)] {
                for light in [0, 1, 50, 51] {
                    let mut g = Game::new("Sight".into(), Class::Magician, dungeon, 42);
                    g.pos = Pos::new(x, y, level);
                    g.phase = Phase::Exploring;
                    g.player.effects[LIGHT] = light;
                    let before = g.clone();
                    let v = visibility::current(&g);
                    let actual = view::live_map(&g);
                    let rooms = actual["rooms"].as_array().unwrap();
                    let mut rng = g.rng;
                    let mut count = 0;
                    for ly in 0..4 {
                        for lx in 0..4 {
                            if let Some(p) = visibility::local_position(&g, lx, ly)
                                && v.rooms[lx][ly]
                            {
                                count += 1;
                                let glyph = visibility::room_glyph(&g, p, &mut rng);
                                let r = rooms
                                    .iter()
                                    .find(|r| r["x"] == p.x && r["y"] == p.y)
                                    .unwrap();
                                if p != g.pos && glyph == "   " {
                                    assert_eq!(r["feature"], "Empty");
                                }
                                if glyph == "???" {
                                    assert_eq!(r["feature"], "Unknown");
                                }
                            }
                        }
                    }
                    assert_eq!(rooms.len(), count);
                    assert_eq!(actual, view::live_map(&g));
                    assert_eq!(g, before);
                    for e in actual["edges"].as_array().unwrap() {
                        let p = Pos::new(
                            e["x"].as_u64().unwrap() as u8,
                            e["y"].as_u64().unwrap() as u8,
                            level,
                        );
                        let d = match e["direction"].as_str().unwrap() {
                            "north" => Direction::North,
                            "east" => Direction::East,
                            "south" => Direction::South,
                            _ => Direction::West,
                        };
                        if g.dungeon.edge(p, d) == Edge::Secret {
                            assert_eq!(e["kind"], "wall");
                        }
                    }
                }
            }
        }
    }
}
#[test]
fn journal_and_town_do_not_leak_unseen_rooms() {
    let mut g = Game::new("Memory".into(), Class::Fighter, Dungeon::Telengard, 42);
    assert_eq!(view::live_map(&g)["rooms"], json!([]));
    assert_eq!(view::journal(&g, 0)["rooms"], json!([]));
    g.enter();
    let current = g.pos;
    g.world_mut().visited[current.index()] = true;
    let count = view::journal(&g, 0)["rooms"].as_array().unwrap().len();
    assert!(count > 0 && count < 400);
    g.world_mut().purchased_maps[1] = true;
    assert_eq!(view::journal(&g, 1)["rooms"].as_array().unwrap().len(), 400);
    assert!(view::live_map(&g)["rooms"].as_array().unwrap().len() < 10);
}
#[test]
fn commands_and_resume_are_identical_to_direct_engine_play() {
    let path = temp("replay");
    let mut session = Session::new(path.clone());
    session
        .roll(&json!({"name":"Replay","class":"cleric","dungeon":"telengard"}))
        .unwrap();
    session.begin().unwrap();
    let mut direct = session.game.clone().unwrap();
    let id = session.save_id.clone();
    for i in 0..240 {
        let cmd = match direct.phase {
            Phase::Town => "enter",
            Phase::Combat(_) => {
                if i % 3 == 0 {
                    "evade"
                } else {
                    "fight"
                }
            }
            Phase::Treasure(_) => "take",
            Phase::Choice(_) => "ignore",
            Phase::Won => "continue",
            Phase::Dead => "save",
            Phase::Exploring => [
                "east", "north", "south", "west", "search", "wait", "cast 1 6", "interact",
            ][i % 8],
        };
        direct.command(cmd);
        session.command(cmd, session.revision).unwrap();
        assert_eq!(session.game.as_ref().unwrap(), &direct);
        assert_eq!(
            save::read(&path.join(format!("{id}.json"))).unwrap(),
            direct
        );
    }
    let mut resumed = Session::new(path.clone());
    resumed.resume(&id).unwrap();
    assert_eq!(resumed.game.as_ref().unwrap(), &direct);
    fs::remove_dir_all(path).unwrap();
}
#[test]
fn failed_saves_and_stale_tabs_cannot_advance_a_turn() {
    let path = temp("atomic");
    let mut s = Session::new(path.clone());
    s.roll(&json!({"name":"Atomic","class":"fighter","dungeon":"telengard"}))
        .unwrap();
    s.begin().unwrap();
    let before = s.game.clone();
    let revision = s.revision;
    assert!(s.command("enter", revision + 1).is_err());
    assert_eq!(s.game, before);
    fs::remove_dir_all(&path).unwrap();
    fs::write(&path, "not a directory").unwrap();
    assert!(s.command("enter", revision).is_err());
    assert_eq!(s.game, before);
    assert_eq!(s.revision, revision);
    fs::remove_file(&path).unwrap();
}
#[test]
fn new_characters_have_distinct_saves_and_bad_ids_are_rejected() {
    let path = temp("characters");
    let mut s = Session::new(path.clone());
    assert!(s.begin().is_err());
    assert!(s.resume("../../original").is_err());
    for _ in 0..2 {
        s.roll(&json!({"name":"Explorer","class":"fighter","dungeon":"telengard"}))
            .unwrap();
        s.begin().unwrap();
    }
    assert_eq!(s.list().unwrap().as_array().unwrap().len(), 2);
    fs::remove_dir_all(path).unwrap();
}
