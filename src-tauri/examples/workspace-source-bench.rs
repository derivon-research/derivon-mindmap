// Read-only native boundary for the desktop opening benchmark. No Tauri window required.
#![allow(dead_code)]
#[path = "../src/route.rs"]
mod route;
#[path = "../src/workspace.rs"]
mod workspace;

use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use tauri::ipc::{InvokeResponseBody, IpcResponse};

fn main() {
    let mut tasks = Vec::new();
    for line in io::stdin().lock().lines() {
        let request: Value = serde_json::from_str(&line.unwrap()).unwrap();
        tasks.push(tauri::async_runtime::spawn(async move {
            handle(request).await;
        }));
    }
    for task in tasks {
        tauri::async_runtime::block_on(task).unwrap();
    }
}

async fn handle(request: Value) {
    let root = request["rootPath"].as_str().unwrap().to_owned();
    let path = request["relativePath"].as_str().unwrap_or("").to_owned();
    let command = request["command"].as_str().unwrap();
    let result: Result<InvokeResponseBody, String> = async {
        if command == "read_workspace_source_asset" {
            return workspace::read_workspace_source_asset(root, path)
                .await
                .map(|response| response.body().unwrap());
        }
        let value = match command {
            "read_workspace_source_document" => {
                workspace::read_workspace_source_document(root, path)
                    .await
                    .map(Value::String)
            }
            "read_workspace_source_graph" => workspace::read_workspace_source_graph(root)
                .await
                .map(Value::String),
            "read_workspace_source_companion_metadata" => {
                workspace::read_workspace_source_companion_metadata(root, path)
                    .await
                    .map(|text| json!(text))
            }
            "workspace_source_revision" => workspace::workspace_source_revision(root)
                .await
                .map(Value::String),
            command => Err(format!(
                "unsupported read-only benchmark command: {command}"
            )),
        }?;
        Ok(InvokeResponseBody::Json(
            serde_json::to_string(&value).unwrap(),
        ))
    }
    .await;
    let (payload, kind) = match result {
        Ok(InvokeResponseBody::Raw(bytes)) => (bytes, "raw"),
        Ok(InvokeResponseBody::Json(text)) => (text.into_bytes(), "json"),
        Err(error) => (error.into_bytes(), "error"),
    };
    let mut output = io::stdout().lock();
    writeln!(
        output,
        "{}",
        json!({"id": request["id"], "length": payload.len(), "kind": kind})
    )
    .unwrap();
    output.write_all(&payload).unwrap();
    output.flush().unwrap();
}
