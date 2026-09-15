use crate::view;
use dnd_rs::{
    engine::Game,
    player::{Class, Player},
    save,
    world::Dungeon,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub struct Session {
    pub game: Option<Game>,
    pub draft: Option<Game>,
    pub revision: u64,
    pub save_id: String,
    directory: PathBuf,
}
fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}
fn field<'a>(v: &'a Value, key: &str) -> Result<&'a str, String> {
    v[key].as_str().ok_or_else(|| format!("Missing {key}"))
}
impl Session {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            game: None,
            draft: None,
            revision: 0,
            save_id: String::new(),
            directory,
        }
    }
    pub fn state(&self) -> Value {
        self.game
            .as_ref()
            .map(|g| view::snapshot(g, self.revision, &self.save_id))
            .unwrap_or(json!({"phase":"Title","revision":self.revision}))
    }
    pub fn list(&self) -> Result<Value, String> {
        fs::create_dir_all(&self.directory).map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        for entry in fs::read_dir(&self.directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "json") {
                let id = path
                    .file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                if !valid_id(&id) {
                    continue;
                }
                match save::read(&path) {
                    Ok(g) => entries.push(json!({"id":id,"name":g.player.name,"class":g.player.class.name(),
                        "level":g.player.level,"dungeon":g.dungeon.name(),"phase":view::phase_name(&g)})),
                    Err(_) => entries.push(json!({"id":id,"name":id,"invalid":true})),
                }
            }
        }
        entries.sort_by_key(|v| v["id"].as_str().unwrap_or_default().to_owned());
        Ok(json!(entries))
    }
    pub fn roll(&mut self, v: &Value) -> Result<Value, String> {
        let name = field(v, "name")?.trim();
        if name.is_empty() || name.len() > 64 || name.chars().any(char::is_control) {
            return Err("Name must be 1–64 bytes without control characters".into());
        }
        let class = Class::parse(field(v, "class")?).ok_or("Unknown class")?;
        let dungeon = Dungeon::parse(field(v, "dungeon")?).ok_or("Unknown dungeon")?;
        let g =
            if let Some(d) = self.draft.take().filter(|d| {
                d.player.name == name && d.player.class == class && d.dungeon == dungeon
            }) {
                let mut d = d;
                d.player = Player::new(name.into(), class, &mut d.rng);
                d
            } else {
                Game::new(name.into(), class, dungeon, timestamp())
            };
        // Branding belongs to the UI; retain the engine's journal verbatim.
        save::validate(&g).map_err(|e| e.to_string())?;
        let state = view::snapshot(&g, self.revision, "");
        self.draft = Some(g);
        Ok(state)
    }
    pub fn begin(&mut self) -> Result<Value, String> {
        let g = self.draft.as_ref().ok_or("Roll a character first")?;
        let slug: String = g
            .player
            .name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() {
                    c.to_ascii_lowercase()
                } else {
                    '_'
                }
            })
            .collect();
        let id = format!("{slug}-{}", timestamp());
        let path = self.directory.join(format!("{id}.json"));
        if path.exists() {
            return Err("Save already exists; try again".into());
        }
        save::write(&path, g).map_err(|e| e.to_string())?;
        self.game = self.draft.take();
        self.save_id = id;
        self.revision += 1;
        Ok(self.state())
    }
    pub fn resume(&mut self, id: &str) -> Result<Value, String> {
        if !valid_id(id) {
            return Err("Invalid save ID".into());
        }
        let g =
            save::read(&self.directory.join(format!("{id}.json"))).map_err(|e| e.to_string())?;
        self.game = Some(g);
        self.save_id = id.into();
        self.revision += 1;
        Ok(self.state())
    }
    /// Commit to disk before publishing a turn. Failed writes leave memory intact.
    pub fn command(&mut self, command: &str, revision: u64) -> Result<Value, String> {
        if revision != self.revision {
            return Err("The adventure changed in another tab. Refresh and try again.".into());
        }
        if command.len() > 256 || command.chars().any(char::is_control) {
            return Err("Invalid command".into());
        }
        let mut candidate = self
            .game
            .as_ref()
            .ok_or("Start or resume an adventure first")?
            .clone();
        candidate.command(command);
        save::write(
            &self.directory.join(format!("{}.json", self.save_id)),
            &candidate,
        )
        .map_err(|e| e.to_string())?;
        self.game = Some(candidate);
        self.revision += 1;
        Ok(self.state())
    }
    pub fn route(&mut self, route: &str, v: &Value) -> Result<Value, String> {
        match route {
            "/api/roll" => self.roll(v),
            "/api/begin" => self.begin(),
            "/api/resume" => self.resume(field(v, "id")?),
            "/api/command" => self.command(
                field(v, "command")?,
                v["revision"].as_u64().ok_or("Missing revision")?,
            ),
            _ => Err("Unknown endpoint".into()),
        }
    }
}
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() < 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
pub fn save_directory() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../saves")
}
