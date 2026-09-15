use std::{
    io::Write,
    process::{Command, Stdio},
};
#[test]
fn cli_creation_play_resume_eof_and_overwrite_protection() {
    let root = std::env::temp_dir().join(format!("dnd-cli-test-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("hero.json");
    let run = |args: &[&str], input: &str| {
        let mut child = Command::new(env!("CARGO_BIN_EXE_dnd-rs"))
            .args(args)
            .arg("--plain")
            .arg("--save")
            .arg(&path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        child.wait_with_output().unwrap()
    };
    let output = run(
        &[
            "--new", "--name", "Smoke", "--class", "cleric", "--seed", "42",
        ],
        "enter\nmap\nwest\nquit\n",
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let g = dnd_rs::save::read(&path).unwrap();
    assert_eq!(g.phase, dnd_rs::engine::Phase::Town);
    assert!(g.world().visited.iter().any(|&v| v));
    let output = run(&["--resume"], "");
    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("Smoke"));
    let before = std::fs::read(&path).unwrap();
    let output = run(&["--new"], "");
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("already exists"));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    std::fs::remove_dir_all(root).unwrap();
}
