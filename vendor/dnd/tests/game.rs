use dnd_rs::{
    engine::{Game, Loot, Monster, Phase},
    player::*,
    rng::Rng,
    save, spells,
    world::*,
};
fn game(class: Class) -> Game {
    Game::new("Tester".into(), class, Dungeon::Telengard, 42)
}
fn monster() -> Monster {
    Monster {
        kind: 0,
        name: "Kobold".into(),
        level: 1,
        hp: 6,
        max_hp: 6,
        strength: 2,
        armor: 0,
        held: 0,
        boss: false,
    }
}
fn locate(g: &mut Game, f: Feature) -> Pos {
    let i = g
        .dungeon
        .bytes()
        .iter()
        .position(|&b| Cell(b).feature() == f)
        .unwrap();
    let p = Pos::new((i % 20) as u8, (i % 400 / 20) as u8, (i / 400) as u8);
    g.pos = p;
    g.initialize_level();
    g.world_mut().contents[i] = 0;
    p
}
#[test]
fn dos_experience_thresholds() {
    for (c, base) in [
        (Class::Fighter, 2000),
        (Class::Cleric, 1500),
        (Class::Magician, 2500),
    ] {
        assert_eq!(experience(c, 1), 0);
        assert_eq!(experience(c, 2), base);
        assert_eq!(experience(c, 10), base * 256);
        assert_eq!(experience(c, 11), base * 384);
    }
    assert_eq!(experience(Class::Fighter, 12), 1_024_000);
}
#[test]
fn dos_stats_and_initial_spells() {
    for c in [Class::Fighter, Class::Cleric, Class::Magician] {
        let g = game(c);
        assert!(
            g.player
                .stats
                .iter()
                .all(|&s| (3..=18).contains(&s) && s % 3 == 0)
        );
        assert_eq!(g.player.max_hp, g.player.stats[3]);
    }
    assert_eq!(spell_capacity(Class::Fighter, 10), [0; 4]);
    assert_eq!(spell_capacity(Class::Cleric, 1), [2, 0, 0, 0]);
    assert_eq!(spell_capacity(Class::Magician, 1), [3, 0, 0, 0]);
    assert_eq!(spell_capacity(Class::Magician, 5), [7, 4, 3, 1]);
    assert_eq!(spell_capacity(Class::Cleric, 5), [6, 2, 1, 0]);
}
#[test]
fn known_dos_map_landmarks() {
    for d in Dungeon::ALL {
        assert_eq!(d.bytes().len(), 8000);
        assert_eq!(d.bytes().iter().filter(|&&b| b >> 4 == 10).count(), 1);
    }
    assert_eq!(
        Dungeon::Telengard.cell(Pos::new(0, 19, 18)).feature(),
        Feature::Orb
    );
    assert_eq!(
        Dungeon::Cavern.cell(Pos::new(15, 13, 19)).feature(),
        Feature::Orb
    );
    assert_eq!(
        Dungeon::Shvenk.cell(Pos::new(17, 12, 19)).feature(),
        Feature::Orb
    );
    assert_eq!(
        Dungeon::Warren.cell(Pos::new(0, 18, 19)).feature(),
        Feature::Orb
    );
    assert_eq!(
        Dungeon::Lamorte.cell(Pos::new(8, 15, 19)).feature(),
        Feature::Orb
    );
    assert_eq!(Cell(0xf5).feature(), Feature::Djinn);
    assert_eq!(Cell(0xb4).feature(), Feature::Mirror);
}
#[test]
fn dungeon_edges_are_reciprocal() {
    for d in Dungeon::ALL {
        for z in 0..20 {
            for y in 0..20 {
                for x in 0..20 {
                    let p = Pos::new(x, y, z);
                    if x < 19 {
                        assert_eq!(
                            d.edge(p, Direction::East),
                            d.edge(p.step(Direction::East).unwrap(), Direction::West)
                        );
                    }
                    if y < 19 {
                        assert_eq!(
                            d.edge(p, Direction::South),
                            d.edge(p.step(Direction::South).unwrap(), Direction::North)
                        );
                    }
                }
            }
        }
    }
}
#[test]
fn all_entrances_can_return_to_town() {
    for d in Dungeon::ALL {
        let mut g = Game::new("Exit".into(), Class::Fighter, d, 20);
        g.enter();
        g.player.hp = 1;
        g.player.gain_gold(200, 1);
        if matches!(g.feature(), Feature::Up | Feature::Stairs) {
            g.stairs(false);
        } else {
            g.move_player(Direction::West, false);
        }
        assert_eq!(g.phase, Phase::Town, "{}", d.name());
        assert_eq!(g.player.hp, g.player.max_hp);
        assert_eq!(g.player.bank, 200);
        assert_eq!(g.player.xp, 200);
        assert_eq!(g.player.gold, 0);
    }
}
#[test]
fn blocked_moves_do_not_advance_clock() {
    let mut g = game(Class::Fighter);
    g.enter();
    g.pos = Pos::new(0, 0, 0);
    let p = g.pos;
    let turns = g.turns;
    g.move_player(Direction::North, false);
    assert_eq!(g.pos, p);
    assert_eq!(g.turns, turns);
}
#[test]
fn state_survives_combat_and_treasure() {
    let mut g = game(Class::Fighter);
    g.enter();
    g.pos = Pos::new(3, 4, 0);
    let p = g.pos;
    g.player.hp = 3;
    let gold = g.player.gold;
    let mut m = monster();
    m.hp = 1;
    m.held = 10;
    g.phase = Phase::Combat(m);
    for _ in 0..20 {
        if !matches!(g.phase, Phase::Combat(_)) {
            break;
        }
        g.fight();
    }
    assert_eq!(g.pos, p);
    assert_eq!(g.player.hp, 3);
    assert!(g.player.xp > 0);
    g.phase = Phase::Treasure(Loot::Gold {
        amount: 100,
        label: "Gold".into(),
        trapped: false,
        chest: false,
    });
    g.take_loot(true);
    assert_eq!(g.player.gold, gold + 100);
    assert_eq!(g.player.hp, 3);
    assert_eq!(g.pos, p);
}
#[test]
fn level_gain_updates_hp_and_slots_once() {
    let mut g = game(Class::Magician);
    let before = g.player.max_hp;
    g.gain_xp(100000);
    assert_eq!(g.player.level, 2);
    assert!(g.player.max_hp > before);
    assert_eq!(g.player.xp, 4999);
    assert_eq!(g.player.slots, spell_capacity(Class::Magician, 2));
}
#[test]
fn spell_validation_is_free_and_healing_is_capped() {
    let mut g = game(Class::Cleric);
    g.enter();
    let rng = g.rng;
    let slots = g.player.slots;
    g.cast(0, 0, None);
    g.cast(1, 4, None);
    assert_eq!(g.rng, rng);
    assert_eq!(g.player.slots, slots);
    g.player.hp -= 1;
    g.cast(1, 3, None);
    assert_eq!(g.player.hp, g.player.max_hp);
    assert_eq!(g.player.slots[0], slots[0] - 1);
}
#[test]
fn dos_magic_missile_has_documented_damage() {
    let mut g = game(Class::Magician);
    g.enter();
    let mut m = monster();
    m.hp = 100;
    m.max_hp = 100;
    m.held = 10;
    g.phase = Phase::Combat(m);
    g.cast(1, 1, None);
    if let Phase::Combat(m) = g.phase {
        assert!((2..=11).contains(&(100 - m.hp)));
    } else {
        panic!("target should survive");
    }
}
#[test]
fn all_forty_spells_execute_and_preserve_valid_state() {
    let mut count = 0;
    for c in [Class::Cleric, Class::Magician] {
        for t in 1..=4 {
            for n in 1..=6 {
                let Some(s) = spells::spell(c, t, n) else {
                    continue;
                };
                count += 1;
                let mut g = game(c);
                g.enter();
                g.player.level = 20;
                g.player.xp = experience(c, 20);
                g.player.slots = [30; 4];
                g.player.hp = 200;
                g.player.max_hp = 200;
                g.player.stats = [18; 6];
                if s.combat {
                    let mut m = monster();
                    m.kind = 8;
                    m.name = "Ghoul".into();
                    m.hp = 50;
                    m.max_hp = 50;
                    g.phase = Phase::Combat(m);
                }
                g.cast(t, n, Some("east"));
                save::validate(&g).unwrap_or_else(|e| panic!("{}: {e}", s.name));
            }
        }
    }
    assert_eq!(count, 40);
}
#[test]
fn combat_does_not_advance_exploration_effect_clock() {
    let mut g = game(Class::Magician);
    g.enter();
    g.player.effects[TIME_STOP] = 2;
    g.phase = Phase::Combat(monster());
    g.fight();
    assert_eq!(g.player.effects[TIME_STOP], 2);
    g.phase = Phase::Combat(monster());
    g.fight();
    assert_eq!(g.player.effects[TIME_STOP], 2);
}
#[test]
fn secret_doors_require_discovery() {
    let mut g = game(Class::Fighter);
    g.enter();
    let i = g.dungeon.bytes().iter().position(|&b| b & 3 == 3).unwrap();
    g.pos = Pos::new((i % 20) as u8, (i % 400 / 20) as u8, (i / 400) as u8);
    g.world_mut().secrets.fill(0);
    assert!(!g.passable(g.pos, Direction::West));
    g.player.effects[LIGHT] = 10;
    g.reveal();
    assert!(g.passable(g.pos, Direction::West));
}
#[test]
fn trove_pays_only_once() {
    let mut g = game(Class::Fighter);
    g.enter();
    let p = locate(&mut g, Feature::Trove);
    g.world_mut().combinations[p.index()] = 1;
    g.phase = Phase::Choice(Feature::Trove);
    g.command("rg");
    let gold = g.player.gold;
    assert!(gold > 0);
    assert_eq!(g.feature(), Feature::Empty);
    g.command("interact");
    g.command("rg");
    assert_eq!(g.player.gold, gold);
}
#[test]
fn orb_roundtrip_wins_and_unlocks_immortality() {
    let mut g = game(Class::Cleric);
    g.enter();
    locate(&mut g, Feature::Orb);
    g.offer_feature();
    g.command("take");
    assert!(g.player.orb);
    g.pos = g.dungeon.entrance();
    g.phase = Phase::Exploring;
    g.command("west");
    assert_eq!(g.phase, Phase::Won);
    assert!(g.player.immortal);
    g.command("continue");
    assert_eq!(g.phase, Phase::Town);
    g.command("enter");
    g.hurt(g.player.hp);
    assert_eq!(g.phase, Phase::Exploring);
    assert_eq!(g.player.hp, g.player.max_hp);
}
#[test]
fn mortal_death_is_terminal() {
    let mut g = game(Class::Fighter);
    g.enter();
    g.hurt(999);
    assert_eq!(g.phase, Phase::Dead);
    g.command("enter");
    assert_eq!(g.phase, Phase::Dead);
    save::validate(&g).unwrap();
}
#[test]
fn equipment_trade_in_and_store_restrictions() {
    let mut g = game(Class::Fighter);
    g.player.bank = 30000;
    g.buy("ring", 2);
    assert_eq!(g.player.bank, 10000);
    g.buy("ring", 3);
    assert_eq!(g.player.bank, 0);
    assert_eq!(g.player.ring, 3);
    g.enter();
    g.buy("armor", 1);
    assert_eq!(g.player.armor, 0);
}
#[test]
fn save_roundtrip_preserves_rng_encounter_and_world() {
    let mut g = game(Class::Cleric);
    g.enter();
    g.phase = Phase::Combat(monster());
    let path = std::env::temp_dir().join(format!("dnd-test-{}.json", std::process::id()));
    save::write(&path, &g).unwrap();
    let mut resumed = save::read(&path).unwrap();
    assert_eq!(g, resumed);
    g.command("cast 1 3");
    resumed.command("cast 1 3");
    assert_eq!(g, resumed);
    std::fs::remove_file(path).unwrap();
}
#[test]
fn invalid_save_is_rejected_before_indexing() {
    let mut g = game(Class::Fighter);
    g.pos.x = 255;
    assert!(save::validate(&g).is_err());
    g.pos.x = 0;
    g.worlds[0].visited.clear();
    assert!(save::validate(&g).is_err());
}
#[test]
fn long_seeded_playthroughs_never_corrupt_state() {
    for seed in 0..40 {
        for d in Dungeon::ALL {
            let mut g = Game::new("Simulation".into(), Class::Cleric, d, seed);
            let mut input_rng = Rng::new(seed + 1000);
            g.enter();
            for _ in 0..300 {
                match g.phase.clone() {
                    Phase::Town => g.command("enter"),
                    Phase::Won => g.command("continue"),
                    Phase::Dead => break,
                    Phase::Exploring => g.command(
                        [
                            "north", "east", "south", "west", "wait", "search", "up", "down",
                            "interact",
                        ][(input_rng.die(9) - 1) as usize],
                    ),
                    Phase::Combat(_) => {
                        if g.player.hp < g.player.max_hp / 2 && g.player.slots[0] > 0 {
                            g.command("cast 1 3");
                        } else if input_rng.chance(0.4) {
                            g.command("evade");
                        } else {
                            g.command("fight");
                        }
                    }
                    Phase::Treasure(_) => g.command("take"),
                    Phase::Choice(f) => g.command(match f {
                        Feature::Up => "up",
                        Feature::Down | Feature::Stairs => "down",
                        Feature::Fountain => "drink",
                        Feature::Throne => "pry",
                        Feature::Mirror => "look",
                        Feature::Trove => "rg",
                        _ => "ignore",
                    }),
                }
                save::validate(&g).unwrap_or_else(|e| {
                    panic!(
                        "seed {seed} dungeon {} turn {}: {e}\n{:?}",
                        d.name(),
                        g.turns,
                        g.player
                    )
                });
            }
        }
    }
}

#[test]
fn shallow_loot_never_downgrades_equipment() {
    let mut g = game(Class::Fighter);
    g.player.armor = 20;
    g.player.shield = 20;
    g.apply_item(1, 1);
    g.apply_item(2, 1);
    assert_eq!(g.player.armor, 20);
    assert_eq!(g.player.shield, 20);
}

#[test]
fn prayer_at_minimum_constitution_saves_for_mortals_and_immortals() {
    for immortal in [false, true] {
        for seed in 0..30 {
            let mut g = Game::new("Prayer".into(), Class::Fighter, Dungeon::Telengard, seed);
            g.enter();
            g.player.immortal = immortal;
            g.player.stats[3] = 1;
            g.command("pray");
            save::validate(&g).unwrap();
        }
    }
}

#[test]
fn held_monsters_only_recover_when_damaged() {
    let mut g = game(Class::Magician);
    g.enter();
    let mut m = monster();
    m.hp = 100;
    m.max_hp = 100;
    m.held = 3;
    g.phase = Phase::Combat(m);
    let before = g.rng;
    g.monster_attack();
    g.monster_attack();
    assert_eq!(g.rng, before);
    assert!(matches!(&g.phase,Phase::Combat(m) if m.held==3));
    g.cast(1, 1, None);
    assert!(matches!(&g.phase,Phase::Combat(m) if m.held==2));
}

#[test]
fn reincarnation_does_not_resume_a_fatal_spell_encounter() {
    let cases: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/dos-spells.json")).unwrap();
    let case = cases["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| {
            v["input"]["cls"] == 1
                && v["input"]["tier"] == 3
                && v["input"]["number"] == 4
                && v["expected"]["hp"] == 0
        })
        .unwrap();
    let input = &case["input"];
    let mut g = game(Class::Cleric);
    g.enter();
    g.player.level = 10;
    g.player.xp = experience(Class::Cleric, 10);
    g.player.slots = [20; 4];
    g.player.hp = 100;
    g.player.max_hp = 200;
    g.player.immortal = true;
    g.player.stats = serde_json::from_value(input["stats"].clone()).unwrap();
    let mut m = monster();
    m.kind = input["kind"].as_u64().unwrap() as usize;
    m.level = input["enemy_level"].as_i64().unwrap() as i32;
    m.hp = 80;
    m.max_hp = 80;
    m.strength = 4;
    m.armor = 3;
    g.phase = Phase::Combat(m.clone());
    g.rng = Rng::new(input["seed"].as_u64().unwrap());
    let mut expected = g.player.clone();
    let mut rng = g.rng;
    dnd_rs::spell_effects::resolve(&mut expected, &mut m, &mut rng, 3, 4);
    assert_eq!(expected.hp, 0);
    assert!(expected.reincarnate(&mut rng));
    let pos = Pos::new(
        (rng.die(20) - 1) as u8,
        (rng.die(20) - 1) as u8,
        (rng.die(20) - 1) as u8,
    );
    g.cast(3, 4, None);
    assert_eq!(g.phase, Phase::Exploring);
    assert_eq!(g.player, expected);
    assert_eq!(g.pos, pos);
    save::validate(&g).unwrap();
}

#[test]
fn fatal_treasure_trap_does_not_award_gold_after_reincarnation() {
    let mut g = game(Class::Fighter);
    g.enter();
    g.player.hp = 1;
    g.player.stats[3] = 18;
    g.player.immortal = true;
    g.phase = Phase::Treasure(Loot::Gold {
        amount: 999,
        label: "Trapped gold".into(),
        trapped: true,
        chest: false,
    });
    g.take_loot(true);
    assert_eq!(g.phase, Phase::Exploring);
    assert_eq!(g.player.gold, 0);
    assert_eq!(g.player.stats[3], 17);
    save::validate(&g).unwrap();
}

#[test]
fn older_saves_migrate_continual_light_and_default_recovery_clock() {
    let mut g = game(Class::Cleric);
    g.enter();
    g.player.effects[LIGHT] = i32::MAX;
    let path = std::env::temp_dir().join(format!("dnd-old-light-{}.json", std::process::id()));
    save::write(&path, &g).unwrap();
    let mut json: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    json["game"]["player"]
        .as_object_mut()
        .unwrap()
        .remove("continual_light");
    json["game"]["player"]
        .as_object_mut()
        .unwrap()
        .remove("recovery_clock");
    std::fs::write(&path, serde_json::to_vec(&json).unwrap()).unwrap();
    let mut restored = save::read(&path).unwrap();
    assert!(restored.player.continual_light);
    assert_eq!(restored.player.recovery_clock, 0);
    restored.tick();
    assert_eq!(restored.player.effects[LIGHT], 50);
    assert!(restored.player.continual_light);
    std::fs::remove_file(path).unwrap();
}
