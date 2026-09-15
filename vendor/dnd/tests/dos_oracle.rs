use dnd_rs::{
    combat,
    engine::{MONSTERS, Monster},
    player::*,
    rng::Rng,
};
use serde_json::Value;
fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/dos-routines.json")).unwrap()
}
fn n(v: &Value, k: &str) -> i32 {
    v[k].as_i64().unwrap() as i32
}
fn class(v: &Value) -> Class {
    [Class::Fighter, Class::Cleric, Class::Magician][n(v, "cls") as usize]
}
fn rng(v: &Value) -> Rng {
    Rng::new(v["seed"].as_u64().unwrap())
}
fn check_state(v: &Value, r: Rng) {
    assert_eq!(r.state(), v["state"].as_u64().unwrap(), "{v}");
}
fn player(v: &Value) -> Player {
    let mut p = Player::new("Oracle".into(), class(v), &mut Rng::new(1));
    for (i, s) in v["stats"].as_array().unwrap().iter().enumerate() {
        p.stats[i] = s.as_i64().unwrap() as i32;
    }
    p.level = n(v, "level");
    p.hp = n(v, "hp");
    p.max_hp = n(v, "max_hp");
    p
}
#[test]
fn dos_random_streams_and_scaled_dice() {
    let f = fixtures();
    for v in f["rng"].as_array().unwrap() {
        let mut r = rng(v);
        for x in v["ints"].as_array().unwrap() {
            assert_eq!(r.next_15() as u64, x.as_u64().unwrap());
        }
        check_state(v, r);
        let mut r = rng(v);
        for x in v["float_bits"].as_array().unwrap() {
            assert_eq!((r.unit() as f32).to_bits() as u64, x.as_u64().unwrap());
        }
        check_state(v, r);
    }
    for v in f["dice"].as_array().unwrap() {
        let mut r = rng(v);
        for x in v["values"].as_array().unwrap() {
            assert_eq!(r.dice(n(v, "n"), n(v, "sides")) as i64, x.as_i64().unwrap());
        }
        check_state(v, r);
    }
}
#[test]
fn dos_character_creation_experience_and_spell_capacity() {
    let f = fixtures();
    for v in f["characters"].as_array().unwrap() {
        let mut r = rng(v);
        let p = Player::new("Oracle".into(), Class::Fighter, &mut r);
        assert_eq!(serde_json::to_value(p.stats).unwrap(), v["stats"]);
        check_state(v, r);
        assert_eq!(p.hp, p.stats[3]);
    }
    for v in f["experience"].as_array().unwrap() {
        assert_eq!(
            experience(class(v), n(v, "level")),
            v["xp"].as_i64().unwrap()
        );
    }
    for v in f["slots"].as_array().unwrap() {
        assert_eq!(
            serde_json::to_value(spell_capacity(class(v), n(v, "level"))).unwrap(),
            v["slots"]
        );
    }
    for v in f["level_up"].as_array().unwrap() {
        let mut p = Player::new("Oracle".into(), class(v), &mut Rng::new(1));
        p.stats = [18, 12, 12, 9, 12, 12];
        p.hp = 12;
        p.max_hp = 12;
        p.xp = 100000;
        let mut r = rng(v);
        p.check_level(&mut r);
        assert_eq!(p.level, n(v, "level"));
        assert_eq!(p.hp, n(v, "hp"));
        assert_eq!(p.max_hp, n(v, "max_hp"));
        assert_eq!(p.xp, v["xp"].as_i64().unwrap());
        check_state(v, r);
    }
}
#[test]
fn dos_monster_records() {
    for v in fixtures()["monsters"].as_array().unwrap() {
        let mut r = rng(v);
        let m = Monster::generate(n(v, "kind") as usize, n(v, "level"), &mut r);
        assert_eq!(m.die(), n(v, "die"));
        assert_eq!(m.hp, n(v, "hp"));
        assert_eq!(m.strength, n(v, "strength"));
        assert_eq!(m.armor, n(v, "armor"));
        check_state(v, r);
    }
}
#[test]
fn dos_player_attack_outcomes_and_draw_order() {
    for v in fixtures()["player_attacks"].as_array().unwrap() {
        let mut p = player(v);
        p.weapon = n(v, "weapon");
        p.effects[PRAYER] = i32::from(v["prayer"].as_bool().unwrap());
        p.effects[STRENGTH] = i32::from(v["strength"].as_bool().unwrap());
        let kind = MONSTERS.iter().position(|m| m.1 == n(v, "die")).unwrap();
        let mut m = Monster::generate(kind, n(v, "monster_level"), &mut Rng::new(1));
        m.armor = n(v, "armor");
        m.held = n(v, "held");
        let mut r = rng(v);
        let attack = combat::player_attack(&p, &m, &mut r);
        assert_eq!(attack.chance, n(v, "chance"), "{v}");
        assert_eq!(attack.damage, n(v, "damage"), "{v}");
        check_state(v, r);
    }
}
#[test]
fn dos_monster_attack_outcomes_and_draw_order() {
    for v in fixtures()["monster_attacks"].as_array().unwrap() {
        let mut p = player(v);
        p.shield = n(v, "shield");
        p.armor = n(v, "armor");
        for e in [PROTECTION, SHIELD, PRAYER] {
            p.effects[e] = i32::from(v["effects"].as_bool().unwrap());
        }
        let kind = MONSTERS.iter().position(|m| m.1 == n(v, "die")).unwrap();
        let mut m = Monster::generate(kind, n(v, "monster_level"), &mut Rng::new(1));
        m.strength = n(v, "monster_strength");
        m.armor = n(v, "monster_armor");
        m.hp = n(v, "monster_hp");
        m.max_hp = n(v, "monster_max_hp");
        let mut r = rng(v);
        let attack = combat::monster_attack(&p, &m, &mut r);
        assert_eq!(attack.chance, n(v, "chance"), "{v}");
        assert_eq!(attack.damage, n(v, "damage"), "{v}");
        check_state(v, r);
    }
}
#[test]
fn dos_spell_duration_resistance_and_evasion() {
    use dnd_rs::spells;
    let f = fixtures();
    for v in f["durations"].as_array().unwrap() {
        let mut r = rng(v);
        assert_eq!(
            spells::duration(n(v, "old"), n(v, "level"), &mut r),
            n(v, "duration")
        );
        check_state(v, r);
    }
    for v in f["resistance"].as_array().unwrap() {
        let mut r = rng(v);
        assert_eq!(
            spells::resistance(
                n(v, "stat_a"),
                n(v, "stat_b"),
                n(v, "level"),
                n(v, "enemy"),
                &mut r
            ),
            v["success"].as_bool().unwrap()
        );
        check_state(v, r);
    }
    for v in f["evasion"].as_array().unwrap() {
        let mut r = rng(v);
        assert_eq!(
            combat::can_evade(n(v, "dex"), n(v, "boots"), &mut r),
            v["success"].as_bool().unwrap(),
            "{v}"
        );
        check_state(v, r);
    }
}
