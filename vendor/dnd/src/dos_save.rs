//! Read-only import of the 128-byte records written by DOS v1.2:1 (0217:0161).
use crate::{
    engine::{Game, Phase},
    player::Class,
    save,
    world::{Dungeon, Pos},
};
use std::{fs, io, path::Path};
fn invalid(s: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, s.into())
}
fn word(b: &[u8], offset: usize) -> i32 {
    i16::from_le_bytes([b[offset], b[offset + 1]]) as i32
}
fn long(b: &[u8], offset: usize) -> i64 {
    i32::from_le_bytes(b[offset..offset + 4].try_into().unwrap()) as i64
}
fn name(b: &[u8]) -> io::Result<String> {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    let s = b[..end]
        .iter()
        .map(|&c| {
            if c < 128 {
                c as char
            } else {
                CP437[(c - 128) as usize]
            }
        })
        .collect::<String>()
        .trim_end()
        .to_owned();
    if s.is_empty() || s.chars().any(char::is_control) {
        return Err(invalid("Invalid DOS character name"));
    }
    Ok(s)
}
/// Missing world, encounter and RNG state is freshly initialized. Secret names
/// are deliberately omitted; the source file is only ever opened for reading.
pub fn import(path: &Path, selected: Option<&str>, seed: u64) -> io::Result<Game> {
    if fs::metadata(path)?.len() > 1_048_576 {
        return Err(invalid("DOS player file is too large"));
    }
    let bytes = fs::read(path)?;
    if bytes.is_empty() || bytes.len() % 128 != 0 {
        return Err(invalid(
            "Expected DOS v1.2:1 PLAYERS.DAT: whole 128-byte records",
        ));
    }
    let mut records = Vec::new();
    for (i, b) in bytes.chunks_exact(128).enumerate() {
        if b[..16] == [b' '; 16] {
            if (i + 1) * 128 != bytes.len() {
                return Err(invalid("Data follows the DOS end marker"));
            }
            break;
        }
        records.push((name(&b[..16])?, b));
    }
    let matches: Vec<_> = records
        .iter()
        .filter(|(n, _)| selected.is_none_or(|s| s.eq_ignore_ascii_case(n)))
        .collect();
    if matches.len() != 1 {
        return Err(invalid(format!(
            "Select one DOS character with --name. Available: {}",
            records
                .iter()
                .map(|(n, _)| n.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        )));
    }
    let (name, b) = matches[0];
    let class = match b[0x26] {
        0 => Class::Fighter,
        1 => Class::Cleric,
        2 => Class::Magician,
        _ => return Err(invalid("Invalid DOS class")),
    };
    let dungeon = *Dungeon::ALL
        .get(b[0x3d] as usize)
        .ok_or_else(|| invalid("Invalid DOS dungeon"))?;
    if b[0x3a] > 21 || b[0x3b] > 21 || b[0x3c] > 20 || b[0x74] > 1 || b[0x7c] > 1 {
        return Err(invalid("Invalid DOS position or Orb flag"));
    }
    let mut g = Game::new(name.clone(), class, dungeon, seed);
    let p = &mut g.player;
    p.stats = std::array::from_fn(|i| b[0x20 + i] as i8 as i32);
    p.level = word(b, 0x28);
    p.xp = long(b, 0x2a);
    p.max_hp = word(b, 0x2e);
    p.hp = word(b, 0x30);
    p.gold = long(b, 0x32);
    p.bank = long(b, 0x36);
    p.treasure_xp = long(b, 0x3e);
    p.cloak = word(b, 0x42);
    p.boots = word(b, 0x44);
    p.ring = word(b, 0x46);
    p.shield = word(b, 0x48);
    p.armor = word(b, 0x4a);
    p.weapon = word(b, 0x4c);
    p.slots = std::array::from_fn(|i| word(b, 0x56 + i * 2));
    p.effects = std::array::from_fn(|i| word(b, 0x5e + i * 2));
    p.immortal = b[0x74] != 0;
    p.orb = b[0x7c] != 0;
    p.continual_light = word(b, 0x7e) & 1 != 0;
    p.recovery_clock = word(b, 0x7a);
    // The prototype models wand charges as one pool. Never silently flatten a
    // DOS fighter's four spell tiers into that incompatible representation.
    if word(b, 0x7e) & 8 != 0 {
        return Err(invalid(
            "This character has a DOS magic wand; its tiered charges are not yet supported by the importer",
        ));
    }
    let exploring = (1..=20).contains(&b[0x3a]) && (1..=20).contains(&b[0x3b]) && b[0x3c] > 0;
    if exploring {
        g.pos = Pos::new(b[0x3a] - 1, b[0x3b] - 1, b[0x3c] - 1);
        g.phase = if p.hp <= 0 {
            p.hp = 0;
            Phase::Dead
        } else {
            Phase::Exploring
        };
    } else {
        // The DOS save immediately after creation has current HP=0 and unused
        // spell slots; its entry routine restores them before play.
        p.restore();
        g.phase = Phase::Town;
    }
    save::validate(&g)?;
    if g.phase == Phase::Exploring {
        g.initialize_level();
        g.reveal();
    }
    g.log.clear();
    g.say("Imported DOS character. Room populations, exploration memory and RNG start fresh.");
    g.say("Original secret name, map-display flags and autosave counter are omitted.");
    Ok(g)
}

const CP437: [char; 128] = [
    'Ç', 'ü', 'é', 'â', 'ä', 'à', 'å', 'ç', 'ê', 'ë', 'è', 'ï', 'î', 'ì', 'Ä', 'Å', 'É', 'æ', 'Æ',
    'ô', 'ö', 'ò', 'û', 'ù', 'ÿ', 'Ö', 'Ü', '¢', '£', '¥', '₧', 'ƒ', 'á', 'í', 'ó', 'ú', 'ñ', 'Ñ',
    'ª', 'º', '¿', '⌐', '¬', '½', '¼', '¡', '«', '»', '░', '▒', '▓', '│', '┤', '╡', '╢', '╖', '╕',
    '╣', '║', '╗', '╝', '╜', '╛', '┐', '└', '┴', '┬', '├', '─', '┼', '╞', '╟', '╚', '╔', '╩', '╦',
    '╠', '═', '╬', '╧', '╨', '╤', '╥', '╙', '╘', '╒', '╓', '╫', '╪', '┘', '┌', '█', '▄', '▌', '▐',
    '▀', 'α', 'ß', 'Γ', 'π', 'Σ', 'σ', 'µ', 'τ', 'Φ', 'Θ', 'Ω', 'δ', '∞', 'φ', 'ε', '∩', '≡', '±',
    '≥', '≤', '⌠', '⌡', '÷', '≈', '°', '∙', '·', '√', 'ⁿ', '²', '■', ' ',
];
