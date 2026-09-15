use dnd_rs::{
    player::{Class, Player},
    rng::Rng,
    room_effects,
};
use serde_json::{Value, json};
fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/dos-rooms.json")).unwrap()
}
fn n(v: &Value, k: &str) -> i32 {
    v[k].as_i64().unwrap() as i32
}
fn class(n: i32) -> Class {
    match n {
        0 => Class::Fighter,
        1 => Class::Cleric,
        _ => Class::Magician,
    }
}
#[test]
fn full_fountain_outcomes_match_original() {
    for case in fixtures()["fountains"].as_array().unwrap() {
        let b = &case["before"];
        let mut rng = Rng::new(b["state"].as_u64().unwrap());
        let mut p = Player::new(
            "Fountain oracle".into(),
            class(n(case, "cls")),
            &mut Rng::new(1),
        );
        p.stats = serde_json::from_value(b["stats"].clone()).unwrap();
        p.level = n(b, "level");
        p.xp = b["xp"].as_i64().unwrap();
        p.hp = n(b, "hp");
        p.max_hp = n(b, "max_hp");
        p.slots = serde_json::from_value(b["slots"].clone()).unwrap();
        p.effects = serde_json::from_value(b["effects"].clone()).unwrap();
        p.treasure_xp = b["treasure_xp"].as_i64().unwrap();
        room_effects::fountain(&mut p, n(case, "color"), n(case, "depth"), &mut rng);
        let actual = json!({"stats":p.stats,"level":p.level,"xp":p.xp,"hp":p.hp,"max_hp":p.max_hp,"slots":p.slots,"effects":p.effects,"state":rng.state(),"treasure_xp":p.treasure_xp});
        assert_eq!(actual, case["after"], "{case}");
    }
}
#[test]
fn hazard_severity_and_retry_draws_match_original() {
    for case in fixtures()["hazards"].as_array().unwrap() {
        let mut rng = Rng::new(case["seed"].as_u64().unwrap());
        assert_eq!(
            room_effects::hazard_damage(n(case, "cls"), n(case, "depth"), &mut rng),
            n(case, "damage"),
            "{case}"
        );
        assert_eq!(rng.state(), case["state"].as_u64().unwrap());
    }
}
#[test]
fn pit_avoidance_matches_original_boots_dexterity_and_rng() {
    for case in fixtures()["pits"].as_array().unwrap() {
        let mut p = Player::new("Pit oracle".into(), Class::Fighter, &mut Rng::new(1));
        p.stats[4] = n(case, "dex");
        p.boots = n(case, "boots");
        let mut rng = Rng::new(case["seed"].as_u64().unwrap());
        assert_eq!(
            room_effects::avoids_pit(&p, &mut rng),
            case["avoided"].as_bool().unwrap(),
            "{case}"
        );
        assert_eq!(rng.state(), case["state"].as_u64().unwrap());
    }
}

#[test]
fn djinn_rejections_preserve_original_depth_ceiling_and_draw_order() {
    use dnd_rs::world::Pos;
    for case in fixtures()["djinns"].as_array().unwrap() {
        let start = Pos::new(4, 4, (n(case, "depth") - 1) as u8);
        let mut rng = Rng::new(case["seed"].as_u64().unwrap());
        let pos = room_effects::djinn_destination(start, &mut rng, |p| {
            p == start || (u32::from(p.x) + u32::from(p.y) + u32::from(p.z) + 3) % 3 != 0
        });
        assert_eq!(
            json!([pos.x + 1, pos.y + 1, pos.z + 1]),
            case["position"],
            "{case}"
        );
        assert_eq!(rng.state(), case["state"].as_u64().unwrap(), "{case}");
    }
}
