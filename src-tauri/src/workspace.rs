use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSourceTextChange {
    path: String,
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSourceAssetChange {
    path: String,
    content: Option<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSourceChanges {
    graph: Option<String>,
    #[serde(default)]
    documents: Vec<WorkspaceSourceTextChange>,
    #[serde(default)]
    assets: Vec<WorkspaceSourceAssetChange>,
    #[serde(default)]
    companion_metadata: Vec<WorkspaceSourceTextChange>,
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

fn resolve_workspace_file(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let requested_path = root.join(safe_relative_path(relative_path)?);
    let canonical_path = fs::canonicalize(&requested_path)
        .map_err(|error| format!("cannot resolve {}: {error}", requested_path.display()))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "workspace path `{relative_path}` resolves outside the workspace"
        ));
    }
    Ok(canonical_path)
}

fn read_workspace_source_text(root: &Path, relative_path: &str) -> Result<String, String> {
    let path = resolve_workspace_file(root, relative_path)?;
    fs::read_to_string(&path).map_err(|error| format!("cannot read {}: {error}", path.display()))
}

fn read_optional_workspace_source_text(
    root: &Path,
    relative_path: &str,
) -> Result<Option<String>, String> {
    let relative = safe_relative_path(relative_path)?;
    let requested_path = root.join(&relative);
    if !requested_path
        .try_exists()
        .map_err(|error| format!("cannot inspect {}: {error}", requested_path.display()))?
    {
        return Ok(None);
    }
    read_workspace_source_text(root, relative_path).map(Some)
}

fn validate_companion_metadata_path(value: &str) -> Result<PathBuf, String> {
    let path = safe_relative_path(value)?;
    if !path.starts_with(".derivon") || path == Path::new(MANIFEST_PATH) {
        return Err(format!(
            "companion metadata path `{value}` must be inside `.derivon` and must not be the workspace manifest"
        ));
    }
    Ok(path)
}

fn validate_workspace_source_changes(changes: &WorkspaceSourceChanges) -> Result<(), String> {
    if let Some(graph) = &changes.graph {
        serde_json::from_str::<WorkspaceDocument>(graph)
            .map_err(|error| format!("invalid {MANIFEST_PATH}: {error}"))?;
    }

    let mut paths = HashSet::new();
    if changes.graph.is_some() {
        paths.insert(PathBuf::from(MANIFEST_PATH));
    }
    for change in &changes.documents {
        let path = safe_relative_path(&change.path)?;
        if path == Path::new(MANIFEST_PATH) || !paths.insert(path) {
            return Err(format!(
                "duplicate or reserved workspace path `{}`",
                change.path
            ));
        }
    }
    for change in &changes.assets {
        let path = safe_relative_path(&change.path)?;
        if path == Path::new(MANIFEST_PATH) || !paths.insert(path) {
            return Err(format!(
                "duplicate or reserved workspace path `{}`",
                change.path
            ));
        }
    }
    for change in &changes.companion_metadata {
        let path = validate_companion_metadata_path(&change.path)?;
        if !paths.insert(path) {
            return Err(format!("duplicate workspace path `{}`", change.path));
        }
    }
    Ok(())
}

fn prepare_workspace_source_target(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let relative = safe_relative_path(relative_path)?;
    let target = root.join(&relative);
    let target_parent = target
        .parent()
        .ok_or_else(|| format!("workspace path `{relative_path}` has no parent"))?;

    let mut existing_ancestor = target_parent;
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| format!("workspace path `{relative_path}` has no existing ancestor"))?;
    }
    let canonical_ancestor = fs::canonicalize(existing_ancestor)
        .map_err(|error| format!("cannot resolve {}: {error}", existing_ancestor.display()))?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err(format!(
            "workspace path `{relative_path}` resolves outside the workspace"
        ));
    }

    fs::create_dir_all(target_parent)
        .map_err(|error| format!("cannot create {}: {error}", target_parent.display()))?;
    let canonical_parent = fs::canonicalize(target_parent)
        .map_err(|error| format!("cannot resolve {}: {error}", target_parent.display()))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(format!(
            "workspace path `{relative_path}` resolves outside the workspace"
        ));
    }

    let filename = relative
        .file_name()
        .ok_or_else(|| format!("workspace path `{relative_path}` has no filename"))?;
    let canonical_target = canonical_parent.join(filename);
    if canonical_target.exists() {
        let resolved_target = fs::canonicalize(&canonical_target)
            .map_err(|error| format!("cannot resolve {}: {error}", canonical_target.display()))?;
        if !resolved_target.starts_with(&canonical_root) {
            return Err(format!(
                "workspace path `{relative_path}` resolves outside the workspace"
            ));
        }
    }
    Ok(canonical_target)
}

struct PreparedWorkspaceSourceChange {
    target: PathBuf,
    content: Option<Vec<u8>>,
    previous_content: Option<Vec<u8>>,
}

fn write_workspace_source_content(target: &Path, content: Option<&[u8]>) -> Result<(), String> {
    match content {
        Some(bytes) => fs::write(target, bytes)
            .map_err(|error| format!("cannot write {}: {error}", target.display())),
        None => match fs::remove_file(target) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("cannot remove {}: {error}", target.display())),
        },
    }
}

fn prepare_workspace_source_change(
    root: &Path,
    relative_path: &str,
    content: Option<Vec<u8>>,
) -> Result<PreparedWorkspaceSourceChange, String> {
    let target = prepare_workspace_source_target(root, relative_path)?;
    let previous_content = match fs::read(&target) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(format!(
                "cannot read {} before commit: {error}",
                target.display()
            ))
        }
    };
    Ok(PreparedWorkspaceSourceChange {
        target,
        content,
        previous_content,
    })
}

fn apply_prepared_workspace_source_changes<F>(
    changes: &[PreparedWorkspaceSourceChange],
    mut apply: F,
) -> Result<(), String>
where
    F: FnMut(&PreparedWorkspaceSourceChange) -> Result<(), String>,
{
    for (index, change) in changes.iter().enumerate() {
        if let Err(error) = apply(change) {
            let rollback_errors = changes[..=index]
                .iter()
                .rev()
                .filter_map(|applied| {
                    write_workspace_source_content(
                        &applied.target,
                        applied.previous_content.as_deref(),
                    )
                    .err()
                })
                .collect::<Vec<_>>();
            return if rollback_errors.is_empty() {
                Err(error)
            } else {
                Err(format!(
                    "{error}; workspace rollback also failed: {}",
                    rollback_errors.join("; ")
                ))
            };
        }
    }
    Ok(())
}

fn commit_workspace_source_changes_to_disk(
    root: &Path,
    changes: &WorkspaceSourceChanges,
) -> Result<(), String> {
    validate_workspace_source_changes(changes)?;
    let mut requested = Vec::new();
    if let Some(graph) = &changes.graph {
        requested.push((MANIFEST_PATH, Some(graph.as_bytes().to_vec())));
    }
    requested.extend(changes.documents.iter().map(|change| {
        (
            change.path.as_str(),
            change
                .content
                .as_ref()
                .map(|content| content.as_bytes().to_vec()),
        )
    }));
    requested.extend(
        changes
            .assets
            .iter()
            .map(|change| (change.path.as_str(), change.content.clone())),
    );
    requested.extend(changes.companion_metadata.iter().map(|change| {
        (
            change.path.as_str(),
            change
                .content
                .as_ref()
                .map(|content| content.as_bytes().to_vec()),
        )
    }));
    let prepared = requested
        .into_iter()
        .map(|(path, content)| prepare_workspace_source_change(root, path, content))
        .collect::<Result<Vec<_>, _>>()?;

    apply_prepared_workspace_source_changes(&prepared, |change| {
        write_workspace_source_content(&change.target, change.content.as_deref())
    })
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
pub async fn read_workspace_source_graph(root_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_workspace_source_text(Path::new(&root_path), MANIFEST_PATH)
    })
    .await
    .map_err(|error| format!("workspace source graph reader task failed: {error}"))?
}

#[tauri::command]
pub async fn read_workspace_source_document(
    root_path: String,
    relative_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_workspace_source_text(Path::new(&root_path), &relative_path)
    })
    .await
    .map_err(|error| format!("workspace source document reader task failed: {error}"))?
}

#[tauri::command]
pub async fn read_workspace_source_companion_metadata(
    root_path: String,
    relative_path: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_companion_metadata_path(&relative_path)?;
        read_optional_workspace_source_text(Path::new(&root_path), &relative_path)
    })
    .await
    .map_err(|error| format!("workspace source companion metadata reader task failed: {error}"))?
}

fn read_workspace_asset_bytes(root: &Path, relative_path: &str) -> Result<Vec<u8>, String> {
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let requested_path = root.join(safe_relative_path(relative_path)?);
    let canonical_path = fs::canonicalize(&requested_path)
        .map_err(|error| format!("cannot resolve {}: {error}", requested_path.display()))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(format!(
            "workspace asset path `{relative_path}` resolves outside the workspace"
        ));
    }
    fs::read(&canonical_path)
        .map_err(|error| format!("cannot read {}: {error}", canonical_path.display()))
}

#[tauri::command]
pub async fn read_workspace_asset(
    root_path: String,
    relative_path: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        read_workspace_asset_bytes(Path::new(&root_path), &relative_path)
    })
    .await
    .map_err(|error| format!("workspace asset reader task failed: {error}"))??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn read_workspace_source_asset(
    root_path: String,
    relative_path: String,
) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        read_workspace_asset_bytes(Path::new(&root_path), &relative_path)
    })
    .await
    .map_err(|error| format!("workspace source asset reader task failed: {error}"))??;
    Ok(tauri::ipc::Response::new(bytes))
}

fn decode_request_header(request: &tauri::ipc::Request<'_>, name: &str) -> Result<String, String> {
    let value = request
        .headers()
        .get(name)
        .ok_or_else(|| format!("missing `{name}` header"))?
        .to_str()
        .map_err(|error| format!("invalid `{name}` header: {error}"))?;
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = bytes
                .get(index + 1..index + 3)
                .ok_or_else(|| format!("invalid percent encoding in `{name}` header"))?;
            let text = std::str::from_utf8(hex)
                .map_err(|error| format!("invalid percent encoding in `{name}` header: {error}"))?;
            decoded.push(u8::from_str_radix(text, 16).map_err(|error| {
                format!("invalid percent encoding in `{name}` header: {error}")
            })?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|error| format!("`{name}` header is not UTF-8: {error}"))
}

fn write_workspace_asset_bytes(
    root: &Path,
    relative_path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    const MAX_ASSET_BYTES: usize = 32 * 1024 * 1024;
    if bytes.is_empty() || bytes.len() > MAX_ASSET_BYTES {
        return Err("workspace image must be between 1 byte and 32 MiB".to_owned());
    }
    let relative = safe_relative_path(relative_path)?;
    let parent = relative
        .parent()
        .ok_or_else(|| "workspace image path has no parent".to_owned())?;
    if parent.components().count() < 3
        || parent.file_name().and_then(|name| name.to_str()) != Some("assets")
    {
        return Err(
            "workspace images must be written inside an object assets directory".to_owned(),
        );
    }
    let extension = relative
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if !matches!(
        extension.as_str(),
        "avif" | "gif" | "jpg" | "jpeg" | "png" | "svg" | "webp"
    ) {
        return Err(format!(
            "unsupported workspace image extension `{extension}`"
        ));
    }

    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let target_parent = root.join(parent);
    let mut existing_ancestor = target_parent.as_path();
    while !existing_ancestor.exists() {
        existing_ancestor = existing_ancestor
            .parent()
            .ok_or_else(|| "workspace image path has no existing ancestor".to_owned())?;
    }
    let canonical_ancestor = fs::canonicalize(existing_ancestor)
        .map_err(|error| format!("cannot resolve {}: {error}", existing_ancestor.display()))?;
    if !canonical_ancestor.starts_with(&canonical_root) {
        return Err("workspace image directory resolves outside the workspace".to_owned());
    }
    fs::create_dir_all(&target_parent)
        .map_err(|error| format!("cannot create {}: {error}", target_parent.display()))?;
    let canonical_parent = fs::canonicalize(&target_parent)
        .map_err(|error| format!("cannot resolve {}: {error}", target_parent.display()))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err("workspace image directory resolves outside the workspace".to_owned());
    }

    let target = canonical_parent.join(relative.file_name().unwrap());
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|error| format!("cannot create {}: {error}", target.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("cannot write {}: {error}", target.display()))
}

#[tauri::command]
pub async fn write_workspace_asset(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let root_path = decode_request_header(&request, "x-derivon-workspace-root")?;
    let relative_path = decode_request_header(&request, "x-derivon-relative-path")?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("workspace image body must be raw bytes".to_owned())
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        write_workspace_asset_bytes(Path::new(&root_path), &relative_path, &bytes)
    })
    .await
    .map_err(|error| format!("workspace asset writer task failed: {error}"))?
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

#[tauri::command]
pub async fn commit_workspace_source_changes(
    root_path: String,
    changes: WorkspaceSourceChanges,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        commit_workspace_source_changes_to_disk(Path::new(&root_path), &changes)
    })
    .await
    .map_err(|error| format!("workspace source commit task failed: {error}"))?
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
    fn workspace_source_round_trip_preserves_every_byte() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let graph = fs::read_to_string(fixture.join(MANIFEST_PATH)).unwrap();
        let document = fs::read_to_string(fixture.join("docs/points/a/document.md")).unwrap();
        let asset = vec![0, 1, 2, 127, 128, 255];
        let companion = "{ \"questions\" : [ ] }\n".to_owned();
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        fs::create_dir_all(root.path().join("docs/points/a")).unwrap();
        fs::create_dir_all(root.path().join("assets")).unwrap();
        fs::write(root.path().join(MANIFEST_PATH), graph.as_bytes()).unwrap();
        fs::write(
            root.path().join("docs/points/a/document.md"),
            document.as_bytes(),
        )
        .unwrap();
        fs::write(root.path().join("assets/diagram.bin"), &asset).unwrap();
        fs::write(
            root.path().join(".derivon/orientation.json"),
            companion.as_bytes(),
        )
        .unwrap();

        let opened_graph = read_workspace_source_text(root.path(), MANIFEST_PATH).unwrap();
        let opened_document =
            read_workspace_source_text(root.path(), "docs/points/a/document.md").unwrap();
        let opened_asset = read_workspace_asset_bytes(root.path(), "assets/diagram.bin").unwrap();
        let opened_companion =
            read_optional_workspace_source_text(root.path(), ".derivon/orientation.json").unwrap();
        assert_eq!(
            read_optional_workspace_source_text(root.path(), ".derivon/missing.json").unwrap(),
            None
        );

        commit_workspace_source_changes_to_disk(
            root.path(),
            &WorkspaceSourceChanges {
                graph: Some(opened_graph),
                documents: vec![WorkspaceSourceTextChange {
                    path: "docs/points/a/document.md".to_owned(),
                    content: Some(opened_document),
                }],
                assets: vec![WorkspaceSourceAssetChange {
                    path: "assets/diagram.bin".to_owned(),
                    content: Some(opened_asset),
                }],
                companion_metadata: vec![WorkspaceSourceTextChange {
                    path: ".derivon/orientation.json".to_owned(),
                    content: opened_companion,
                }],
            },
        )
        .unwrap();

        assert_eq!(
            fs::read(root.path().join(MANIFEST_PATH)).unwrap(),
            graph.as_bytes()
        );
        assert_eq!(
            fs::read(root.path().join("docs/points/a/document.md")).unwrap(),
            document.as_bytes()
        );
        assert_eq!(
            fs::read(root.path().join("assets/diagram.bin")).unwrap(),
            asset
        );
        assert_eq!(
            fs::read(root.path().join(".derivon/orientation.json")).unwrap(),
            companion.as_bytes()
        );
    }

    #[test]
    fn workspace_source_validates_all_paths_before_writing() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/original.md"), "original\n").unwrap();
        let changes = WorkspaceSourceChanges {
            graph: None,
            documents: vec![WorkspaceSourceTextChange {
                path: "docs/original.md".to_owned(),
                content: Some("changed\n".to_owned()),
            }],
            assets: vec![],
            companion_metadata: vec![WorkspaceSourceTextChange {
                path: MANIFEST_PATH.to_owned(),
                content: Some("not metadata\n".to_owned()),
            }],
        };

        assert!(commit_workspace_source_changes_to_disk(root.path(), &changes).is_err());
        assert_eq!(
            fs::read_to_string(root.path().join("docs/original.md")).unwrap(),
            "original\n"
        );
    }

    #[test]
    fn workspace_source_rolls_back_every_file_when_a_commit_write_fails() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/first.md"), "first original\n").unwrap();
        fs::write(root.path().join("docs/second.md"), "second original\n").unwrap();
        let prepared = vec![
            prepare_workspace_source_change(
                root.path(),
                "docs/first.md",
                Some(b"first changed\n".to_vec()),
            )
            .unwrap(),
            prepare_workspace_source_change(
                root.path(),
                "docs/second.md",
                Some(b"second changed\n".to_vec()),
            )
            .unwrap(),
        ];
        let mut write_count = 0;

        let error = apply_prepared_workspace_source_changes(&prepared, |change| {
            write_count += 1;
            write_workspace_source_content(&change.target, change.content.as_deref())?;
            if write_count == 2 {
                return Err("simulated second write failure".to_owned());
            }
            Ok(())
        })
        .unwrap_err();

        assert!(error.contains("simulated second write failure"));
        assert_eq!(
            fs::read_to_string(root.path().join("docs/first.md")).unwrap(),
            "first original\n"
        );
        assert_eq!(
            fs::read_to_string(root.path().join("docs/second.md")).unwrap(),
            "second original\n"
        );
    }

    #[test]
    fn reads_binary_assets_without_allowing_workspace_escape() {
        let root = tempfile::tempdir().unwrap();
        let asset_directory = root.path().join("assets");
        fs::create_dir_all(&asset_directory).unwrap();
        fs::write(asset_directory.join("diagram.png"), [0_u8, 159, 255]).unwrap();

        assert_eq!(
            read_workspace_asset_bytes(root.path(), "assets/diagram.png").unwrap(),
            vec![0, 159, 255]
        );
        assert!(read_workspace_asset_bytes(root.path(), "../diagram.png").is_err());

        write_workspace_asset_bytes(root.path(), "docs/concept-a/assets/image-1.png", &[1, 2, 3])
            .unwrap();
        assert_eq!(
            fs::read(root.path().join("docs/concept-a/assets/image-1.png")).unwrap(),
            vec![1, 2, 3]
        );
        assert!(write_workspace_asset_bytes(
            root.path(),
            "docs/concept-a/assets/image-1.png",
            &[4],
        )
        .is_err());
        assert!(write_workspace_asset_bytes(root.path(), "assets/image.png", &[1]).is_err());

        #[cfg(unix)]
        {
            let outside = tempfile::NamedTempFile::new().unwrap();
            std::os::unix::fs::symlink(outside.path(), asset_directory.join("outside.png"))
                .unwrap();
            assert!(read_workspace_asset_bytes(root.path(), "assets/outside.png").is_err());
        }
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
