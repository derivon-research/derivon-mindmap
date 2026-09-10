use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex as AsyncMutex},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationModel {
    pub provider_id: String,
    pub model_id: String,
    /// The catalog's display name when it declares one; the panel falls back to the id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

struct ConversationProcess {
    stdin: ChildStdin,
}

/// How many companion stderr lines to keep for diagnosis.
const STDERR_HISTORY: usize = 40;

/// Blank out anything shaped like a credential before it is kept or shown.
///
/// The companion is not supposed to print keys, but its output reaches both the
/// application log and the panel, and #59 requires that a key never lands in either.
/// Over-redacting a diagnostic is cheap; leaking one is not.
///
/// Runs of credential-ish characters are scanned directly rather than whitespace-
/// separated words, so `token=<key>` and `"apiKey": "<key>"` are covered too.
fn redact_credentials(line: &str) -> String {
    fn secretish(run: &str) -> bool {
        if run.starts_with("sk-") && run.len() >= 12 {
            return true;
        }
        run.len() >= 24 && run.chars().any(|c| c.is_ascii_digit())
    }

    let mut out = String::with_capacity(line.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        if secretish(run) {
            out.push_str("<REDACTED>");
        } else {
            out.push_str(run);
        }
        run.clear();
    };
    for character in line.chars() {
        if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
            run.push(character);
        } else {
            flush(&mut run, &mut out);
            out.push(character);
        }
    }
    flush(&mut run, &mut out);
    out
}

fn describe_exit(stderr: &Arc<Mutex<Vec<String>>>) -> String {
    let recent = stderr.lock().unwrap();
    if recent.is_empty() {
        "Pi companion exited unexpectedly, with no output.".to_owned()
    } else {
        format!(
            "Pi companion exited unexpectedly:\n{}",
            recent.join("\n")
        )
    }
}

pub struct ConversationState {
    process: Arc<AsyncMutex<Option<ConversationProcess>>>,
    child: Arc<Mutex<Option<Child>>>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    /// The companion's last diagnostic lines. Without this a failed start is
    /// indistinguishable from an empty catalog once it reaches the panel.
    stderr: Arc<Mutex<Vec<String>>>,
}

impl ConversationState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(AsyncMutex::new(None)),
            child: Arc::new(Mutex::new(None)),
            next_id: AtomicU64::new(1),
            pending: Arc::new(Mutex::new(HashMap::new())),
            stderr: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl Default for ConversationState {
    fn default() -> Self {
        Self::new()
    }
}

fn script_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let path = resource_dir.join("companion.mjs");
        if path.is_file() {
            return Ok(path);
        }
    }
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist-companion/companion.mjs");
    if path.is_file() {
        Ok(path)
    } else {
        Err("companion script is missing; run npm run build:companion".to_owned())
    }
}

/// The Node runtime shipped beside the executable.
///
/// Never the operator's own `node`: the application must not require one, and silently
/// borrowing it would let a bundle ship without its sidecar and still appear to work
/// here while failing on a machine that has no Node.
fn node_path() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("cannot locate the application executable: {error}"))?;
    let directory = executable
        .parent()
        .ok_or_else(|| "the application executable has no directory".to_owned())?;
    if let Ok(entries) = std::fs::read_dir(directory) {
        for entry in entries.flatten() {
            if entry.file_name().to_string_lossy().starts_with("node-") {
                return Ok(entry.path());
            }
        }
    }
    let bundled = directory.join("node");
    if bundled.is_file() {
        return Ok(bundled);
    }
    Err(format!(
        "the bundled Node runtime is missing from {}; run npm run prepare:companion",
        directory.to_string_lossy()
    ))
}

/// The application's own configuration directory, created if this is a first run.
///
/// The companion reads `models.json` and `auth.json` from here and nowhere else; it does
/// not consult `~/.pi/`. See ADR-0010.
fn config_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("no application configuration directory: {error}"))?;
    std::fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "could not create {}: {error}",
            directory.to_string_lossy()
        )
    })?;
    Ok(directory)
}

/// Variables the companion is allowed to inherit.
///
/// Everything else is dropped, so no provider credential, agent directory or cloud
/// profile from the operator's environment can reach Pi's ambient credential fallback.
/// This is defence in depth: the companion also refuses any credential Pi does not
/// attribute to the application's own files.
const INHERITED_ENVIRONMENT: [&str; 5] = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];

async fn start(app: &AppHandle) -> Result<ConversationProcess, String> {
    let script = script_path(app)?;
    let node = node_path()?;
    let config = config_directory(app)?;
    let inherited: Vec<(String, String)> = INHERITED_ENVIRONMENT
        .iter()
        .filter_map(|name| std::env::var(name).ok().map(|value| ((*name).to_owned(), value)))
        .collect();
    let mut command = Command::new(node);
    command
        .arg(script)
        .arg("--config-dir")
        .arg(&config)
        .env_clear()
        .envs(inherited)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start Pi companion: {error}"))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Pi companion stdin is unavailable".to_owned())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Pi companion stdout is unavailable".to_owned())?;
    let child_stderr = child.stderr.take();
    let state = app.state::<ConversationState>();
    let pending = state.pending.clone();
    let process = state.process.clone();
    let child_handle = state.child.clone();
    let event_app = app.clone();
    let stderr_log = state.stderr.clone();
    *state.child.lock().unwrap() = Some(child);
    if let Some(stream) = child_stderr {
        let stderr_log = stderr_log.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                let line = redact_credentials(&line);
                eprintln!("[pi-companion] {line}");
                let mut log = stderr_log.lock().unwrap();
                if log.len() == STDERR_HISTORY {
                    log.remove(0);
                }
                log.push(line);
            }
        });
    }
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if let Some(id) = value.get("id").and_then(Value::as_u64) {
                let mut response = value;
                if let Some(object) = response.as_object_mut() {
                    object.remove("id");
                }
                if let Some(sender) = pending.lock().unwrap().remove(&id) {
                    let _ = sender.send(response);
                }
            } else if value.get("type").and_then(Value::as_str) == Some("event") {
                let mode = value
                    .get("mode")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let event = value.get("event").cloned().unwrap_or(Value::Null);
                let payload = json!({ "mode": mode, "event": event });
                let _ = event_app.emit("conversation://event", payload);
            }
        }
        {
            let mut child_guard = child_handle.lock().unwrap();
            if let Some(mut child) = child_guard.take() {
                let _ = child.start_kill();
            }
        }
        let reason = describe_exit(&stderr_log);
        let failed: HashMap<_, _> = pending.lock().unwrap().drain().collect();
        for (_, sender) in failed {
            let _ = sender.send(json!({
                "type": "error",
                "message": reason,
            }));
        }
        for mode in ["learning", "authoring"] {
            let _ = event_app.emit("conversation://event", json!({
                "mode": mode,
                "event": { "kind": "error", "message": reason },
            }));
            let _ = event_app.emit("conversation://event", json!({
                "mode": mode,
                "event": { "kind": "settled" },
            }));
        }
        *process.lock().await = None;
    });
    Ok(ConversationProcess { stdin })
}

async fn request(app: &AppHandle, mut command: Value) -> Result<Value, String> {
    let state = app.state::<ConversationState>();
    let process = state.process.clone();
    let mut guard = process.lock().await;
    if guard.is_none() {
        *guard = Some(start(app).await?);
    }
    let process = guard
        .as_mut()
        .ok_or_else(|| "Pi companion is unavailable".to_owned())?;
    if let Some(object) = command.as_object_mut() {
        object.insert("id".to_owned(), json!(state.next_id.fetch_add(1, Ordering::Relaxed)));
    }
    let line = serde_json::to_string(&command)
        .map_err(|error| format!("failed to encode Pi companion request: {error}"))?;
    let id = command
        .get("id")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Pi companion request has no id".to_owned())?;
    let (sender, receiver) = oneshot::channel();
    state.pending.lock().unwrap().insert(id, sender);
    process
        .stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|error| {
            state.pending.lock().unwrap().remove(&id);
            format!("failed to write to Pi companion: {error}")
        })?;
    process
        .stdin
        .write_all(b"\n")
        .await
        .map_err(|error| {
            state.pending.lock().unwrap().remove(&id);
            format!("failed to write to Pi companion: {error}")
        })?;
    drop(guard);
    let response = receiver
        .await
        .map_err(|_| "Pi companion exited before responding".to_owned())?;
    if response.get("type").and_then(Value::as_str) == Some("error") {
        let message = response
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Pi companion request failed");
        return Err(message.to_owned());
    }
    Ok(response)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationCatalog {
    pub models: Vec<ConversationModel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnosis: Option<String>,
}

#[tauri::command]
pub async fn conversation_list_models(app: AppHandle) -> Result<ConversationCatalog, String> {
    let response = request(&app, json!({ "type": "listModels" })).await?;
    let models = response.get("models").cloned().unwrap_or(Value::Null);
    let models: Vec<ConversationModel> = serde_json::from_value(models)
        .map_err(|error| format!("invalid Pi model list: {error}"))?;
    let diagnosis = response
        .get("diagnosis")
        .and_then(Value::as_str)
        .map(str::to_owned);
    Ok(ConversationCatalog { models, diagnosis })
}

#[tauri::command]
pub async fn conversation_set_model(
    app: AppHandle,
    mode: String,
    provider_id: String,
    model_id: String,
) -> Result<(), String> {
    request(
        &app,
        json!({
            "type": "setModel",
            "mode": mode,
            "providerId": provider_id,
            "modelId": model_id,
        }),
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn conversation_set_workspace(app: AppHandle, path: Option<String>) -> Result<(), String> {
    request(&app, json!({ "type": "setWorkspace", "path": path })).await?;
    Ok(())
}

#[tauri::command]
pub async fn conversation_send(app: AppHandle, mode: String, prompt: String) -> Result<(), String> {
    request(&app, json!({ "type": "send", "mode": mode, "prompt": prompt })).await?;
    Ok(())
}

#[tauri::command]
pub async fn conversation_abort(app: AppHandle, mode: String) -> Result<(), String> {
    request(&app, json!({ "type": "abort", "mode": mode })).await?;
    Ok(())
}

#[tauri::command]
pub async fn conversation_new(app: AppHandle, mode: String) -> Result<(), String> {
    request(&app, json!({ "type": "new", "mode": mode })).await?;
    Ok(())
}

pub fn shutdown(app: &AppHandle) {
    let child = app.state::<ConversationState>().child.clone();
    let mut guard = child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.start_kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_exit_with_no_output_says_so_rather_than_showing_nothing() {
        let stderr = Arc::new(Mutex::new(Vec::new()));
        assert_eq!(
            describe_exit(&stderr),
            "Pi companion exited unexpectedly, with no output."
        );
    }

    #[test]
    fn an_exit_quotes_what_the_companion_last_said() {
        let stderr = Arc::new(Mutex::new(vec![
            "Error: cannot find module".to_owned(),
            "  at loader".to_owned(),
        ]));
        let described = describe_exit(&stderr);
        assert!(described.contains("cannot find module"), "{described}");
        assert!(described.contains("at loader"), "{described}");
    }

    #[test]
    fn a_credential_never_reaches_the_log_or_the_panel() {
        assert_eq!(
            redact_credentials("auth failed for key sk-ant-api03-ZZZZZZZZZZZZZZZZZZZZZZZZZZ"),
            "auth failed for key <REDACTED>"
        );
        assert_eq!(
            redact_credentials("token=aaaaaaaaaaaa1234aaaaaaaaaaaaaaaa"),
            "token=<REDACTED>"
        );
        assert_eq!(
            redact_credentials("{\"apiKey\": \"abcd1234abcd1234abcd1234abcd\"}"),
            "{\"apiKey\": \"<REDACTED>\"}"
        );
        // Ordinary diagnostics survive intact, including long ordinary words and paths.
        assert_eq!(
            redact_credentials("Error: cannot find module companion.mjs"),
            "Error: cannot find module companion.mjs"
        );
        assert_eq!(
            redact_credentials("/Users/someone/Library/Application Support/net.derivon.mindmap"),
            "/Users/someone/Library/Application Support/net.derivon.mindmap"
        );
    }
}
