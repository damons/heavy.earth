use crate::{
    engine::{Game, Loot, Phase},
    player::*,
    spells,
    world::*,
};
use crossterm::{
    cursor,
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute, queue,
    style::{Color, ResetColor, SetForegroundColor},
    terminal::{self, Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen},
};
use std::{
    io::{self, IsTerminal, Write},
    path::Path,
};

pub const HELP: &str = "DND - field guide\n\nFind the Orb in your dungeon and bring it to the surface. Stay near the\nentrance until stronger. Leaving banks gold, awards treasure experience,\nand restores health and spells. Death is permanent for mortal characters.\n\nMovement: arrows or W/A/X/D; keypad 8/4/2/6. S or 5 waits one turn.\n9 or U climbs up; 3 climbs down. Search finds hidden doors.\nCombat: F or 1 fights; E or 7 evades; C opens spell entry.\nTreasure: Enter or Y takes; I or Delete ignores.\nRoom choices: use the indicated command. I ignores a room.\nH shows help. B shows spells. M shows your cumulative explored map.\n: enters a full command. Q saves and quits. F5 saves. Ctrl-C also saves.\n\nCommands work in --plain mode, one per line:\n  enter / north / east / south / west / wait / search / interact\n  up / down / fight / evade / take / ignore\n  cast TIER NUMBER [direction]  (example: cast 1 3)\n  drink / worship / give 100 / desecrate / sit / pry / read / look\n  rg  (two trove colors: r=red, g=green, b=blue, o=orange)\n  buy ring 1 / buy weapon 1 / buy book 2 / buy map 1\n  travel telengard / travel shvenk / travel lamorte / travel warren\n  travel cavern / continue (after winning)\n  spells / status / map [level] / help / save / quit\n\nOnly banked gold can be spent at the store. Equipment purchases give full\ncredit for the existing bonus. Maps cost 50,000 gold per dungeon level.\nAn Orb disables elevators and the Excelsior Transporter; keep magic ready.\nSecret doors appear as walls until discovered. Light helps identify nearby
room contents in gameplay. M keeps a record of explored rooms, even in
darkness. Use map LEVEL to consult explored or purchased maps on other levels.\n\nThis is a source-informed recreation. See docs/FIDELITY.md for differences.";

pub fn spellbook(class: Class) -> String {
    let mut out = format!(
        "{} spellbook\n* = combat spell. Use cast TIER NUMBER.\n",
        if class == Class::Cleric {
            "Clerical"
        } else {
            "Magic"
        }
    );
    if class == Class::Fighter {
        out.push_str("Fighters use a wand; each cast spends TIER charges.\n");
    }
    for tier in 1..=4 {
        out.push_str(&format!("\nLevel {tier}\n"));
        for number in 1..=6 {
            if let Some(s) = spells::spell(class, tier, number) {
                out.push_str(&format!(
                    " {number}{} {:<22} {}\n",
                    if s.combat { "*" } else { " " },
                    s.name,
                    s.description
                ));
            }
        }
    }
    out
}
pub fn prompt(g: &Game) -> String {
    match &g.phase {
        Phase::Town => "Town> Enter: expedition | :buy ITEM N | :travel DUNGEON".into(),
        Phase::Exploring => "Move> arrows / W A X D | C cast | S wait | I interact".into(),
        Phase::Combat(m) => format!(
            "Battle> F fight | E evade | C cast   [{} HP {}]",
            m.name, m.hp
        ),
        Phase::Treasure(t) => format!(
            "Treasure> Enter/Y take | I ignore{}",
            if matches!(t, Loot::Gold { trapped: true, .. }) && g.player.active(DETECT) {
                "  [TRAP DETECTED]"
            } else {
                ""
            }
        ),
        Phase::Choice(f) => match f {
            Feature::Down => "Stairs> D/3 down | I ignore",
            Feature::Up => "Stairs> U/9 up | I ignore",
            Feature::Stairs => "Stairs> U/9 up | D/3 down | I ignore",
            Feature::Pit => "Pit> D/3 climb down | I ignore",
            Feature::Fountain => "Fountain> Enter/Y drink | I ignore",
            Feature::Altar => "Altar> W worship | :give AMOUNT | D desecrate | I ignore",
            Feature::Throne => "Throne> S sit | P pry | R read | I ignore",
            Feature::Mirror => "Mirror> Enter/Y look | I ignore",
            Feature::Trove => "Trove> :RG (two colors R/G/B/O) | I ignore",
            Feature::Transporter => "Transporter> :LEVEL (1-20) | I ignore",
            _ => "Room> I ignore",
        }
        .into(),
        Phase::Dead => "DEAD | Q: save and quit; start a new character to play again".into(),
        Phase::Won => "IMMORTALITY! | Enter: continue adventuring | Q: save".into(),
    }
}
pub fn status(g: &Game) -> Vec<String> {
    let p = &g.player;
    let mut out = vec![
        format!("{} the {}", p.name, p.class.name()),
        format!(
            "Level {}  XP {} / {}",
            p.level,
            p.xp,
            experience(p.class, p.level + 1)
        ),
        format!(
            "HITS {:>4} / {:<4} {}",
            p.hp,
            p.max_hp,
            if p.immortal { "IMMORTAL" } else { "" }
        ),
        format!("Gold {}   Bank {}", p.gold, p.bank),
        format!(
            "STR {:>2}  INT {:>2}  WIS {:>2}",
            p.stats[0], p.stats[1], p.stats[2]
        ),
        format!(
            "CON {:>2}  DEX {:>2}  CHA {:>2}",
            p.stats[3], p.stats[4], p.stats[5]
        ),
        format!("Weapon +{}   Armor +{}", p.weapon, p.armor),
        format!(
            "Shield {}    Ring +{}",
            if p.shield < 0 {
                "none".into()
            } else {
                format!("+{}", p.shield)
            },
            p.ring
        ),
        format!("Boots +{}    Cloak +{}", p.boots, p.cloak),
        format!(
            "Spells {} / {} / {} / {}",
            p.slots[0], p.slots[1], p.slots[2], p.slots[3]
        ),
        format!(
            "Wand {} charges{}",
            p.wand,
            if p.orb { "  [ORB]" } else { "" }
        ),
    ];
    let effects: Vec<_> = EFFECT_NAMES
        .iter()
        .enumerate()
        .filter(|(i, _)| p.active(*i))
        .map(|(i, s)| {
            format!(
                "{}:{}",
                s,
                if i == crate::player::LIGHT && p.continual_light {
                    "inf".into()
                } else {
                    p.effects[i].to_string()
                }
            )
        })
        .collect();
    for line in wrap(&effects.join(" "), 40) {
        out.push(line);
    }
    out
}
/// Paint only actual boundaries. Doorframes share wall endpoints; the original
/// DOS alphabet uses a gap for a vertical door and dashes for a horizontal one.
fn draw_edge(grid: &mut [Vec<char>], g: &Game, p: Pos, d: Direction, x: usize, y: usize) {
    let edge = g.dungeon.edge(p, d);
    if edge == Edge::Open {
        return;
    }
    let seen = g
        .edge_key(p, d)
        .is_some_and(|(q, b)| g.world().secrets[q.index()] & b != 0);
    let horizontal = matches!(d, Direction::North | Direction::South);
    let glyph = match edge {
        Edge::Door => {
            if horizontal {
                '-'
            } else {
                ' '
            }
        }
        Edge::Secret if seen => {
            if horizontal {
                '.'
            } else {
                ':'
            }
        }
        _ => 'I',
    };
    grid[y][x] = 'I';
    if horizontal {
        grid[y][x + 1..x + 4].fill(glyph);
        grid[y][x + 4] = 'I';
    } else {
        grid[y + 1][x] = glyph;
        grid[y + 2][x] = 'I';
    }
}
/// Persistent exploration journal, independent of the live sight/light mask.
pub fn explored_map(g: &Game, level: u8) -> Vec<String> {
    let mut grid = vec![vec![' '; SIZE * 4 + 1]; SIZE * 2 + 1];
    let chart = g.world().purchased_maps[level as usize];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let p = Pos::new(x as u8, y as u8, level);
            if !chart && !g.world().visited[p.index()] {
                continue;
            }
            // All four boundaries belong to a known room, even when its
            // neighbor has not been explored. Never draw that neighbor's contents.
            draw_edge(&mut grid, g, p, Direction::North, x * 4, y * 2);
            draw_edge(&mut grid, g, p, Direction::West, x * 4, y * 2);
            draw_edge(&mut grid, g, p, Direction::East, (x + 1) * 4, y * 2);
            draw_edge(&mut grid, g, p, Direction::South, x * 4, (y + 1) * 2);
            let glyph = if p == g.pos && !matches!(g.phase, Phase::Town | Phase::Won) {
                " @ "
            } else if g.world().cleared[p.index()] {
                "   "
            } else {
                g.dungeon.cell(p).feature().glyph()
            };
            for (i, ch) in glyph.chars().enumerate() {
                grid[y * 2 + 1][x * 4 + 1 + i] = ch;
            }
        }
    }
    grid.iter().map(|row| row.iter().collect()).collect()
}

/// Live dungeon view. `full` selects the canvas size, never exploration memory.
pub fn current_map(g: &Game, full: bool, level: u8) -> Vec<String> {
    let mut grid = vec![vec![' '; SIZE * 4 + 1]; SIZE * 2 + 1];
    if level == g.pos.z {
        let view = crate::visibility::current(g);
        // A redraw observes a stable snapshot; inspecting the map cannot reroll
        // what you see or advance the combat/encounter random stream.
        let mut sight_rng = g.rng;
        for y in 0..4 {
            for x in 0..4 {
                if let Some(p) = crate::visibility::local_position(g, x, y) {
                    if view.north[x][y] != 0 {
                        draw_edge(
                            &mut grid,
                            g,
                            p,
                            Direction::North,
                            p.x as usize * 4,
                            p.y as usize * 2,
                        );
                    }
                    if view.west[x][y] != 0 {
                        draw_edge(
                            &mut grid,
                            g,
                            p,
                            Direction::West,
                            p.x as usize * 4,
                            p.y as usize * 2,
                        );
                    }
                    if view.rooms[x][y] {
                        let glyph = crate::visibility::room_glyph(g, p, &mut sight_rng);
                        for (i, ch) in glyph.chars().enumerate() {
                            grid[p.y as usize * 2 + 1][p.x as usize * 4 + 1 + i] = ch;
                        }
                    }
                } else {
                    if view.west[x][y] != 0
                        && x > 0
                        && let Some(p) = crate::visibility::local_position(g, x - 1, y)
                    {
                        draw_edge(
                            &mut grid,
                            g,
                            p,
                            Direction::East,
                            (p.x as usize + 1) * 4,
                            p.y as usize * 2,
                        );
                    }
                    if view.north[x][y] != 0
                        && y > 0
                        && let Some(p) = crate::visibility::local_position(g, x, y - 1)
                    {
                        draw_edge(
                            &mut grid,
                            g,
                            p,
                            Direction::South,
                            p.x as usize * 4,
                            (p.y as usize + 1) * 2,
                        );
                    }
                }
            }
        }
    }
    let (x0, y0, n) = if full {
        (0, 0, SIZE)
    } else {
        (
            usize::from(g.pos.x).saturating_sub(3).min(13),
            usize::from(g.pos.y).saturating_sub(3).min(13),
            7,
        )
    };
    grid[y0 * 2..=(y0 + n) * 2]
        .iter()
        .map(|row| row[x0 * 4..=(x0 + n) * 4].iter().collect())
        .collect()
}
pub fn map_text(g: &Game, level: u8) -> String {
    let chart = g.world().purchased_maps[level as usize];
    format!(
        "{} - Level {} - {}\n{}\n@ you  I wall  --- / gap door  : / ... secret\n{}",
        g.dungeon.name(),
        level + 1,
        if chart {
            "Purchased map"
        } else {
            "Explored map"
        },
        explored_map(g, level).join("\n"),
        if chart {
            "A purchased map shows the layout of this level."
        } else {
            "Only explored rooms are shown. Updated automatically as you explore."
        }
    )
}
pub fn wrap(text: &str, width: usize) -> Vec<String> {
    let mut out = vec![];
    let mut line = String::new();
    for word in text.split_whitespace() {
        if !line.is_empty() && line.chars().count() + 1 + word.chars().count() > width {
            out.push(line);
            line = String::new();
        }
        if !line.is_empty() {
            line.push(' ');
        }
        line.push_str(word);
    }
    if !line.is_empty() {
        out.push(line);
    }
    out
}
struct Terminal;
impl Terminal {
    fn enter() -> io::Result<Self> {
        terminal::enable_raw_mode()?;
        let guard = Self;
        execute!(io::stdout(), EnterAlternateScreen, cursor::Hide)?;
        Ok(guard)
    }
}
impl Drop for Terminal {
    fn drop(&mut self) {
        let _ = execute!(io::stdout(), ResetColor, cursor::Show, LeaveAlternateScreen);
        let _ = terminal::disable_raw_mode();
    }
}
fn screen(lines: &[String], footer: &str) -> io::Result<()> {
    let (w, h) = terminal::size()?;
    let mut out = io::stdout();
    queue!(out, cursor::MoveTo(0, 0), Clear(ClearType::All))?;
    for (i, line) in lines.iter().take(h.saturating_sub(2) as usize).enumerate() {
        queue!(
            out,
            cursor::MoveTo(0, i as u16),
            SetForegroundColor(if i == 0 { Color::Cyan } else { Color::Grey })
        )?;
        write!(
            out,
            "{}",
            line.chars()
                .take(w.saturating_sub(1) as usize)
                .collect::<String>()
        )?;
    }
    queue!(
        out,
        cursor::MoveTo(0, h.saturating_sub(1)),
        SetForegroundColor(Color::Yellow)
    )?;
    write!(
        out,
        "{}",
        footer
            .chars()
            .take(w.saturating_sub(1) as usize)
            .collect::<String>()
    )?;
    queue!(out, ResetColor)?;
    out.flush()
}
fn read_key() -> io::Result<event::KeyEvent> {
    loop {
        if let Event::Key(k) = event::read()?
            && k.kind != KeyEventKind::Release
        {
            return Ok(k);
        }
    }
}
fn overlay(text: &str) -> io::Result<()> {
    let rows: Vec<_> = text.lines().map(str::to_owned).collect();
    let mut offset = 0;
    loop {
        screen(
            &rows[offset..],
            "Up/Down or PgUp/PgDn to scroll | Esc / Enter to return",
        )?;
        let k = read_key()?;
        let page = terminal::size()?.1.saturating_sub(3) as usize;
        match k.code {
            KeyCode::Down => offset = (offset + 1).min(rows.len().saturating_sub(page)),
            KeyCode::PageDown => offset = (offset + page).min(rows.len().saturating_sub(page)),
            KeyCode::Up => offset = offset.saturating_sub(1),
            KeyCode::PageUp => offset = offset.saturating_sub(page),
            _ => return Ok(()),
        }
    }
}
fn command_line(g: &Game, prefix: &str) -> io::Result<Option<String>> {
    let mut input = prefix.to_owned();
    loop {
        draw(g, &format!(":{input}_   [Enter to send, Esc to cancel]"))?;
        let k = read_key()?;
        match k.code {
            KeyCode::Esc => return Ok(None),
            KeyCode::Enter => return Ok(Some(input)),
            KeyCode::Backspace => {
                input.pop();
            }
            KeyCode::Char(c) if !c.is_control() && input.len() < 120 => input.push(c),
            _ => {}
        }
    }
}
fn draw(g: &Game, footer: &str) -> io::Result<()> {
    let (w, h) = terminal::size()?;
    if w < 78 || h < 24 {
        return screen(
            &[
                "DND".into(),
                "Please enlarge the terminal to at least 78 columns by 24 rows.".into(),
                "Or restart with --plain for the scrolling text interface.".into(),
            ],
            "Q saves and quits",
        );
    }
    let mut lines = vec![
        format!(
            " D N D    /    {}    /    Depth {:02}   ({:02},{:02})   Turn {}",
            g.dungeon.name(),
            g.depth(),
            g.pos.x + 1,
            g.pos.y + 1,
            g.turns
        ),
        " ============================================================================".into(),
    ];
    let map = current_map(g, false, g.pos.z);
    let stats = status(g);
    for i in 0..15 {
        lines.push(format!(
            " {:29}   {}",
            map.get(i).map(String::as_str).unwrap_or(""),
            stats.get(i).map(String::as_str).unwrap_or("")
        ));
    }
    lines.push(
        " ---------------------------------------------------------------------------".into(),
    );
    let available = h.saturating_sub(22).max(1) as usize;
    let logs: Vec<_> = g.log.iter().flat_map(|s| wrap(s, 75)).collect();
    for s in logs.iter().skip(logs.len().saturating_sub(available)) {
        lines.push(format!(" {s}"));
    }
    lines.push(format!(" {}", prompt(g)));
    screen(&lines, footer)
}
pub fn run(g: &mut Game, path: &Path, plain: bool) -> io::Result<()> {
    if plain || !io::stdin().is_terminal() || !io::stdout().is_terminal() {
        return run_plain(g, path);
    }
    let _terminal = Terminal::enter()?;
    loop {
        draw(
            g,
            " H help   B spells   M map   : command   F5 save   Q save & quit",
        )?;
        let key = match event::read()? {
            Event::Key(k) if k.kind != KeyEventKind::Release => k,
            _ => continue,
        };
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            crate::save::write(path, g)?;
            return Ok(());
        }
        let text = match key.code {
            KeyCode::Char('q' | 'Q') => {
                crate::save::write(path, g)?;
                return Ok(());
            }
            KeyCode::F(5) => {
                crate::save::write(path, g)?;
                g.say("Adventure saved.");
                continue;
            }
            KeyCode::Char('h' | 'H' | '?') => {
                overlay(HELP)?;
                continue;
            }
            KeyCode::Char('b' | 'B') => {
                overlay(&spellbook(g.player.class))?;
                continue;
            }
            KeyCode::Char('m' | 'M') => {
                overlay(&map_text(g, g.pos.z))?;
                continue;
            }
            KeyCode::Char(':') => match command_line(g, "")? {
                Some(s) => s,
                None => continue,
            },
            KeyCode::Char('c' | 'C' | '-') => match command_line(g, "cast ")? {
                Some(s) => s,
                None => continue,
            },
            KeyCode::Up | KeyCode::Right | KeyCode::Down | KeyCode::Left => {
                if matches!(g.phase, Phase::Choice(_)) {
                    g.command("ignore");
                }
                match key.code {
                    KeyCode::Up => "north",
                    KeyCode::Right => "east",
                    KeyCode::Down => "south",
                    _ => "west",
                }
                .into()
            }
            KeyCode::Delete | KeyCode::Esc => "ignore".into(),
            KeyCode::Enter => match g.phase {
                Phase::Choice(Feature::Fountain) => "drink",
                Phase::Choice(Feature::Mirror) => "look",
                Phase::Choice(Feature::Transporter | Feature::Trove) => {
                    if let Some(s) = command_line(g, "")? {
                        dispatch(g, &s, path)?;
                    }
                    continue;
                }
                Phase::Won => "continue",
                _ => "",
            }
            .into(),
            KeyCode::Char(ch) => {
                let ch = ch.to_ascii_lowercase();
                match (&g.phase, ch) {
                    (Phase::Choice(Feature::Throne), 's') => "sit".into(),
                    (Phase::Choice(Feature::Throne), 'p') => "pry".into(),
                    (Phase::Choice(Feature::Throne), 'r') => "read".into(),
                    (Phase::Choice(Feature::Altar), 'w') => "worship".into(),
                    (Phase::Choice(Feature::Altar), 'd') => "desecrate".into(),
                    (Phase::Exploring, 'i') => "interact".into(),
                    (Phase::Exploring, 'r') => "search".into(),
                    (Phase::Choice(_), 'i') => "ignore".into(),
                    (Phase::Choice(Feature::Trove | Feature::Transporter), _) => {
                        if let Some(s) = command_line(g, &ch.to_string())? {
                            dispatch(g, &s, path)?;
                        }
                        continue;
                    }
                    _ => ch.to_string(),
                }
            }
            _ => continue,
        };
        let command = text.trim().to_lowercase();
        if command == "help" || command == "h" {
            overlay(HELP)?;
            continue;
        }
        if command == "spells" {
            overlay(&spellbook(g.player.class))?;
            continue;
        }
        if command == "status" {
            overlay(&status(g).join("\n"))?;
            continue;
        }
        if command == "map" || command.starts_with("map ") {
            let z = command
                .split_whitespace()
                .nth(1)
                .and_then(|s| s.parse::<u8>().ok())
                .filter(|&z| (1..=20).contains(&z))
                .map(|z| z - 1)
                .unwrap_or(g.pos.z);
            overlay(&map_text(g, z))?;
            continue;
        }
        if dispatch(g, &text, path)? {
            return Ok(());
        }
    }
}
fn dispatch(g: &mut Game, text: &str, path: &Path) -> io::Result<bool> {
    let s = text.trim().to_lowercase();
    match s.as_str() {
        "quit" | "q" => {
            crate::save::write(path, g)?;
            return Ok(true);
        }
        "save" => {
            crate::save::write(path, g)?;
            g.say("Adventure saved.");
        }
        _ => {
            g.command(text);
            crate::save::write(path, g)?;
        }
    }
    Ok(false)
}
fn run_plain(g: &mut Game, path: &Path) -> io::Result<()> {
    println!(
        "DND / {} / {} the {}",
        g.dungeon.name(),
        g.player.name,
        g.player.class.name()
    );
    println!("Type help for commands. Each action is saved automatically.");
    for msg in &g.log {
        println!("{msg}");
    }
    loop {
        println!("{}", status(g).join(" | "));
        println!("{}", prompt(g));
        io::stdout().flush()?;
        let mut line = String::new();
        if io::stdin().read_line(&mut line)? == 0 {
            crate::save::write(path, g)?;
            return Ok(());
        }
        let text = line.trim().to_lowercase();
        match text.as_str() {
            "help" | "h" => println!("{HELP}"),
            "spells" => println!("{}", spellbook(g.player.class)),
            "status" => println!("{}", status(g).join("\n")),
            _ if text == "map" || text.starts_with("map ") => {
                let z = text
                    .split_whitespace()
                    .nth(1)
                    .and_then(|s| s.parse::<u8>().ok())
                    .filter(|&z| (1..=20).contains(&z))
                    .map(|z| z - 1)
                    .unwrap_or(g.pos.z);
                println!("{}", map_text(g, z));
            }
            _ => {
                let previous = g.log.clone();
                if dispatch(g, &line, path)? {
                    println!("Saved to {}", path.display());
                    return Ok(());
                }
                let common = (0..=previous.len().min(g.log.len()))
                    .rev()
                    .find(|&n| previous[previous.len() - n..] == g.log[..n])
                    .unwrap_or(0);
                for msg in &g.log[common..] {
                    println!("{msg}");
                }
            }
        }
    }
}
