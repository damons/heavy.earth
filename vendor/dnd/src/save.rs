use crate::{
    engine::{Game, Loot, Phase},
    world::{Dungeon, ROOMS},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};
const VERSION: u32 = 2;
#[derive(Serialize, Deserialize)]
struct Save {
    version: u32,
    game: Game,
}
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}
pub fn validate(g: &Game) -> io::Result<()> {
    let p = &g.player;
    if matches!(g.rng, crate::rng::Rng::Dos { dos: 0 }) {
        return Err(invalid("DOS random state cannot be zero"));
    }
    if !g.pos.valid() || g.worlds.len() != Dungeon::ALL.len() {
        return Err(invalid("Invalid dungeon position or world count"));
    }
    if g.worlds.iter().any(|w| {
        w.visited.len() != ROOMS
            || w.contents.len() != ROOMS
            || w.cleared.len() != ROOMS
            || w.secrets.len() != ROOMS
            || w.combinations.len() != ROOMS
            || w.initialized.len() != 20
            || w.contents.iter().any(|&n| n > 7)
            || w.secrets.iter().any(|&n| n > 3)
            || w.combinations.iter().any(|&n| n > 15 && n != 255)
    }) {
        return Err(invalid("Invalid dungeon state"));
    }
    if p.name.is_empty()
        || p.name.len() > 64
        || p.name.chars().any(char::is_control)
        || !(1..=10000).contains(&p.level)
        || !(1..=1_000_000).contains(&p.max_hp)
        || p.hp < 0
        || p.hp > p.max_hp
        || p.stats.iter().enumerate().any(|(i, &s)| {
            !(if i == 3 && g.phase == Phase::Dead {
                0
            } else {
                1
            }..=100)
                .contains(&s)
        })
    {
        return Err(invalid("Invalid character attributes"));
    }
    if [p.gold, p.bank, p.treasure_xp]
        .iter()
        .any(|&n| !(0..=1_000_000_000_000).contains(&n))
        || !(-1..=1_000_000_000_000).contains(&p.xp)
        || [p.weapon, p.armor, p.ring, p.boots, p.cloak, p.wand]
            .iter()
            .any(|&n| !(0..=1_000_000).contains(&n))
        || !(-1..=1_000_000).contains(&p.shield)
        || p.slots.iter().any(|&n| !(0..=100000).contains(&n))
        || p.effects.iter().any(|&n| n < 0)
        || !(-32768..=32767).contains(&p.recovery_clock)
    {
        return Err(invalid("Invalid character inventory"));
    }
    if g.log.len() > 100
        || g.log
            .iter()
            .any(|s| s.len() > 1000 || s.chars().any(char::is_control))
        || !(1..=8).contains(&g.fountain_color)
    {
        return Err(invalid("Invalid journal"));
    }
    if let Phase::Combat(m) = &g.phase
        && (m.kind >= 15
            || !(1..=100000).contains(&m.level)
            || m.hp < 1
            || m.max_hp < m.hp
            || m.max_hp > 10_000_000
            || !(0..=100000).contains(&m.strength)
            || !(0..=100000).contains(&m.armor)
            || !(0..=100000).contains(&m.held)
            || m.name.len() > 64
            || m.name.chars().any(char::is_control))
    {
        return Err(invalid("Invalid encounter"));
    }
    if let Phase::Treasure(loot) = &g.phase {
        match loot {
            Loot::Gold { amount, label, .. }
                if !(0..=1_000_000_000).contains(amount)
                    || label.len() > 100
                    || label.chars().any(char::is_control) =>
            {
                return Err(invalid("Invalid treasure"));
            }
            Loot::Item { kind, power } if *kind > 8 || !(1..=1000).contains(power) => {
                return Err(invalid("Invalid item"));
            }
            _ => {}
        }
    }
    Ok(())
}
pub fn write(path: &Path, g: &Game) -> io::Result<()> {
    validate(g)?;
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec(&Save {
        version: VERSION,
        game: g.clone(),
    })
    .map_err(|e| invalid(e.to_string()))?;
    let temp = path.with_extension(format!("{}.tmp", std::process::id()));
    let mut file = fs::File::create(&temp)?;
    file.write_all(&json)?;
    file.sync_all()?;
    // Rename is atomic on the supported Unix desktop. Never truncate a good save.
    fs::rename(&temp, path)?;
    Ok(())
}
pub fn read(path: &Path) -> io::Result<Game> {
    if fs::metadata(path)?.len() > 5_000_000 {
        return Err(invalid("Save is too large"));
    }
    let mut save: Save = serde_json::from_slice(&fs::read(path)?)
        .map_err(|e| invalid(format!("Cannot read save: {e}")))?;
    if save.version != 1 && save.version != VERSION {
        return Err(invalid(format!(
            "Unsupported save version {}",
            save.version
        )));
    }
    if save.game.player.effects[crate::player::LIGHT] == i32::MAX {
        save.game.player.effects[crate::player::LIGHT] = 50;
        save.game.player.continual_light = true;
    }
    validate(&save.game)?;
    // Older purchases set every room visited and BOTH secret bits on every
    // cell, including ordinary walls. Exploration never sets that signature.
    for world in &mut save.game.worlds {
        for level in 0..20 {
            let range = level * 400..(level + 1) * 400;
            if world.visited[range.clone()].iter().all(|v| *v)
                && world.secrets[range].iter().all(|s| *s == 3)
            {
                world.purchased_maps[level] = true;
            }
        }
    }
    Ok(save.game)
}
