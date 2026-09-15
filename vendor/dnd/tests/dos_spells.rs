use dnd_rs::{
    engine::{MONSTERS, Monster},
    player::{Class, Player, experience},
    rng::Rng,
    spell_effects,
};
use serde_json::Value;
fn i(v: &Value, k: &str) -> i32 {
    v[k].as_i64().unwrap() as i32
}
#[test]
fn complete_dos_spell_casts_match_state_and_rng() {
    let data: Value = serde_json::from_str(include_str!("fixtures/dos-spells.json")).unwrap();
    for case in data["cases"].as_array().unwrap() {
        let input = &case["input"];
        let e = &case["expected"];
        let cls = if i(input, "cls") == 1 {
            Class::Cleric
        } else {
            Class::Magician
        };
        let mut p = Player::new("Spell oracle".into(), cls, &mut Rng::new(1));
        p.stats = serde_json::from_value(input["stats"].clone()).unwrap();
        p.level = i(input, "level");
        p.xp = experience(cls, p.level);
        p.hp = 100;
        p.max_hp = 200;
        p.slots = [20; 4];
        let kind = i(input, "kind") as usize;
        let mut m = Monster {
            kind,
            name: MONSTERS[kind].0.into(),
            level: i(input, "enemy_level"),
            hp: 80,
            max_hp: 80,
            strength: 4,
            armor: 3,
            held: i(input, "held"),
            boss: false,
        };
        let mut rng = Rng::new(input["seed"].as_u64().unwrap());
        let result = spell_effects::resolve(
            &mut p,
            &mut m,
            &mut rng,
            i(input, "tier") as usize,
            i(input, "number") as usize,
        );
        let actual = serde_json::json!({"hp":p.hp,"max_hp":p.max_hp,"level":p.level,"xp":p.xp,"slots":p.slots,"effects":p.effects,"flags":if p.continual_light {1}else{0},"monster_hp":m.hp,"held":m.held,"state":rng.state(),"room":if result.removed {0}else{61440},"finished":result.finished});
        assert_eq!(&actual, e, "Input: {input}");
    }
}
