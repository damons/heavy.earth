//! Disk-backed workshop projects, separate from adventure rules and saves.
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

pub const MAX_BYTES: usize = 40_000_000;
pub struct DungeonLibrary {
    directory: PathBuf,
}
impl DungeonLibrary {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }
    fn path(&self, id: &str) -> Result<PathBuf, String> {
        if !id.starts_with("dungeon-")
            || id.len() > 80
            || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("Invalid dungeon ID".into());
        }
        Ok(self.directory.join(format!("{id}.json")))
    }
    pub fn read(&self, id: &str) -> Result<Value, String> {
        let path = self.path(id)?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_BYTES as u64 {
            return Err("Dungeon exceeds the 40 MB limit".into());
        }
        let data: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if data["format"] != "heavy-earth-dungeon" || data["version"] != 1 || data["id"] != id {
            return Err("Unsupported dungeon file".into());
        }
        Ok(data)
    }
    fn summary(data: &Value) -> Value {
        let panels = data["draft"]["panels"].as_array();
        let levels: std::collections::BTreeSet<_> = panels
            .into_iter()
            .flatten()
            .filter_map(|p| p["level"].as_u64())
            .collect();
        json!({"id":data["id"],"name":data["name"],"revision":data["revision"],"updated":data["updated"],"panels":panels.map_or(0, Vec::len),"levels":levels.len()})
    }
    pub fn list(&self) -> Result<Value, String> {
        if !self.directory.exists() {
            return Ok(json!({"dungeons":[], "warnings":[]}));
        }
        let mut items = Vec::new();
        let mut warnings = Vec::new();
        for entry in fs::read_dir(&self.directory).map_err(|e| e.to_string())? {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            match self.read(id) {
                Ok(data) => items.push(Self::summary(&data)),
                Err(_) => warnings.push(format!("Could not read {id}; its file was preserved.")),
            }
        }
        items.sort_by(|a, b| {
            b["updated"]
                .as_u64()
                .cmp(&a["updated"].as_u64())
                .then_with(|| a["id"].as_str().cmp(&b["id"].as_str()))
        });
        Ok(json!({"dungeons":items,"warnings":warnings}))
    }
    pub fn save(&self, input: &Value) -> Result<Value, String> {
        let name = input["name"].as_str().unwrap_or_default().trim();
        if name.is_empty() || name.chars().count() > 80 {
            return Err("Dungeon name must contain 1–80 characters".into());
        }
        let draft = &input["draft"];
        if draft["format"] != "heavy-earth-panel-draft"
            || draft["version"] != 3
            || draft["projection"]
                != json!({"standard":"HE8-2to1-0.5in-v1","ratio":"2:1","previewPixels":800,"tileWidthInches":0.5})
            || draft["panels"].as_array().is_none_or(|p| p.len() > 16)
        {
            return Err("Expected an HE8 version 3 draft with at most 16 panels".into());
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?;
        let (id, revision, created) = if input["id"].is_null() {
            (
                format!("dungeon-{}", now.as_nanos()),
                1,
                now.as_millis() as u64,
            )
        } else {
            let id = input["id"].as_str().ok_or("Invalid dungeon ID")?;
            let current = self.read(id)?;
            let revision = current["revision"]
                .as_u64()
                .ok_or("Invalid saved revision")?;
            if input["revision"].as_u64() != Some(revision) {
                return Err("This dungeon changed in another tab. Your edits are still here. Save as a new dungeon to keep both versions.".into());
            }
            (
                id.to_owned(),
                revision.checked_add(1).ok_or("Revision overflow")?,
                current["created"].as_u64().unwrap_or(0),
            )
        };
        let record = json!({"format":"heavy-earth-dungeon","version":1,"id":id,"name":name,"revision":revision,"created":created,"updated":now.as_millis() as u64,"draft":draft});
        let bytes = serde_json::to_vec(&record).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BYTES {
            return Err(
                "Dungeon exceeds the 40 MB limit. Keep fewer panels or smaller preview images."
                    .into(),
            );
        }
        fs::create_dir_all(&self.directory).map_err(|e| e.to_string())?;
        let target = self.path(&id)?;
        let temp = target.with_extension(format!("{}.tmp", now.as_nanos()));
        let result = (|| -> std::io::Result<()> {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            fs::rename(&temp, &target)?;
            Ok(())
        })();
        if let Err(e) = result {
            let _ = fs::remove_file(temp);
            return Err(format!("Could not save dungeon: {e}"));
        }
        Ok(Self::summary(&record))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!(
            "heavy-earth-library-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    fn input(name: &str) -> Value {
        json!({"name":name,"draft":{"format":"heavy-earth-panel-draft","version":3,"projection":{"standard":"HE8-2to1-0.5in-v1","ratio":"2:1","previewPixels":800,"tileWidthInches":0.5},"panels":[]}})
    }
    #[test]
    fn independent_dungeons_survive_restart_and_reject_stale_writes() {
        let directory = temp();
        let store = DungeonLibrary::new(directory.clone());
        let a = store.save(&input("First")).unwrap();
        let b = store.save(&input("Second")).unwrap();
        assert_ne!(a["id"], b["id"]);
        let mut edit = input("Renamed");
        edit["id"] = a["id"].clone();
        edit["revision"] = a["revision"].clone();
        assert_eq!(store.save(&edit).unwrap()["revision"], 2);
        assert!(store.save(&edit).unwrap_err().contains("another tab"));
        let reopened = DungeonLibrary::new(directory.clone());
        assert_eq!(
            reopened.read(a["id"].as_str().unwrap()).unwrap()["name"],
            "Renamed"
        );
        assert_eq!(
            reopened.read(b["id"].as_str().unwrap()).unwrap()["name"],
            "Second"
        );
        assert_eq!(
            reopened.list().unwrap()["dungeons"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn rejects_paths_invalid_envelopes_and_preserves_unreadable_files() {
        let directory = temp();
        let store = DungeonLibrary::new(directory.clone());
        assert!(store.read("../../escape").is_err());
        assert!(store.save(&input(" ")).is_err());
        let mut invalid = input("Test");
        invalid["draft"]["projection"]["ratio"] = json!("3:1");
        assert!(store.save(&invalid).is_err());
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("dungeon-broken.json"), b"broken").unwrap();
        assert_eq!(
            store.list().unwrap()["warnings"].as_array().unwrap().len(),
            1
        );
        assert_eq!(
            fs::read(directory.join("dungeon-broken.json")).unwrap(),
            b"broken"
        );
        fs::remove_dir_all(directory).unwrap();
    }
}
