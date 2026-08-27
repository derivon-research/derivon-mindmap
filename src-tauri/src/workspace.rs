use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::route::WorkspaceDocument;

const MANIFEST_PATH: &str = ".derivon/workspace.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub workspace: AuthoringWorkspace,
    pub revision: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthoringWorkspace {
    pub manifest: WorkspaceDocument,
    pub files: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChosenWorkspace {
    pub path: String,
    pub name: String,
    pub workspace: AuthoringWorkspace,
    pub revision: String,
    pub created: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentReference {
    document: String,
    format: String,
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!(
            "workspace path `{value}` is not a safe relative path"
        ));
    }
    Ok(path.to_owned())
}

fn referenced_files(manifest: &WorkspaceDocument) -> Result<Vec<String>, String> {
    let values = manifest
        .graph
        .points
        .iter()
        .map(|point| &point.data)
        .chain(manifest.graph.hyperedges.iter().map(|edge| &edge.data));
    let mut paths = Vec::new();
    for value in values {
        let reference: DocumentReference = serde_json::from_value(value.clone())
            .map_err(|error| format!("invalid document reference: {error}"))?;
        safe_relative_path(&reference.document)?;
        paths.push(format!("{}/index.html", reference.document));
        if reference.format == "markdown" {
            paths.push(format!("{}/document.md", reference.document));
        }
    }
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn read_snapshot(root: &Path, load_files: bool) -> Result<WorkspaceSnapshot, String> {
    let manifest_path = root.join(MANIFEST_PATH);
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("cannot read {}: {error}", manifest_path.display()))?;
    let manifest: WorkspaceDocument = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("invalid {MANIFEST_PATH}: {error}"))?;
    let mut hasher = Sha256::new();
    hasher.update(MANIFEST_PATH.as_bytes());
    hasher.update(manifest_text.as_bytes());
    let mut files = HashMap::new();
    for relative in referenced_files(&manifest)? {
        let path = root.join(safe_relative_path(&relative)?);
        let bytes = fs::read(&path)
            .map_err(|error| format!("workspace is missing `{relative}`: {error}"))?;
        hasher.update(relative.as_bytes());
        hasher.update(&bytes);
        if load_files {
            let content = String::from_utf8(bytes)
                .map_err(|error| format!("workspace file `{relative}` is not UTF-8: {error}"))?;
            files.insert(relative, content);
        }
    }
    Ok(WorkspaceSnapshot {
        workspace: AuthoringWorkspace { manifest, files },
        revision: format!("{:x}", hasher.finalize()),
    })
}

#[tauri::command]
pub async fn choose_workspace() -> Result<Option<ChosenWorkspace>, String> {
    let Some(root) = rfd::AsyncFileDialog::new().pick_folder().await else {
        return Ok(None);
    };
    let root = root.path().to_owned();
    let snapshot = read_snapshot(&root, true)?;
    Ok(Some(ChosenWorkspace {
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_owned(),
        path: root.to_string_lossy().into_owned(),
        workspace: snapshot.workspace,
        revision: snapshot.revision,
        created: false,
    }))
}

#[tauri::command]
pub async fn read_workspace(
    root_path: String,
    load_files: bool,
) -> Result<WorkspaceSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || read_snapshot(Path::new(&root_path), load_files))
        .await
        .map_err(|error| format!("workspace reader task failed: {error}"))?
}

#[tauri::command]
pub async fn workspace_revision(root_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_snapshot(Path::new(&root_path), false).map(|snapshot| snapshot.revision)
    })
    .await
    .map_err(|error| format!("workspace revision task failed: {error}"))?
}

#[tauri::command]
pub fn read_workspace_file(root_path: String, relative_path: String) -> Result<String, String> {
    let path = Path::new(&root_path).join(safe_relative_path(&relative_path)?);
    fs::read_to_string(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))
}

#[tauri::command]
pub async fn write_workspace(
    root_path: String,
    manifest: WorkspaceDocument,
    files: HashMap<String, String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_workspace_files(root_path, manifest, files))
        .await
        .map_err(|error| format!("workspace writer task failed: {error}"))?
}

fn write_workspace_files(
    root_path: String,
    manifest: WorkspaceDocument,
    files: HashMap<String, String>,
) -> Result<(), String> {
    let root = Path::new(&root_path);
    let manifest_path = root.join(MANIFEST_PATH);
    let manifest_parent = manifest_path
        .parent()
        .ok_or_else(|| "manifest path has no parent".to_owned())?;
    fs::create_dir_all(manifest_parent)
        .map_err(|error| format!("cannot create {}: {error}", manifest_parent.display()))?;
    let manifest_text = format!(
        "{}\n",
        serde_json::to_string_pretty(&manifest)
            .map_err(|error| format!("cannot serialize workspace: {error}"))?
    );
    fs::write(&manifest_path, manifest_text)
        .map_err(|error| format!("cannot write {}: {error}", manifest_path.display()))?;
    for (relative, content) in files {
        let path = root.join(safe_relative_path(&relative)?);
        let parent = path
            .parent()
            .ok_or_else(|| format!("workspace file `{relative}` has no parent"))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
        fs::write(&path, content)
            .map_err(|error| format!("cannot write {}: {error}", path.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_paths_outside_workspace() {
        assert!(safe_relative_path("../secret").is_err());
        assert!(safe_relative_path("/tmp/secret").is_err());
        assert!(safe_relative_path("docs/concept/document.md").is_ok());
    }

    #[test]
    fn complete_fixture_loads_manifest_documents_and_revision() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let snapshot = read_snapshot(&root, true).unwrap();
        let manifest = &snapshot.workspace.manifest;

        assert_eq!(manifest.graph.points.len(), 6);
        assert_eq!(manifest.graph.hyperedges.len(), 8);
        assert_eq!(snapshot.workspace.files.len(), 26);
        assert!(snapshot
            .workspace
            .files
            .contains_key("docs/points/a/document.md"));
        assert!(snapshot
            .workspace
            .files
            .contains_key("docs/points/y/index.html"));
        assert!(!snapshot
            .workspace
            .files
            .contains_key("docs/points/y/document.md"));
        assert!(!root.join("docs/points/y/document.md").exists());

        let positions = manifest.view["positions"].as_object().unwrap();
        assert_eq!(positions.len(), 14);
        assert!(manifest
            .graph
            .points
            .iter()
            .map(|point| &point.id)
            .chain(manifest.graph.hyperedges.iter().map(|edge| &edge.id))
            .all(|id| positions.contains_key(id)));
        assert_eq!(
            manifest.view["replacements"],
            serde_json::json!([{
                "points": ["A", "B"],
                "replaceWith": "X",
                "show": "points"
            }])
        );

        let manifest_only = read_snapshot(&root, false).unwrap();
        assert!(manifest_only.workspace.files.is_empty());
        assert_eq!(manifest_only.revision, snapshot.revision);
    }
}
