use dnd_rs::{
    engine::Game,
    player::{Class, STAT_NAMES},
    save, ui,
    world::Dungeon,
};
use std::{
    io::{self, IsTerminal, Write},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
fn ask(prompt: &str) -> io::Result<Option<String>> {
    print!("{prompt}");
    io::stdout().flush()?;
    let mut s = String::new();
    if io::stdin().read_line(&mut s)? == 0 {
        return Ok(None);
    }
    Ok(Some(s.trim().to_owned()))
}
fn main() {
    if let Err(e) = run() {
        eprintln!("DND: {e}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut name = None;
    let mut class = None;
    let mut dungeon = Dungeon::Telengard;
    let mut seed = None;
    let mut plain = false;
    let mut new = false;
    let mut resume = false;
    let mut save_path = None;
    let mut dos_source = None;
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        match a.as_str() {
            "--help" | "-h" => {
                println!(
                    "DND - a Rust recreation of classic DOS DND\n\ncargo run --release\n\nOptions:\n  --new              Create a character (never overwrites an existing save)\n  --resume           Resume the selected save\n  --import-dos PATH  Import a DOS v1.2:1 PLAYERS.DAT character; select with --name\n  --name NAME        Character name (default: Adventurer)\n  --class CLASS      fighter, cleric, magician\n  --dungeon NAME     telengard, shvenk, lamorte, warren, cavern\n  --seed NUMBER      Reproducible random seed\n  --save PATH        Save file (default: saves/NAME.json)\n  --plain            Line-oriented interface for terminals and scripts\n\nInteractive controls: arrows or W/A/X/D, F fight, E evade, C cast,\nB spellbook, H help, M map, : full command, Q save and quit.\nNew games start in town. Enter begins an expedition.\n\nSee README.md and docs/FIDELITY.md."
                );
                return Ok(());
            }
            "--name" => name = Some(args.next().ok_or("--name needs a value")?),
            "--class" => {
                class = Some(
                    Class::parse(&args.next().ok_or("--class needs a value")?)
                        .ok_or("Unknown class")?,
                )
            }
            "--dungeon" => {
                dungeon = Dungeon::parse(&args.next().ok_or("--dungeon needs a value")?)
                    .ok_or("Unknown dungeon")?
            }
            "--seed" => seed = Some(args.next().ok_or("--seed needs a number")?.parse::<u64>()?),
            "--save" => save_path = Some(PathBuf::from(args.next().ok_or("--save needs a path")?)),
            "--import-dos" => {
                dos_source = Some(PathBuf::from(
                    args.next().ok_or("--import-dos needs a path")?,
                ))
            }
            "--plain" => plain = true,
            "--new" => new = true,
            "--resume" => resume = true,
            _ => return Err(format!("Unknown option: {a}. Use --help.").into()),
        }
    }
    if dos_source.is_some() && (new || resume) {
        return Err("Use --import-dos separately from --new and --resume".into());
    }
    let imported = if let Some(source) = &dos_source {
        let g = dnd_rs::dos_save::import(source, name.as_deref(), seed.unwrap_or(1))?;
        name = Some(g.player.name.clone());
        Some(g)
    } else {
        None
    };
    if new && resume {
        return Err("Choose either --new or --resume".into());
    }
    if name.is_none() && save_path.is_none() && io::stdin().is_terminal() {
        println!("\n  D N D\n  Descend into the original dungeons. Return with the Orb.\n");
        if !new && !resume {
            let Some(answer) = ask("[N]ew character  [R]esume  [Q]uit: ")? else {
                return Ok(());
            };
            match answer.to_lowercase().as_str() {
                "q" => return Ok(()),
                "r" => resume = true,
                _ => new = true,
            }
        }
        let Some(n) = ask("Character name: ")? else {
            return Ok(());
        };
        name = Some(n);
        if !resume && class.is_none() {
            loop {
                let Some(c) = ask("[F]ighter, [C]leric, or [M]agician: ")? else {
                    return Ok(());
                };
                if let Some(c) = Class::parse(&c) {
                    class = Some(c);
                    break;
                }
            }
        }
        if !resume {
            loop {
                let Some(d) = ask("Dungeon: [T]elengard [S]hvenk [L]amorte [W]arren [C]avern: ")?
                else {
                    return Ok(());
                };
                if let Some(d) = Dungeon::parse(&d) {
                    dungeon = d;
                    break;
                }
            }
        }
    }
    let name = name.unwrap_or_else(|| "Adventurer".into());
    if name.trim().is_empty() || name.len() > 64 || name.chars().any(char::is_control) {
        return Err("Name must be 1-64 bytes without control characters".into());
    }
    let filename: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    let path = save_path.unwrap_or_else(|| PathBuf::from("saves").join(format!("{filename}.json")));
    if (new || imported.is_some()) && path.exists() {
        return Err(format!(
            "A save already exists at {}. Use --resume or choose another --save path.",
            path.display()
        )
        .into());
    }
    let mut g = if let Some(g) = imported {
        g
    } else if resume || (!new && path.exists()) {
        save::read(&path)?
    } else {
        let seed = seed.unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos() as u64
        });
        let mut g = Game::new(name, class.unwrap_or(Class::Fighter), dungeon, seed);
        if io::stdin().is_terminal() && !plain {
            loop {
                println!(
                    "{}",
                    STAT_NAMES
                        .iter()
                        .zip(g.player.stats)
                        .map(|(s, n)| format!("{s} {n:2}"))
                        .collect::<Vec<_>>()
                        .join("   ")
                );
                let Some(choice) = ask("Enter accepts, R rerolls, Q cancels: ")? else {
                    return Ok(());
                };
                if choice.eq_ignore_ascii_case("q") {
                    return Ok(());
                }
                if choice.eq_ignore_ascii_case("r") {
                    g.player = dnd_rs::player::Player::new(
                        g.player.name.clone(),
                        g.player.class,
                        &mut g.rng,
                    );
                } else {
                    break;
                }
            }
        }
        g
    };
    save::write(&path, &g)?;
    ui::run(&mut g, &path, plain)?;
    println!("Adventure saved: {}", path.display());
    Ok(())
}
