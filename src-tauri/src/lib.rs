use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

// One long-lived `codex app-server` (JSON-RPC over stdio, ChatGPT login from ~/.codex) shared by
// every conversation, like T3 Code does. The frontend owns the protocol: it writes raw JSON lines
// with `codex_send` and receives every line the server prints as a "codex" event.
#[derive(Default)]
struct Codex(Mutex<Option<ChildStdin>>);

fn spawn(app: &AppHandle) -> Result<ChildStdin, String> {
    // GUI apps don't inherit the shell PATH, so try the standalone install first.
    let home = std::env::var("HOME").unwrap_or_default();
    let local = format!("{home}/.local/bin/codex");
    let bin = if std::path::Path::new(&local).exists() { local } else { "codex".into() };

    let mut child = Command::new(bin)
        .arg("app-server")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Couldn't start Codex CLI: {e}"))?;
    let mut stdin = child.stdin.take().unwrap();
    // Handshake first; stdin is ordered, so any request the frontend sends next lands after it.
    let hello = r#"{"id":"init","method":"initialize","params":{"clientInfo":{"name":"second_brain","version":"0.1.0"},"capabilities":{"experimentalApi":true,"requestAttestation":false}}}
{"method":"initialized"}"#;
    writeln!(stdin, "{hello}").map_err(|e| e.to_string())?;
    let stdout = BufReader::new(child.stdout.take().unwrap());
    let app = app.clone();
    std::thread::spawn(move || {
        for line in stdout.lines().map_while(Result::ok) {
            let _ = app.emit("codex", line);
        }
        let _ = child.wait();
        app.state::<Codex>().0.lock().unwrap().take();
        let _ = app.emit("codex-exit", ());
    });
    Ok(stdin)
}

#[tauri::command]
fn codex_send(app: AppHandle, state: State<Codex>, line: String) -> Result<(), String> {
    let mut guard = state.0.lock().unwrap();
    if guard.is_none() {
        *guard = Some(spawn(&app)?);
    }
    let stdin = guard.as_mut().unwrap();
    let res = writeln!(stdin, "{line}").and_then(|_| stdin.flush());
    if let Err(e) = res {
        guard.take();
        return Err(format!("Codex stopped: {e}"));
    }
    Ok(())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Codex::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![codex_send])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
