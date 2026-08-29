use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDirectory {
    pub path: String,
    pub name: String,
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
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("workspace is missing `{relative}`: {error}"))?;
        let modified_nanos = metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_nanos());
        hasher.update(relative.as_bytes());
        hasher.update(metadata.len().to_le_bytes());
        hasher.update(modified_nanos.to_le_bytes());
        if load_files {
            let bytes = fs::read(&path)
                .map_err(|error| format!("cannot read workspace file `{relative}`: {error}"))?;
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
    #[cfg(debug_assertions)]
    eprintln!("[Derivon workspace] opening native folder picker");
    let Some(root) = rfd::AsyncFileDialog::new().pick_folder().await else {
        #[cfg(debug_assertions)]
        eprintln!("[Derivon workspace] native folder picker cancelled");
        return Ok(None);
    };
    let root = root.path().to_owned();
    #[cfg(debug_assertions)]
    eprintln!("[Derivon workspace] selected {}", root.display());
    tauri::async_runtime::spawn_blocking(move || {
        let snapshot = read_snapshot(&root, false).map_err(|error| {
            #[cfg(debug_assertions)]
            eprintln!(
                "[Derivon workspace] failed to read {}: {error}",
                root.display()
            );
            error
        })?;
        #[cfg(debug_assertions)]
        eprintln!(
            "[Derivon workspace] loaded {} points, {} hyperedges, and {} files from {}",
            snapshot.workspace.manifest.graph.points.len(),
            snapshot.workspace.manifest.graph.hyperedges.len(),
            snapshot.workspace.files.len(),
            root.display()
        );
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
    })
    .await
    .map_err(|error| format!("workspace chooser task failed: {error}"))?
}

#[tauri::command]
pub async fn save_workspace_as(
    manifest: WorkspaceDocument,
    files: HashMap<String, String>,
) -> Result<Option<WorkspaceDirectory>, String> {
    let Some(root) = rfd::AsyncFileDialog::new().pick_folder().await else {
        return Ok(None);
    };
    let root = root.path().to_owned();
    let directory = WorkspaceDirectory {
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_owned(),
        path: root.to_string_lossy().into_owned(),
    };
    tauri::async_runtime::spawn_blocking(move || write_new_workspace_files(&root, manifest, files))
        .await
        .map_err(|error| format!("workspace creator task failed: {error}"))??;
    Ok(Some(directory))
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
pub async fn read_workspace_file(
    root_path: String,
    relative_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&root_path).join(safe_relative_path(&relative_path)?);
        fs::read_to_string(&path)
            .map_err(|error| format!("cannot read {}: {error}", path.display()))
    })
    .await
    .map_err(|error| format!("workspace file reader task failed: {error}"))?
}

#[tauri::command]
pub async fn write_workspace(
    root_path: String,
    manifest: WorkspaceDocument,
    files: HashMap<String, String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_workspace_files(Path::new(&root_path), manifest, files)
    })
    .await
    .map_err(|error| format!("workspace writer task failed: {error}"))?
}

fn write_new_workspace_files(
    root: &Path,
    manifest: WorkspaceDocument,
    files: HashMap<String, String>,
) -> Result<(), String> {
    let manifest_path = root.join(MANIFEST_PATH);
    if manifest_path
        .try_exists()
        .map_err(|error| format!("cannot inspect {}: {error}", manifest_path.display()))?
    {
        return Err("所选文件夹已经是 Derivon 工作区，请选择新的文件夹".to_owned());
    }
    write_workspace_files(root, manifest, files)
}

fn write_workspace_files(
    root: &Path,
    manifest: WorkspaceDocument,
    files: HashMap<String, String>,
) -> Result<(), String> {
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
    fn creates_new_workspace_without_overwriting_an_existing_manifest() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let source = read_snapshot(&fixture, true).unwrap().workspace;
        let destination = tempfile::tempdir().unwrap();

        write_new_workspace_files(
            destination.path(),
            source.manifest.clone(),
            source.files.clone(),
        )
        .unwrap();
        let saved = read_snapshot(destination.path(), true).unwrap();
        assert_eq!(saved.workspace.manifest.graph.points.len(), 6);
        assert_eq!(saved.workspace.files.len(), 26);

        let error = write_new_workspace_files(destination.path(), source.manifest, source.files)
            .unwrap_err();
        assert!(error.contains("已经是 Derivon 工作区"));
    }

    #[test]
    fn metadata_only_snapshot_validates_documents_without_loading_their_contents() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let metadata_only = read_snapshot(&root, false).unwrap();
        let complete = read_snapshot(&root, true).unwrap();

        assert!(metadata_only.workspace.files.is_empty());
        assert_eq!(
            serde_json::to_value(metadata_only.workspace.manifest).unwrap(),
            serde_json::to_value(complete.workspace.manifest).unwrap()
        );
        assert_eq!(metadata_only.revision, complete.revision);
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

        assert_eq!(manifest.schema, "derivon.authoring/v0.3.0");
        assert!(manifest.view.get("positions").is_none());
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
