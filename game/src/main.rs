use heavy_earth::{
    session::{Session, save_directory},
    view,
};
use serde_json::{Value, json};
use std::{io::Read, path::PathBuf};
use tiny_http::{Header, Method, Request, Response, Server};

fn header(key: &str, value: &str) -> Header {
    Header::from_bytes(key, value).unwrap()
}
fn send(req: Request, status: u16, mime: &str, bytes: Vec<u8>) {
    let response = Response::from_data(bytes).with_status_code(status)
        .with_header(header("Content-Type",mime))
        .with_header(header("Cache-Control","no-store"))
        .with_header(header("X-Content-Type-Options","nosniff"))
        .with_header(header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"));
    if let Err(e) = req.respond(response) {
        eprintln!("Response failed: {e}");
    }
}
fn json_response(req: Request, value: Result<Value, String>) {
    let (status, v) = match value {
        Ok(v) => (200, v),
        Err(e) => (400, json!({"error":e})),
    };
    send(
        req,
        status,
        "application/json",
        serde_json::to_vec(&v).unwrap(),
    );
}
fn run() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut port = 7878u16;
    let mut directory = save_directory();
    let mut open = false;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => port = args.next().ok_or("--port needs a number")?.parse()?,
            "--saves" => directory = PathBuf::from(args.next().ok_or("--saves needs a directory")?),
            "--open" => open = true,
            "--help" | "-h" => {
                println!(
                    "HEAVY.EARTH\n  --open         Open the game in your browser\n  --port N       Local port (default 7878)\n  --saves PATH   Separate save directory\nStop the server with Ctrl-C. Every action is saved."
                );
                return Ok(());
            }
            _ => return Err(format!("Unknown option: {arg}").into()),
        }
    }
    let server = Server::http((std::net::Ipv4Addr::LOCALHOST, port))?;
    let address = server.server_addr().to_ip().ok_or("Missing TCP address")?;
    let host = address.to_string();
    let url = format!("http://{host}");
    let local_host = format!("localhost:{}", address.port());
    println!(
        "HEAVY.EARTH\nPlay: {url}\nSaves: {}\nCtrl-C stops the server. Every action is saved.",
        directory.display()
    );
    if open {
        let executable = if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        };
        if let Err(e) = std::process::Command::new(executable).arg(&url).spawn() {
            eprintln!("Open {url} in a browser ({e})");
        }
    }
    let mut session = Session::new(directory);
    for mut req in server.incoming_requests() {
        let get_header = |name: &'static str| {
            req.headers()
                .iter()
                .find(|h| h.field.equiv(name))
                .map(|h| h.value.as_str().to_owned())
        };
        let request_host = get_header("Host").unwrap_or_default();
        if request_host != host && request_host != local_host {
            send(req, 403, "text/plain", b"Local host required".to_vec());
            continue;
        }
        let route = req.url().to_owned();
        if *req.method() == Method::Post {
            let origin = get_header("Origin");
            let valid_origin =
                origin.is_none_or(|s| s == url || s == format!("http://{local_host}"));
            if !valid_origin
                || get_header("X-Heavy-Earth").as_deref() != Some("1")
                || !get_header("Content-Type")
                    .unwrap_or_default()
                    .starts_with("application/json")
            {
                send(
                    req,
                    403,
                    "text/plain",
                    b"Same-origin JSON requests required".to_vec(),
                );
                continue;
            }
            let mut body = Vec::new();
            if req.body_length().is_some_and(|n| n > 4096)
                || req.as_reader().take(4097).read_to_end(&mut body).is_err()
                || body.len() > 4096
            {
                send(req, 413, "text/plain", b"Request too large".to_vec());
                continue;
            }
            let result = serde_json::from_slice::<Value>(&body)
                .map_err(|e| e.to_string())
                .and_then(|v| session.route(&route, &v));
            json_response(req, result);
            continue;
        }
        if *req.method() != Method::Get {
            send(req, 405, "text/plain", b"Method not allowed".to_vec());
            continue;
        }
        match route.as_str() {
            "/api/state" => json_response(req, Ok(session.state())),
            "/api/saves" => json_response(req, session.list()),
            path if path.starts_with("/api/map?level=") => {
                let result = path
                    .trim_start_matches("/api/map?level=")
                    .parse::<u8>()
                    .ok()
                    .filter(|n| (1..=20).contains(n))
                    .ok_or("Level must be 1–20".into())
                    .and_then(|n| {
                        session
                            .game
                            .as_ref()
                            .map(|g| view::journal(g, n - 1))
                            .ok_or("No active adventure".into())
                    });
                json_response(req, result);
            }
            "/" | "/index.html" => send(
                req,
                200,
                "text/html; charset=utf-8",
                include_bytes!("../web/index.html").to_vec(),
            ),
            "/style.css" => send(
                req,
                200,
                "text/css",
                include_bytes!("../web/style.css").to_vec(),
            ),
            "/app.js" => send(
                req,
                200,
                "text/javascript",
                include_bytes!("../web/app.js").to_vec(),
            ),
            "/grid.js" => send(
                req,
                200,
                "text/javascript",
                include_bytes!("../web/grid.js").to_vec(),
            ),
            "/panel-grid.svg" => send(
                req,
                200,
                "image/svg+xml",
                include_bytes!("../web/panel-grid.svg").to_vec(),
            ),
            "/panel-template.pdf" => send(
                req,
                200,
                "application/pdf",
                include_bytes!("../../output/pdf/heavy-earth-8x8-template.pdf").to_vec(),
            ),
            "/renderer.js" => send(
                req,
                200,
                "text/javascript",
                include_bytes!("../web/renderer.js").to_vec(),
            ),
            "/panel-overview.js" => send(
                req,
                200,
                "text/javascript",
                include_bytes!("../web/panel-overview.js").to_vec(),
            ),
            "/panels.js" => send(
                req,
                200,
                "text/javascript",
                include_bytes!("../web/panels.js").to_vec(),
            ),
            "/brand.png" => send(
                req,
                200,
                "image/png",
                include_bytes!("../web/brand.png").to_vec(),
            ),
            _ => send(req, 404, "text/plain", b"Not found".to_vec()),
        }
    }
    Ok(())
}
fn main() {
    if let Err(e) = run() {
        eprintln!("HEAVY.EARTH: {e}");
        std::process::exit(1);
    }
}
