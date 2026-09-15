use dnd_rs::{
    dos_save,
    engine::Phase,
    player::{Class, LIGHT},
    save,
    world::{Dungeon, Pos},
};
use std::{
    fs,
    process::{Command, Stdio},
};
#[test]
fn imports_original_writer_records_without_modifying_source() {
    let dir = std::env::temp_dir().join(format!("dnd-import-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("PLAYERS.DAT");
    let original = include_bytes!("fixtures/PLAYERS.DAT");
    fs::write(&path, original).unwrap();
    assert!(
        dos_save::import(&path, None, 42)
            .unwrap_err()
            .to_string()
            .contains("DOS Mage")
    );
    let f = dos_save::import(&path, Some("DOS Fighter"), 42).unwrap();
    assert_eq!(f.player.class, Class::Fighter);
    assert_eq!(f.phase, Phase::Town);
    assert_eq!(f.player.hp, f.player.stats[3]);
    let g = dos_save::import(&path, Some("dos mage"), 42).unwrap();
    assert_eq!(g.player.class, Class::Magician);
    assert_eq!(g.dungeon, Dungeon::Cavern);
    assert_eq!(g.pos, Pos::new(4, 14, 0));
    assert_eq!(g.phase, Phase::Exploring);
    assert_eq!(g.player.hp, 6);
    assert_eq!(g.player.gold, 1234);
    assert_eq!(g.player.bank, 56789);
    assert_eq!(
        [
            g.player.cloak,
            g.player.boots,
            g.player.ring,
            g.player.shield,
            g.player.armor,
            g.player.weapon
        ],
        [1, 2, 3, 4, 5, 6]
    );
    assert!(g.player.orb && g.player.immortal);
    assert_eq!(g.player.effects[LIGHT], 100);
    assert!(g.player.continual_light);
    let output = dir.join("converted.json");
    let run = || {
        Command::new(env!("CARGO_BIN_EXE_dnd-rs"))
            .arg("--import-dos")
            .arg(&path)
            .args(["--name", "DOS Mage", "--plain", "--save"])
            .arg(&output)
            .stdin(Stdio::null())
            .output()
            .unwrap()
    };
    let result = run();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let serialized = fs::read(&output).unwrap();
    assert!(!String::from_utf8_lossy(&serialized).contains("fixture-secret"));
    save::read(&output).unwrap();
    assert!(!run().status.success());
    assert_eq!(serialized, fs::read(&output).unwrap());
    assert_eq!(fs::read(&path).unwrap(), original);
    // Truncation, trailing garbage, invalid class and coordinate validation.
    for bad in [
        original[..127].to_vec(),
        {
            let mut b = original.to_vec();
            b.push(0);
            b
        },
        {
            let mut b = original.to_vec();
            b[0x26] = 9;
            b
        },
        {
            let mut b = original.to_vec();
            b[0x3a] = 255;
            b
        },
        {
            let mut b = original.to_vec();
            b[0x7e] = 8;
            b
        },
    ] {
        fs::write(&path, bad).unwrap();
        assert!(dos_save::import(&path, Some("DOS Fighter"), 1).is_err());
    }
    fs::remove_dir_all(dir).unwrap();
}
#[test]
fn version_one_numeric_rng_migrates_without_losing_state() {
    let path = std::env::temp_dir().join(format!("dnd-migration-{}.json", std::process::id()));
    let g = dnd_rs::engine::Game::new("Old".into(), Class::Fighter, Dungeon::Warren, 42);
    let mut v = serde_json::json!({"version":1,"game":g});
    v["game"]["rng"] = serde_json::json!(123456789_u64);
    fs::write(&path, serde_json::to_vec(&v).unwrap()).unwrap();
    let g = save::read(&path).unwrap();
    assert_eq!(g.rng, dnd_rs::rng::Rng::Legacy(123456789));
    save::write(&path, &g).unwrap();
    let v: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(v["version"], 2);
    assert_eq!(save::read(&path).unwrap(), g);
    fs::remove_file(path).unwrap();
}
