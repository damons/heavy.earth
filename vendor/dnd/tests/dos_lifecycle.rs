use dnd_rs::{
    engine::{Game, Phase},
    player::{Class, Player},
    rng::Rng,
    save, spells,
    world::{Dungeon, Pos},
};
use serde_json::{Value, json};
fn n(v: &Value, k: &str) -> i32 {
    v[k].as_i64().unwrap() as i32
}
fn class(v: &Value) -> Class {
    match v.as_i64().unwrap() {
        0 => Class::Fighter,
        1 => Class::Cleric,
        _ => Class::Magician,
    }
}
fn load(v: &Value, cls: Class) -> (Player, Rng, [i32; 3]) {
    let mut p = Player::new("Lifecycle oracle".into(), cls, &mut Rng::new(1));
    p.stats = serde_json::from_value(v["stats"].clone()).unwrap();
    p.level = n(v, "level");
    p.xp = v["xp"].as_i64().unwrap();
    p.hp = n(v, "hp");
    p.max_hp = n(v, "max_hp");
    p.slots = serde_json::from_value(v["slots"].clone()).unwrap();
    p.effects = serde_json::from_value(v["effects"].clone()).unwrap();
    let e: Vec<i32> = serde_json::from_value(v["equipment"].clone()).unwrap();
    p.cloak = e[0];
    p.boots = e[1];
    p.ring = e[2];
    p.shield = e[3];
    p.armor = e[4];
    p.weapon = e[5];
    p.gold = v["gold"].as_i64().unwrap();
    p.bank = v["bank"].as_i64().unwrap();
    p.treasure_xp = v["treasure_xp"].as_i64().unwrap();
    p.immortal = v["immortal"].as_bool().unwrap();
    p.orb = v["orb"].as_bool().unwrap();
    p.continual_light = n(v, "flags") & 1 != 0;
    p.recovery_clock = n(v, "recovery");
    (
        p,
        Rng::new(v["state"].as_u64().unwrap()),
        serde_json::from_value(v["position"].clone()).unwrap(),
    )
}
fn snapshot(p: &Player, rng: Rng, pos: [i32; 3]) -> Value {
    json!({"stats":p.stats,"level":p.level,"xp":p.xp,"hp":p.hp,"max_hp":p.max_hp,"slots":p.slots,"effects":p.effects,"equipment":[p.cloak,p.boots,p.ring,p.shield,p.armor,p.weapon],"gold":p.gold,"bank":p.bank,"treasure_xp":p.treasure_xp,"immortal":p.immortal,"orb":p.orb,"flags":if p.continual_light {1}else{0},"recovery":p.recovery_clock,"position":pos,"state":rng.state()})
}
fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/dos-lifecycle.json")).unwrap()
}
#[test]
fn teleport_casts_match_original_positions_slots_and_rng() {
    for case in fixtures()["teleports"].as_array().unwrap() {
        let (mut p, mut rng, pos) = load(&case["before"], Class::Magician);
        p.slots[3] -= 1;
        let pos = spells::teleport_destination(pos[2], &mut rng);
        assert_eq!(snapshot(&p, rng, pos), case["after"], "{case}");
    }
}
#[test]
fn reincarnation_matches_original_including_exhausted_immortality() {
    for case in fixtures()["reincarnations"].as_array().unwrap() {
        let (mut p, mut rng, mut pos) = load(&case["before"], class(&case["cls"]));
        if p.reincarnate(&mut rng) {
            pos = [rng.die(20), rng.die(20), rng.die(20)];
        }
        assert_eq!(snapshot(&p, rng, pos), case["after"], "{case}");
    }
}
#[test]
fn long_recovery_sequences_match_dos_across_save_and_resume() {
    let path = std::env::temp_dir().join(format!("dnd-lifecycle-{}.json", std::process::id()));
    for case in fixtures()["ticks"].as_array().unwrap() {
        let cls = class(&case["cls"]);
        let (p, rng, pos) = load(&case["before"], cls);
        let mut g = Game::new("Recovery oracle".into(), cls, Dungeon::Telengard, 1);
        g.player = p;
        g.rng = rng;
        g.pos = Pos::new((pos[0] - 1) as u8, (pos[1] - 1) as u8, (pos[2] - 1) as u8);
        g.phase = Phase::Exploring;
        for (step, expected) in case["steps"].as_array().unwrap().iter().enumerate() {
            g.tick();
            assert_eq!(
                snapshot(&g.player, g.rng, pos),
                *expected,
                "class {cls:?}, step {step}, initial {}",
                case["before"]
            );
            if step == 79 {
                save::write(&path, &g).unwrap();
                g = save::read(&path).unwrap();
            }
        }
    }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn pass_wall_casts_match_original_movement_and_blocking() {
    for case in fixtures()["passwalls"].as_array().unwrap() {
        let (mut p, rng, mut pos) = load(&case["before"], Class::Magician);
        p.slots[2] -= 1;
        let direction = match case["direction"].as_str().unwrap() {
            "W" => dnd_rs::world::Direction::North,
            "X" => dnd_rs::world::Direction::South,
            "A" => dnd_rs::world::Direction::West,
            _ => dnd_rs::world::Direction::East,
        };
        let start = Pos::new((pos[0] - 1) as u8, (pos[1] - 1) as u8, (pos[2] - 1) as u8);
        if let Some(q) =
            spells::pass_wall_destination(start, direction, case["blocked"].as_bool().unwrap())
        {
            pos = [i32::from(q.x) + 1, i32::from(q.y) + 1, i32::from(q.z) + 1];
        }
        assert_eq!(snapshot(&p, rng, pos), case["after"]);
    }
}
