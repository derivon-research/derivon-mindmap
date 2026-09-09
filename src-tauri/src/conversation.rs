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
    pub label: String,
}

struct ConversationProcess {
    stdin: ChildStdin,
}

pub struct ConversationState {
    process: Arc<AsyncMutex<Option<ConversationProcess>>>,
    child: Arc<Mutex<Option<Child>>>,
    next_id: AtomicU64,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
}

impl ConversationState {
    pub fn new() -> Self {
        Self {
            process: Arc::new(AsyncMutex::new(None)),
            child: Arc::new(Mutex::new(None)),
            next_id: AtomicU64::new(1),
            pending: Arc::new(Mutex::new(HashMap::new())),
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

fn node_path() -> PathBuf {
    let executable = std::env::current_exe().ok();
    if let Some(directory) = executable.as_ref().and_then(|path| path.parent()) {
        if let Ok(entries) = std::fs::read_dir(directory) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("node-") {
                    return entry.path();
                }
            }
        }
        let bundled = directory.join("node");
        if bundled.is_file() {
            return bundled;
        }
    }
    PathBuf::from("node")
}

async fn start(app: &AppHandle) -> Result<ConversationProcess, String> {
    let script = script_path(app)?;
    let node = node_path();
    let mut command = Command::new(node);
    command
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
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
    let state = app.state::<ConversationState>();
    let pending = state.pending.clone();
    let process = state.process.clone();
    let child_handle = state.child.clone();
    let event_app = app.clone();
    *state.child.lock().unwrap() = Some(child);
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
        let failed: HashMap<_, _> = pending.lock().unwrap().drain().collect();
        for (_, sender) in failed {
            let _ = sender.send(json!({
                "type": "error",
                "message": "Pi companion exited unexpectedly",
            }));
        }
        for mode in ["learning", "authoring"] {
            let _ = event_app.emit("conversation://event", json!({
                "mode": mode,
                "event": { "kind": "error", "message": "Pi companion exited unexpectedly" },
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

#[tauri::command]
pub async fn conversation_list_models(app: AppHandle) -> Result<Vec<ConversationModel>, String> {
    let response = request(&app, json!({ "type": "listModels" })).await?;
    let models = response.get("models").cloned().unwrap_or(Value::Null);
    serde_json::from_value(models)
        .map_err(|error| format!("invalid Pi model list: {error}"))
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
