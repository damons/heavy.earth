use dnd_rs::{
    engine::{Game, Phase},
    player::Class,
    ui,
    world::{Dungeon, Pos},
};

#[test]
fn map_boundaries_match_original_printed_telengard_map() {
    let mut g = Game::new("Map check".into(), Class::Fighter, Dungeon::Telengard, 42);
    g.world_mut().purchased_maps[0] = true;
    g.world_mut().visited.fill(true);
    g.world_mut().cleared.fill(true);
    g.world_mut().secrets.fill(3);
    // Independent fixture sampled from the original TELENARD.L01 printed map:
    // boundary rows 4*y, columns 6*x and 6*x+2..=4; vertical centers 4*y+2.
    let expected: Vec<_> = include_str!("fixtures/telengard-map-edges.txt")
        .lines()
        .collect();
    assert_eq!(ui::explored_map(&g, 0), expected);
}

#[test]
fn unexplored_map_is_blank_and_gameplay_crop_preserves_visible_edges() {
    let mut g = Game::new("Map check".into(), Class::Fighter, Dungeon::Telengard, 42);
    assert!(
        ui::current_map(&g, true, 0)
            .iter()
            .all(|row| row.trim().is_empty())
    );
    for i in 0..400 {
        g.world_mut().visited[i] = i % 3 == 0;
    }
    g.phase = Phase::Exploring;
    for pos in [Pos::new(0, 14, 0), Pos::new(10, 10, 0), Pos::new(19, 19, 0)] {
        g.pos = pos;
        let full = ui::current_map(&g, true, 0);
        let x = usize::from(pos.x).saturating_sub(3).min(13) * 4;
        let y = usize::from(pos.y).saturating_sub(3).min(13) * 2;
        let expected: Vec<_> = full[y..y + 15].iter().map(|row| &row[x..x + 29]).collect();
        assert_eq!(ui::current_map(&g, false, 0), expected);
    }
}

#[test]
fn current_view_ignores_exploration_memory_and_follows_the_player() {
    let mut g = Game::new("Sight".into(), Class::Magician, Dungeon::Telengard, 42);
    g.phase = Phase::Exploring;
    g.pos = Pos::new(1, 1, 0);
    let blank_memory = ui::current_map(&g, true, 0);
    g.world_mut().visited.fill(true);
    assert_eq!(ui::current_map(&g, true, 0), blank_memory);
    assert_eq!(blank_memory[3].as_bytes()[6], b'@');
    g.pos = Pos::new(17, 17, 0);
    let moved = ui::current_map(&g, true, 0);
    assert!(moved[..10].iter().all(|row| row.trim().is_empty()));
    assert_eq!(moved[35].as_bytes()[70], b'@');
    assert!(
        ui::current_map(&g, true, 1)
            .iter()
            .all(|row| row.trim().is_empty())
    );
}

#[test]
fn darkness_hides_remote_contents_and_light_expiry_hides_them_again() {
    use dnd_rs::{player::LIGHT, world::Feature};
    let mut g = Game::new("Sight".into(), Class::Magician, Dungeon::Telengard, 42);
    g.phase = Phase::Exploring;
    // Locate an actual feature that is visible from an adjacent room.
    let mut pair = None;
    'outer: for y in 1..19 {
        for x in 1..19 {
            g.pos = Pos::new(x, y, 0);
            let view = dnd_rs::visibility::current(&g);
            for lx in 0..3 {
                for ly in 0..3 {
                    let p = dnd_rs::visibility::local_position(&g, lx, ly).unwrap();
                    if p != g.pos
                        && view.rooms[lx][ly]
                        && g.dungeon.cell(p).feature() != Feature::Empty
                    {
                        pair = Some(p);
                        break 'outer;
                    }
                }
            }
        }
    }
    let target = pair.expect("fixture map has an exposed feature");
    let room = |rows: Vec<String>| {
        rows[target.y as usize * 2 + 1][target.x as usize * 4 + 1..target.x as usize * 4 + 4]
            .to_owned()
    };
    assert_eq!(room(ui::current_map(&g, true, 0)), "   ");
    g.player.effects[LIGHT] = 1;
    assert_ne!(room(ui::current_map(&g, true, 0)), "   ");
    let before = g.clone();
    assert_eq!(ui::current_map(&g, true, 0), ui::current_map(&g, true, 0));
    assert_eq!(g, before);
    g.player.tick(&mut g.rng);
    assert_eq!(room(ui::current_map(&g, true, 0)), "   ");
    g.player.continual_light = true;
    assert_ne!(room(ui::current_map(&g, true, 0)), "   ");
}

#[test]
fn walls_doors_and_secrets_block_adjacent_room_contents() {
    use dnd_rs::visibility::View;
    for obstruction in 1..=3 {
        let mut v = View {
            west: [[0; 4]; 4],
            north: [[0; 4]; 4],
            rooms: [[true; 4]; 4],
        };
        v.west[1][1] = obstruction;
        v.west[2][1] = obstruction;
        v.north[1][1] = obstruction;
        v.north[1][2] = obstruction;
        v.clip();
        assert!(v.rooms[1][1]);
        for (x, y) in [
            (0, 1),
            (2, 1),
            (1, 0),
            (1, 2),
            (0, 0),
            (0, 2),
            (2, 0),
            (2, 2),
        ] {
            assert!(!v.rooms[x][y]);
        }
    }
}

#[test]
fn old_saves_restore_exploration_journal_and_purchased_charts() {
    use dnd_rs::save;
    let mut g = Game::new("Charts".into(), Class::Magician, Dungeon::Telengard, 42);
    g.player.bank = 100_000;
    g.buy("map", 2);
    assert!(g.world().purchased_maps[1]);
    g.phase = Phase::Exploring;
    g.pos = Pos::new(1, 1, 0);
    g.world_mut().visited[..400].fill(true);
    let mut json = serde_json::json!({"version":2,"game":g});
    for world in json["game"]["worlds"].as_array_mut().unwrap() {
        world.as_object_mut().unwrap().remove("purchased_maps");
    }
    let path = std::env::temp_dir().join(format!("dnd-visibility-{}.json", std::process::id()));
    std::fs::write(&path, serde_json::to_vec(&json).unwrap()).unwrap();
    let restored = save::read(&path).unwrap();
    std::fs::remove_file(path).unwrap();
    assert!(!restored.world().purchased_maps[0]);
    assert!(restored.world().purchased_maps[1]);
    assert_eq!(
        ui::current_map(&g, false, 0),
        ui::current_map(&restored, false, 0)
    );
    assert!(ui::map_text(&restored, 1).contains("Purchased map"));
    assert!(ui::map_text(&restored, 0).contains("Explored map"));
    assert!(!ui::map_text(&restored, 0).contains("Purchased map"));
    assert_eq!(ui::explored_map(&g, 0), ui::explored_map(&restored, 0));
    assert_eq!(ui::explored_map(&g, 1), ui::explored_map(&restored, 1));
}

#[test]
fn exploration_journal_accumulates_across_movement_darkness_and_levels() {
    use dnd_rs::player::LIGHT;
    let mut g = Game::new("Journal".into(), Class::Magician, Dungeon::Telengard, 42);
    assert!(
        ui::explored_map(&g, 0)
            .iter()
            .all(|row| row.trim().is_empty())
    );
    g.enter();
    let entrance = g.pos;
    g.player.effects[LIGHT] = 99;
    g.reveal();
    // Move away before taking the snapshot so the old player's @ is gone.
    g.pos = Pos::new(17, 17, 0);
    let first_area = ui::explored_map(&g, 0);
    g.reveal();
    let accumulated = ui::explored_map(&g, 0);
    assert_ne!(accumulated, first_area);
    let y = entrance.y as usize * 2;
    assert_eq!(accumulated[y], first_area[y]);
    assert_eq!(accumulated[y + 1], first_area[y + 1]);
    assert!(ui::current_map(&g, true, 0)[y].trim().is_empty());
    assert_eq!(accumulated[35].as_bytes()[70], b'@');
    g.player.effects[LIGHT] = 0;
    assert_eq!(ui::explored_map(&g, 0), accumulated);
    let before = g.clone();
    assert!(ui::map_text(&g, 0).contains(&accumulated.join("\n")));
    assert_eq!(
        g, before,
        "consulting the journal must not advance the game"
    );
    g.pos.z = 1;
    g.reveal();
    assert!(ui::map_text(&g, 0).contains("Explored map"));
    assert!(!ui::explored_map(&g, 0).join("\n").contains('@'));
    assert_eq!(ui::explored_map(&g, 0)[y], first_area[y]);
    assert_eq!(ui::explored_map(&g, 1)[35].as_bytes()[70], b'@');
    g.leave();
    assert!(ui::map_text(&g, 1).contains("Explored map"));
    assert!(!ui::explored_map(&g, 1).join("\n").contains('@'));
    g.dungeon = Dungeon::Shvenk;
    assert!(
        ui::explored_map(&g, 0)
            .iter()
            .all(|row| row.trim().is_empty())
    );
}

#[test]
fn journal_hides_unknown_rooms_and_updates_known_features() {
    use dnd_rs::world::Feature;
    let mut g = Game::new("Journal".into(), Class::Fighter, Dungeon::Telengard, 42);
    let p = (0..20)
        .flat_map(|y| (0..20).map(move |x| Pos::new(x, y, 0)))
        .find(|&p| g.dungeon.cell(p).feature() != Feature::Empty)
        .unwrap();
    let room = |rows: Vec<String>| {
        rows[p.y as usize * 2 + 1][p.x as usize * 4 + 1..p.x as usize * 4 + 4].to_owned()
    };
    assert_eq!(room(ui::explored_map(&g, 0)), "   ");
    g.world_mut().visited[p.index()] = true;
    assert_eq!(
        room(ui::explored_map(&g, 0)),
        g.dungeon.cell(p).feature().glyph()
    );
    g.world_mut().cleared[p.index()] = true;
    assert_eq!(room(ui::explored_map(&g, 0)), "   ");
    g.world_mut().visited.fill(false);
    g.world_mut().cleared.fill(false);
    g.world_mut().purchased_maps[0] = true;
    assert_eq!(
        room(ui::explored_map(&g, 0)),
        g.dungeon.cell(p).feature().glyph()
    );
    assert!(
        ui::current_map(&g, true, 0)
            .iter()
            .all(|row| row.trim().is_empty())
    );
}
