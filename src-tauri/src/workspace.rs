#[cfg(test)]
use std::cell::Cell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, UNIX_EPOCH};

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
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSourceTextChange {
    path: String,
    content: Option<String>,
    #[serde(default)]
    create_only: bool,
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
    expected_revision: Option<String>,
    #[serde(default)]
    create_only: bool,
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
        if change.create_only && change.content.is_none() {
            return Err(format!(
                "create-only workspace text change cannot delete `{}`",
                change.path
            ));
        }
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
        if change.create_only && change.content.is_none() {
            return Err(format!(
                "create-only workspace text change cannot delete `{}`",
                change.path
            ));
        }
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

// A temporary sibling exists for the duration of one replacement and never outlives it. It is
// named after its target so a leftover is attributable, and its name carries the process's own
// token plus a counter. A counter alone restarts at zero in a new process, so a temporary file
// left by a crash could be handed the same name by a later process with a recycled process id
// and block that replacement forever.
const TEMPORARY_FILE_MARKER: &str = ".derivon-part-";

static TEMPORARY_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temporary_file_token() -> &'static str {
    static TOKEN: OnceLock<String> = OnceLock::new();
    TOKEN.get_or_init(|| {
        let started = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos());
        format!("{}-{started}", std::process::id())
    })
}

fn temporary_sibling_path(target: &Path) -> PathBuf {
    let counter = TEMPORARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("workspace-file");
    target.with_file_name(format!(
        "{name}{TEMPORARY_FILE_MARKER}{}-{counter}",
        temporary_file_token()
    ))
}

// Replacement goes through a temporary file in the target's own directory and a `rename` over
// the target. A reader therefore observes either the whole previous file or the whole new one,
// never a prefix: an in-place write lets a reader catch the truncation, and a truncated manifest
// is a workspace that cannot be opened at all. Both versions live in one directory, so the
// rename stays on one filesystem.
fn replace_workspace_source_file(target: &Path, content: &[u8]) -> Result<(), String> {
    replace_workspace_source_file_with(target, content, || Ok(()))
}

// `before_replace` is the replacement point, made injectable so a test can observe what a reader
// sees while the temporary file is complete and the target is still the previous one.
fn replace_workspace_source_file_with<F>(
    target: &Path,
    content: &[u8],
    before_replace: F,
) -> Result<(), String>
where
    F: FnOnce() -> Result<(), String>,
{
    let temporary = temporary_sibling_path(target);
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("cannot write {}: {error}", target.display()))?;
        file.write_all(content)
            .map_err(|error| format!("cannot write {}: {error}", target.display()))?;
        drop(file);
        // The temporary file is a new file, so the target's permission bits have to be carried
        // over or a restricted document would come back with the default ones. An unreadable
        // target leaves the temporary file with those defaults.
        if let Ok(metadata) = fs::metadata(target) {
            fs::set_permissions(&temporary, metadata.permissions())
                .map_err(|error| format!("cannot write {}: {error}", target.display()))?;
        }
        before_replace()?;
        fs::rename(&temporary, target)
            .map_err(|error| format!("cannot replace {}: {error}", target.display()))
    })();
    match result {
        Ok(()) => Ok(()),
        Err(error) => match fs::remove_file(&temporary) {
            Ok(()) => Err(error),
            Err(cleanup) if cleanup.kind() == std::io::ErrorKind::NotFound => Err(error),
            // The workspace observer hashes the whole tree, `.derivon` included, so a temporary
            // file left behind would read as an external change. Its survival is a second
            // failure and is reported as one.
            Err(cleanup) => Err(format!(
                "{error}; temporary file cleanup also failed: cannot remove {}: {cleanup}",
                temporary.display()
            )),
        },
    }
}

fn write_workspace_source_content(target: &Path, content: Option<&[u8]>) -> Result<(), String> {
    match content {
        Some(bytes) => replace_workspace_source_file(target, bytes),
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

// Rollback covers the targets this attempt already acted on, and it restores them by the same
// temporary-file-and-rename replacement a forward write uses. A failure while writing a target
// leaves that target as it was, so only replacements already renamed into place and deletions
// already performed need restoring. This is not a crash guarantee and not a transaction against
// an uncooperative writer: a process that dies mid-attempt leaves whatever the filesystem holds.
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
) -> Result<String, String> {
    commit_workspace_source_changes_using(root, changes, |change| {
        write_workspace_source_content(&change.target, change.content.as_deref())
    })
}

fn commit_workspace_source_changes_using<F>(
    root: &Path,
    changes: &WorkspaceSourceChanges,
    apply: F,
) -> Result<String, String>
where
    F: FnMut(&PreparedWorkspaceSourceChange) -> Result<(), String>,
{
    validate_workspace_source_changes(changes)?;
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let root = canonical_root.as_path();
    let mut requested = Vec::new();
    requested.extend(changes.documents.iter().map(|change| {
        (
            change.path.as_str(),
            change
                .content
                .as_ref()
                .map(|content| content.as_bytes().to_vec()),
            change.create_only,
        )
    }));
    requested.extend(
        changes
            .assets
            .iter()
            .map(|change| (change.path.as_str(), change.content.clone(), false)),
    );
    requested.extend(changes.companion_metadata.iter().map(|change| {
        (
            change.path.as_str(),
            change
                .content
                .as_ref()
                .map(|content| content.as_bytes().to_vec()),
            change.create_only,
        )
    }));
    // The manifest is replaced last: it is what references the documents, so a reader that finds
    // the new graph already finds what it names. Documents a failure leaves unreferenced are
    // inert, while a graph published before its documents would point at files that are not
    // there yet.
    if let Some(graph) = &changes.graph {
        requested.push((MANIFEST_PATH, Some(graph.as_bytes().to_vec()), false));
    }

    if changes.create_only {
        if changes.graph.is_none() {
            return Err("create-only workspace commit must contain graph".to_owned());
        }
        if let Some((path, _, _)) = requested.iter().find(|(_, content, _)| content.is_none()) {
            return Err(format!(
                "create-only workspace commit cannot delete `{path}`"
            ));
        }

        let prepared = requested
            .into_iter()
            .map(|(path, content, _)| {
                prepare_workspace_source_target(root, path).map(|target| (target, content.unwrap()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut files = workspace_source_fingerprints(root)?;
        verify_workspace_source_fingerprints(&files, changes.expected_revision.as_deref())?;
        for (target, content) in &prepared {
            files.insert(workspace_source_relative_name(root, target)?, source_file_fingerprint(content));
        }
        let revision = workspace_source_revision_from_fingerprints(&files);
        create_workspace_source_files(&prepared)?;
        forget_workspace_source_observation(root);
        return Ok(revision);
    }

    let prepared = requested
        .into_iter()
        .map(|(path, content, create_only)| {
            prepare_workspace_source_change(root, path, content).map(|change| (change, create_only))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if let Some((change, _)) = prepared
        .iter()
        .find(|(change, create_only)| *create_only && change.previous_content.is_some())
    {
        return Err(format!(
            "workspace target {} already exists",
            change.target.display()
        ));
    }
    let prepared = prepared
        .into_iter()
        .map(|(change, _)| change)
        .collect::<Vec<_>>();

    let mut files = workspace_source_fingerprints(root)?;
    verify_workspace_source_fingerprints(&files, changes.expected_revision.as_deref())?;
    // Predict the committed version from the inspected basis, never from a post-write scan
    // that could already contain another writer's changes.
    for change in &prepared {
        let path = workspace_source_relative_name(root, &change.target)?;
        match &change.content {
            Some(content) => { files.insert(path, source_file_fingerprint(content)); }
            None => { files.remove(&path); }
        }
    }
    let revision = workspace_source_revision_from_fingerprints(&files);
    apply_prepared_workspace_source_changes(&prepared, apply)?;
    forget_workspace_source_observation(root);
    Ok(revision)
}

// Each target is created exclusively and files created by this attempt are rolled back on
// observed failure. This is not a cross-process transaction or CAS, nor is it crash-atomic.
fn create_workspace_source_files(changes: &[(PathBuf, Vec<u8>)]) -> Result<(), String> {
    let mut created = Vec::new();
    for (target, content) in changes {
        let result = (|| {
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)
                .map_err(|error| {
                    if error.kind() == std::io::ErrorKind::AlreadyExists {
                        format!("workspace target {} already exists", target.display())
                    } else {
                        format!("cannot create {}: {error}", target.display())
                    }
                })?;
            if let Err(error) = file.write_all(content) {
                let cleanup = fs::remove_file(target).err();
                return Err(match cleanup {
                    Some(cleanup) => format!(
                        "cannot write {}: {error}; cleanup also failed: {cleanup}",
                        target.display()
                    ),
                    None => format!("cannot write {}: {error}", target.display()),
                });
            }
            Ok(())
        })();

        if let Err(error) = result {
            let rollback_errors = created
                .iter()
                .rev()
                .filter_map(|path: &PathBuf| {
                    fs::remove_file(path)
                        .err()
                        .map(|rollback| format!("cannot remove {}: {rollback}", path.display()))
                })
                .collect::<Vec<_>>();
            return if rollback_errors.is_empty() {
                Err(error)
            } else {
                Err(format!(
                    "{error}; workspace initialization rollback also failed: {}",
                    rollback_errors.join("; ")
                ))
            };
        }
        created.push(target.clone());
    }
    Ok(())
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
        paths.push(format!("{}/document.md", reference.document));
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
pub async fn choose_workspace_source_directory() -> Result<Option<WorkspaceDirectory>, String> {
    let Some(root) = rfd::AsyncFileDialog::new().pick_folder().await else {
        return Ok(None);
    };
    let root = root.path();
    Ok(Some(WorkspaceDirectory {
        name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("workspace")
            .to_owned(),
        path: root.to_string_lossy().into_owned(),
    }))
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

fn source_file_fingerprint(bytes: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(b"file");
    hasher.update(bytes);
    hasher.finalize().to_vec()
}

fn workspace_source_relative_name(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
    relative.to_str().map(str::to_owned)
        .ok_or_else(|| format!("workspace path {} is not UTF-8", path.display()))
}

fn unreadable_source_fingerprint(path: &Path, error: &std::io::Error) -> Result<Vec<u8>, String> {
    let mut accessible = path;
    let metadata = loop {
        match fs::metadata(accessible) {
            Ok(metadata) => break metadata,
            Err(_) => {
                accessible = accessible.parent()
                    .ok_or_else(|| format!("cannot inspect inaccessible workspace path {}", path.display()))?;
            }
        }
    };
    let mut hasher = Sha256::new();
    hasher.update(format!("unreadable:{:?}:{}:{:?}:{:?}", error.kind(), metadata.len(),
        metadata.modified(), metadata.permissions()));
    Ok(hasher.finalize().to_vec())
}

/// The inode change time, where the platform reports one. This is the only part of a cheap
/// signature that proves a file did not change: size and modification time are both settable
/// by the writer, while the change time is not settable from userspace.
///
/// `std` exposes it on Unix and nothing equivalent on Windows, where a file's change time is
/// reachable only through the Win32 API. A platform without one reports `None`, which is what
/// stops its cache from ever being reused.
#[cfg(unix)]
fn source_change_stamp(metadata: &fs::Metadata) -> Option<(i64, i64)> {
    use std::os::unix::fs::MetadataExt;
    Some((metadata.ctime(), metadata.ctime_nsec()))
}

#[cfg(not(unix))]
fn source_change_stamp(_metadata: &fs::Metadata) -> Option<(i64, i64)> {
    None
}

/// The cheap signal a poll compares before it reads a file's bytes again: how large it is,
/// when it was last modified, and — where the platform reports one — when its inode last
/// changed.
///
/// Size and modification time alone would make "the modification time did not move" read as
/// "the content did not change", and a writer that rewrites a file and restores its
/// modification time would then be invisible to a poll. `proves_unchanged` is therefore the
/// only thing that authorizes reuse, and it answers from the change stamp: where the platform
/// reports none, a cached digest is never reused and every acquisition reads the bytes again —
/// the cost this cache exists to avoid, paid rather than guessed at.
#[derive(Clone, PartialEq, Eq)]
struct SourceEntrySignature {
    length: u64,
    modified_nanos: Option<u128>,
    changed: Option<(i64, i64)>,
}

impl SourceEntrySignature {
    fn of(metadata: &fs::Metadata) -> Self {
        Self {
            length: metadata.len(),
            modified_nanos: metadata
                .modified()
                .ok()
                .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos()),
            changed: source_change_stamp(metadata),
        }
    }

    /// Whether equality of two of these proves the file's bytes are unchanged.
    ///
    /// Size and modification time do not prove it: both are settable by the writer, so a
    /// rewrite that restores them leaves the signature identical. The inode change time is not
    /// settable from userspace, so where it was observed, equality through it does prove it —
    /// and where it was not, this says so and the walk reads the file again.
    fn proves_unchanged(&self) -> bool {
        self.changed.is_some()
    }
}

/// A digest that came from reading a file's bytes, kept so an unchanged file does not have to
/// be read again by the next poll, with the instant its bytes were last read.
struct CachedSourceFile {
    signature: SourceEntrySignature,
    digest: Vec<u8>,
    verified_at: Instant,
}

/// How long a cached digest may be reported without the bytes behind it being read again.
///
/// The change stamp narrows the signal but does not make it a proof, and nothing a stat can
/// report will: a writer can leave size, modification time and change time all identical — an
/// `mmap` write whose page has not been written back yet, a filesystem with coarse timestamp
/// granularity, a network filesystem serving cached attributes. So every file is read from bytes
/// again at least this often, which bounds how long such a change can stay unobserved instead of
/// leaving it unobserved forever. The poll stays a metadata walk in between; the bound costs one
/// full read per file per interval.
const FULL_VERIFICATION_INTERVAL: Duration = Duration::from_secs(60);

/// The last cheap observation of each workspace this process is still watching, keyed by
/// canonical root.
type CachedSourceFiles = BTreeMap<String, CachedSourceFile>;

struct RetainedWorkspaceObservation {
    root: PathBuf,
    files: CachedSourceFiles,
    last_used: Instant,
}

type WorkspaceSourceObservations = Mutex<Vec<RetainedWorkspaceObservation>>;

static WORKSPACE_SOURCE_OBSERVATIONS: OnceLock<WorkspaceSourceObservations> = OnceLock::new();

/// How long an observation survives without being used. A workspace being polled is used every
/// second, so this expires only workspaces this process has stopped watching.
const RETAINED_OBSERVATION_IDLE: Duration = Duration::from_secs(300);

/// How many observations the cache carries before it starts dropping idle ones. The bound is
/// applied to idle entries only, and that is the point: evicting the entry a poll is about to
/// reuse would make switching back to a workspace cost a full read, and would let one window's
/// work decide another window's cost.
const RETAINED_WORKSPACE_OBSERVATIONS: usize = 8;

fn workspace_source_observations() -> &'static WorkspaceSourceObservations {
    WORKSPACE_SOURCE_OBSERVATIONS.get_or_init(|| Mutex::new(Vec::new()))
}

fn take_workspace_source_observation(root: &Path) -> CachedSourceFiles {
    let mut observations = workspace_source_observations()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match observations.iter().position(|observation| observation.root == root) {
        Some(index) => observations.remove(index).files,
        None => CachedSourceFiles::new(),
    }
}

fn retain_workspace_source_observation(root: &Path, files: CachedSourceFiles) {
    let mut observations = workspace_source_observations()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    observations.retain(|observation| observation.root != root);
    let now = Instant::now();
    observations.push(RetainedWorkspaceObservation {
        root: root.to_owned(),
        files,
        last_used: now,
    });
    prune_workspace_source_observations(&mut observations, now);
}

/// Drop observations no poll has used for a while, once the cache carries more than it is
/// willing to. `now` is a parameter rather than a call to the clock so the rule can be tested
/// without waiting for it.
fn prune_workspace_source_observations(
    observations: &mut Vec<RetainedWorkspaceObservation>,
    now: Instant,
) {
    if observations.len() <= RETAINED_WORKSPACE_OBSERVATIONS {
        return;
    }
    let expiry = now - RETAINED_OBSERVATION_IDLE;
    observations.retain(|observation| observation.last_used >= expiry);
}

/// Forget what a cheap observation remembers about a root, so the next poll reads every file
/// again. A commit has just replaced content the cache was built from; re-reading once is what
/// makes the version that poll reports the content-verified one the commit predicted, whatever
/// the filesystem's clocks did while the replacement landed.
fn forget_workspace_source_observation(root: &Path) {
    workspace_source_observations()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .retain(|observation| observation.root != root);
}

#[cfg(test)]
thread_local! {
    /// Files whose bytes the current test thread read while walking a workspace. A poll over an
    /// unchanged workspace must add nothing here, which is the cost assertion this cache exists
    /// for; the full content verification a commit performs adds one per file, as it always has.
    static SOURCE_CONTENT_READS: Cell<u64> = const { Cell::new(0) };
}

#[cfg(test)]
fn count_source_content_read() {
    SOURCE_CONTENT_READS.with(|reads| reads.set(reads.get() + 1));
}

#[cfg(test)]
fn source_content_reads() -> u64 {
    SOURCE_CONTENT_READS.with(|reads| reads.get())
}

/// One entry a workspace-source walk reached. Directories that could be listed are not
/// reported, because the walk descends into them; what a caller has to decide about is a file
/// whose bytes are content and a path whose kind or listing could not be read.
enum SourceWalkEntry<'a> {
    File {
        name: &'a str,
        path: &'a Path,
    },
    Inaccessible {
        name: &'a str,
        path: &'a Path,
        error: &'a std::io::Error,
    },
}

/// The single traversal behind both the full content verification a commit performs and the
/// cheap observation a poll performs. They must reach the same entries and treat root `.git`,
/// symlinks and unreadable paths identically, so they differ only in what they do with a file,
/// never in what they visit.
fn walk_workspace_source<F>(root: &Path, directory: &Path, visit: &mut F) -> Result<(), String>
where
    F: FnMut(SourceWalkEntry<'_>) -> Result<(), String>,
{
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) => {
            let name = format!("{}/", workspace_source_relative_name(root, directory)?);
            return visit(SourceWalkEntry::Inaccessible {
                name: &name,
                path: directory,
                error: &error,
            });
        }
    };
    let mut entries = entries
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("cannot read workspace entry: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        if path == root.join(".git") {
            continue;
        }
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(error) => {
                let name = workspace_source_relative_name(root, &path)?;
                visit(SourceWalkEntry::Inaccessible {
                    name: &name,
                    path: &path,
                    error: &error,
                })?;
                continue;
            }
        };
        if kind.is_symlink() {
            return Err(format!(
                "workspace source contains symlink {}",
                path.display()
            ));
        }
        if kind.is_dir() {
            walk_workspace_source(root, &path, visit)?;
            continue;
        }
        if !kind.is_file() {
            continue;
        }
        let name = workspace_source_relative_name(root, &path)?;
        visit(SourceWalkEntry::File {
            name: &name,
            path: &path,
        })?;
    }
    Ok(())
}

/// Every file's content digest, read from bytes. This is the verification a commit compares its
/// precondition against, and it never consults the cheap observation's cache.
fn workspace_source_fingerprints(root: &Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let mut files = BTreeMap::new();
    walk_workspace_source(&root, &root, &mut |entry| match entry {
        SourceWalkEntry::File { name, path } => {
            #[cfg(test)]
            count_source_content_read();
            let fingerprint = match fs::read(path) {
                Ok(bytes) => source_file_fingerprint(&bytes),
                // Unreadable object text remains a local diagnostic at acquisition. Observe
                // metadata and access-state changes without pretending to have read its bytes.
                Err(error) => unreadable_source_fingerprint(path, &error)?,
            };
            files.insert(name.to_owned(), fingerprint);
            Ok(())
        }
        SourceWalkEntry::Inaccessible { name, path, error } => {
            files.insert(name.to_owned(), unreadable_source_fingerprint(path, error)?);
            Ok(())
        }
    })?;
    Ok(files)
}

/// The revision a poll reports: the last content-verified digest of every file whose cheap
/// signal has not moved and whose digest has been verified recently, and a fresh read of every
/// other file.
///
/// The change stamp is what authorizes reuse, and it is a narrower signal than size and
/// modification time: both of those are settable by the writer, the change time is not. It is
/// still an observation rather than a proof, because a writer can leave all three identical
/// (`FULL_VERIFICATION_INTERVAL` names how that is bounded), so no write is ever authorized on
/// it: a commit verifies the whole source from bytes, and a change this walk did not see refuses
/// that commit instead of being overwritten by it.
fn observe_workspace_source(root: &Path) -> Result<BTreeMap<String, Vec<u8>>, String> {
    observe_workspace_source_at(root, Instant::now())
}

/// The same walk at an instant the caller supplies, so the verification bound is testable
/// without waiting a minute for it.
fn observe_workspace_source_at(
    root: &Path,
    now: Instant,
) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let previous = take_workspace_source_observation(&root);
    let mut fingerprints = BTreeMap::new();
    let mut files = CachedSourceFiles::new();
    walk_workspace_source(&root, &root, &mut |entry| {
        let (name, path) = match entry {
            SourceWalkEntry::File { name, path } => (name, path),
            SourceWalkEntry::Inaccessible { name, path, error } => {
                // A path whose kind or listing could not be read is never remembered: its
                // fingerprint comes from metadata and access state, so it is re-derived every
                // time rather than reused on a signature that does not cover what produced it.
                fingerprints.insert(name.to_owned(), unreadable_source_fingerprint(path, error)?);
                return Ok(());
            }
        };
        let signature = fs::metadata(path)
            .ok()
            .map(|metadata| SourceEntrySignature::of(&metadata));
        if let (Some(signature), Some(cached)) = (&signature, previous.get(name)) {
            // Reuse needs the change stamp (size and modification time are settable by the
            // writer) and needs the digest behind it to be recent enough that the stamp's
            // remaining uncertainty stays bounded.
            if signature.proves_unchanged()
                && &cached.signature == signature
                && now.saturating_duration_since(cached.verified_at) < FULL_VERIFICATION_INTERVAL
            {
                fingerprints.insert(name.to_owned(), cached.digest.clone());
                files.insert(
                    name.to_owned(),
                    CachedSourceFile {
                        signature: signature.clone(),
                        digest: cached.digest.clone(),
                        verified_at: cached.verified_at,
                    },
                );
                return Ok(());
            }
        }
        #[cfg(test)]
        count_source_content_read();
        match fs::read(path) {
            Ok(bytes) => {
                let digest = source_file_fingerprint(&bytes);
                // Only a signature that could prove "unchanged" is worth remembering. Keeping
                // one that cannot would grow the cache for a poll that must read this file
                // again regardless.
                if let Some(signature) = signature.filter(SourceEntrySignature::proves_unchanged) {
                    files.insert(
                        name.to_owned(),
                        CachedSourceFile {
                            signature,
                            digest: digest.clone(),
                            verified_at: now,
                        },
                    );
                }
                fingerprints.insert(name.to_owned(), digest);
            }
            Err(error) => {
                // An unreadable file is not remembered either: it would be reused on the same
                // signature the read failed under, and a permission a poll did not read would
                // then read as "unchanged". Re-deriving it keeps the localized diagnostic this
                // has always reported, without any claim to have verified the bytes.
                fingerprints.insert(
                    name.to_owned(),
                    unreadable_source_fingerprint(path, &error)?,
                );
            }
        }
        Ok(())
    })?;
    retain_workspace_source_observation(&root, files);
    Ok(fingerprints)
}

fn workspace_source_revision_from_fingerprints(files: &BTreeMap<String, Vec<u8>>) -> String {
    let mut hasher = Sha256::new();
    for (path, fingerprint) in files {
        hasher.update((path.len() as u64).to_le_bytes());
        hasher.update(path.as_bytes());
        hasher.update(fingerprint);
    }
    format!("{:x}", hasher.finalize())
}

fn workspace_source_revision_for_root(root: &Path) -> Result<String, String> {
    Ok(workspace_source_revision_from_fingerprints(
        &observe_workspace_source(root)?,
    ))
}

fn verify_workspace_source_fingerprints(
    files: &BTreeMap<String, Vec<u8>>,
    expected_revision: Option<&str>,
) -> Result<(), String> {
    if expected_revision.is_some_and(|expected| workspace_source_revision_from_fingerprints(files) != expected) {
        return Err("workspace changed externally before commit".to_owned());
    }
    Ok(())
}

#[tauri::command]
pub async fn workspace_source_revision(root_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        workspace_source_revision_for_root(Path::new(&root_path))
    })
    .await
    .map_err(|error| format!("workspace source revision task failed: {error}"))?
}

// Every file under one object's owned directory, including assets no document mentions.
// Deletion needs the inventory the filesystem has and a document scan cannot produce. The
// walk stays inside the requested directory: it is not a recursive listing of arbitrary
// workspace paths, and it refuses to follow a symlink out of the workspace.
fn collect_owned_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("cannot read {}: {error}", directory.display()))?;
    let mut entries = entries
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("cannot read workspace entry: {error}"))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let kind = entry
            .file_type()
            .map_err(|error| format!("cannot inspect {}: {error}", path.display()))?;
        if kind.is_symlink() {
            return Err(format!(
                "workspace object directory contains symlink {}",
                path.display()
            ));
        }
        if kind.is_dir() {
            collect_owned_files(root, &path, files)?;
            continue;
        }
        if kind.is_file() {
            files.push(workspace_source_relative_name(root, &path)?.replace('\\', "/"));
        }
    }
    Ok(())
}

// Ownership is decided by the manifest, not by the shape of the path: the inventory may
// only be taken for a directory some object actually claims as its own. A workspace file
// that belongs to nobody is not something a deletion is allowed to enumerate.
fn is_object_document_directory(root: &Path, relative: &Path) -> Result<bool, String> {
    let manifest_path = root.join(MANIFEST_PATH);
    let manifest_text = fs::read_to_string(&manifest_path)
        .map_err(|error| format!("cannot read {}: {error}", manifest_path.display()))?;
    let manifest: WorkspaceDocument = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("invalid {MANIFEST_PATH}: {error}"))?;
    let values = manifest
        .graph
        .points
        .iter()
        .map(|point| &point.data)
        .chain(manifest.graph.hyperedges.iter().map(|edge| &edge.data));
    for value in values {
        let reference: DocumentReference = serde_json::from_value(value.clone())
            .map_err(|error| format!("invalid document reference: {error}"))?;
        if safe_relative_path(&reference.document)? == relative {
            return Ok(true);
        }
    }
    Ok(false)
}

fn owned_files_for_directory(root: &Path, directory: &str) -> Result<Vec<String>, String> {
    let relative = safe_relative_path(directory)?;
    if relative.components().count() == 0
        || relative.starts_with(".derivon")
        || !is_object_document_directory(root, &relative)?
    {
        return Err(format!(
            "`{directory}` is not an object document directory"
        ));
    }
    let canonical_root = fs::canonicalize(root)
        .map_err(|error| format!("cannot resolve workspace root {}: {error}", root.display()))?;
    let target = canonical_root.join(&relative);
    if !target
        .try_exists()
        .map_err(|error| format!("cannot inspect {}: {error}", target.display()))?
    {
        // An object whose directory is already gone owns no files; that is an inventory of
        // zero, not a failure to take one.
        return Ok(Vec::new());
    }
    let canonical_target = fs::canonicalize(&target)
        .map_err(|error| format!("cannot resolve {}: {error}", target.display()))?;
    if !canonical_target.starts_with(&canonical_root) || canonical_target == canonical_root {
        return Err(format!(
            "workspace path `{directory}` resolves outside the workspace"
        ));
    }
    if !canonical_target.is_dir() {
        return Err(format!("workspace path `{directory}` is not a directory"));
    }
    let mut files = Vec::new();
    collect_owned_files(&canonical_root, &canonical_target, &mut files)?;
    files.sort();
    Ok(files)
}

#[tauri::command]
pub async fn list_workspace_source_owned_files(
    root_path: String,
    directory: String,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        owned_files_for_directory(Path::new(&root_path), &directory)
    })
    .await
    .map_err(|error| format!("workspace owned file inventory task failed: {error}"))?
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
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&root_path);
        commit_workspace_source_changes_to_disk(root, &changes)
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
    for (relative, content) in files {
        let path = root.join(safe_relative_path(&relative)?);
        let parent = path
            .parent()
            .ok_or_else(|| format!("workspace file `{relative}` has no parent"))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
        replace_workspace_source_file(&path, content.as_bytes())?;
    }
    // Same order as a commit: the manifest that names the documents is replaced after them.
    replace_workspace_source_file(&manifest_path, manifest_text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "runtime budget; run separately from parallel filesystem tests"]
    fn workspace_opening_revision_budget() {
        let root = tempfile::tempdir().unwrap();
        // Generated HTML-sized payload; no external workspace content is redistributed.
        fs::write(root.path().join("index.html"), vec![b'x'; 64 * 1024 * 1024]).unwrap();
        let start = std::time::Instant::now();
        let before = workspace_source_revision_for_root(root.path()).unwrap();
        let after = workspace_source_revision_for_root(root.path()).unwrap();
        let elapsed = start.elapsed();
        println!("two opening revisions (64 MiB): {elapsed:?}");
        assert_eq!(before, after);
        assert!(
            elapsed <= std::time::Duration::from_millis(2500),
            "opening revisions exceed 2.5s: {elapsed:?}"
        );
    }

    #[test]
    #[cfg(unix)]
    #[ignore = "runtime budget; run separately from parallel filesystem tests"]
    fn workspace_source_poll_cost_is_metadata_not_content() {
        // Unix-only: the reuse this holds to account needs an inode change time, so on a platform
        // that reports none a poll reads the workspace by design and there is no cheap cost to
        // assert.
        let root = tempfile::tempdir().unwrap();
        // Generated HTML-sized payload; no external workspace content is redistributed.
        fs::write(root.path().join("index.html"), vec![b'x'; 64 * 1024 * 1024]).unwrap();

        let start = std::time::Instant::now();
        workspace_source_revision_for_root(root.path()).unwrap();
        let cold = start.elapsed();

        let start = std::time::Instant::now();
        let polls = 20;
        for _ in 0..polls {
            workspace_source_revision_for_root(root.path()).unwrap();
        }
        let warm = start.elapsed();
        println!("cold revision {cold:?}, {polls} polls over an unchanged workspace {warm:?}");
        assert!(
            warm < cold,
            "{polls} polls over an unchanged workspace ({warm:?}) cost more than the first read \
             of every file ({cold:?})"
        );
    }

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
                expected_revision: None,
                create_only: false,
                documents: vec![WorkspaceSourceTextChange {
                    path: "docs/points/a/document.md".to_owned(),
                    content: Some(opened_document),
                    create_only: false,
                }],
                assets: vec![WorkspaceSourceAssetChange {
                    path: "assets/diagram.bin".to_owned(),
                    content: Some(opened_asset),
                }],
                companion_metadata: vec![WorkspaceSourceTextChange {
                    path: ".derivon/orientation.json".to_owned(),
                    content: opened_companion,
                    create_only: false,
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
            expected_revision: None,
            create_only: false,
            documents: vec![WorkspaceSourceTextChange {
                path: "docs/original.md".to_owned(),
                content: Some("changed\n".to_owned()),
                create_only: false,
            }],
            assets: vec![],
            companion_metadata: vec![WorkspaceSourceTextChange {
                path: MANIFEST_PATH.to_owned(),
                content: Some("not metadata\n".to_owned()),
                create_only: false,
            }],
        };

        assert!(commit_workspace_source_changes_to_disk(root.path(), &changes).is_err());
        assert_eq!(
            fs::read_to_string(root.path().join("docs/original.md")).unwrap(),
            "original\n"
        );
    }

    #[test]
    fn workspace_source_changes_defaults_create_only_and_accepts_camel_case() {
        let regular: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({}))
            .expect("changes without createOnly should deserialize");
        assert!(!regular.create_only);

        let initialization: WorkspaceSourceChanges =
            serde_json::from_value(serde_json::json!({ "createOnly": true }))
                .expect("camelCase createOnly should deserialize");
        assert!(initialization.create_only);

        let regular_text: WorkspaceSourceTextChange = serde_json::from_value(
            serde_json::json!({ "path": "docs/a.md", "content": "regular" }),
        )
        .expect("text change without createOnly should deserialize");
        assert!(!regular_text.create_only);

        let create_only_text: WorkspaceSourceTextChange =
            serde_json::from_value(serde_json::json!({
                "path": "docs/a.md",
                "content": "new",
                "createOnly": true
            }))
            .expect("text change with camelCase createOnly should deserialize");
        assert!(create_only_text.create_only);
    }

    #[test]
    fn regular_commit_refuses_create_only_document_collision_before_writing_graph() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let root = tempfile::tempdir().unwrap();
        let original_graph = fs::read_to_string(fixture.join(MANIFEST_PATH)).unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        fs::create_dir_all(root.path().join("docs/points/new-concept")).unwrap();
        fs::write(root.path().join(MANIFEST_PATH), &original_graph).unwrap();
        fs::write(
            root.path().join("docs/points/new-concept/document.md"),
            "orphan document\n",
        )
        .unwrap();

        let mut changed_graph: serde_json::Value = serde_json::from_str(&original_graph).unwrap();
        changed_graph["graph"]["points"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "id": "new-concept",
                "data": {
                    "label": "New concept",
                    "document": "docs/points/new-concept",
                    "format": "markdown"
                }
            }));
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "graph": serde_json::to_string_pretty(&changed_graph).unwrap(),
            "documents": [{
                "path": "docs/points/new-concept/document.md",
                "content": "# New concept\n",
                "createOnly": true
            }]
        }))
        .unwrap();

        let error = commit_workspace_source_changes_to_disk(root.path(), &changes).unwrap_err();

        assert!(error.contains("already exists"));
        assert_eq!(
            fs::read_to_string(root.path().join(MANIFEST_PATH)).unwrap(),
            original_graph
        );
        assert_eq!(
            fs::read_to_string(root.path().join("docs/points/new-concept/document.md")).unwrap(),
            "orphan document\n"
        );
    }

    #[test]
    fn workspace_source_revision_ignores_empty_directory_preparation() {
        let root = tempfile::tempdir().unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "expectedRevision": revision,
            "documents": [{ "path": "docs/new/index.html", "content": "new", "createOnly": true }]
        })).unwrap();
        commit_workspace_source_changes_to_disk(root.path(), &changes).unwrap();
        assert_eq!(fs::read_to_string(root.path().join("docs/new/index.html")).unwrap(), "new");
    }

    #[test]
    fn workspace_source_revision_frames_file_names_and_contents() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/a"), "bc").unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        fs::remove_file(root.path().join("docs/a")).unwrap();
        fs::write(root.path().join("docs/ab"), "c").unwrap();
        assert_ne!(workspace_source_revision_for_root(root.path()).unwrap(), revision);
    }

    #[test]
    fn workspace_source_revision_covers_paths_outside_conventional_directories() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("chapters/concept")).unwrap();
        fs::write(root.path().join("chapters/concept/index.html"), "accepted").unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        fs::write(root.path().join("chapters/concept/index.html"), "external").unwrap();
        assert_ne!(workspace_source_revision_for_root(root.path()).unwrap(), revision);
    }

    /// A cheap observation must conclude exactly what reading every file would conclude.
    fn observed_revision(root: &Path) -> String {
        let observed = workspace_source_revision_for_root(root).unwrap();
        let verified = workspace_source_revision_from_fingerprints(
            &workspace_source_fingerprints(root).unwrap(),
        );
        assert_eq!(
            observed, verified,
            "cheap observation disagrees with the full hash for {}",
            root.display()
        );
        observed
    }

    #[test]
    fn workspace_source_observation_is_dropped_only_after_it_has_gone_idle() {
        let now = Instant::now();
        let observation = |name: &str, age: Duration| RetainedWorkspaceObservation {
            root: PathBuf::from(name),
            files: CachedSourceFiles::new(),
            last_used: now - age,
        };
        let fresh = Duration::from_secs(1);
        let idle = RETAINED_OBSERVATION_IDLE + fresh;

        // Under the bound, an old observation stays: nothing a poll has not used is worth
        // dropping while there is room for it.
        let mut observations = vec![observation("a", idle), observation("b", idle)];
        prune_workspace_source_observations(&mut observations, now);
        assert_eq!(observations.len(), 2);

        // Over the bound, only the idle entry goes. The workspace a poll just used is the one
        // the user is watching, and evicting it would make the next poll read everything.
        let mut observations = (0..RETAINED_WORKSPACE_OBSERVATIONS)
            .map(|index| observation(&format!("fresh-{index}"), fresh))
            .collect::<Vec<_>>();
        observations.push(observation("idle", idle));
        prune_workspace_source_observations(&mut observations, now);
        assert_eq!(observations.len(), RETAINED_WORKSPACE_OBSERVATIONS);
        assert!(observations
            .iter()
            .all(|observation| observation.root != Path::new("idle")));
    }

    /// The cost rule is platform-dependent, and both halves are asserted: a change stamp proves
    /// "unchanged" and the cached digest is reused, while a platform that reports no change
    /// stamp has no such proof, so the walk reads the bytes again instead of trusting size and
    /// modification time.
    #[test]
    fn workspace_source_poll_reads_only_the_files_whose_signal_proves_them_unchanged() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs/nested")).unwrap();
        fs::write(root.path().join("docs/a.md"), "a\n").unwrap();
        fs::write(root.path().join("docs/nested/b.md"), "b\n").unwrap();

        let reads = source_content_reads();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        assert_eq!(source_content_reads() - reads, 2, "a cold observation reads every file once");

        let reads = source_content_reads();
        assert_eq!(workspace_source_revision_for_root(root.path()).unwrap(), revision);
        let unchanged_reads = source_content_reads() - reads;
        #[cfg(unix)]
        assert_eq!(
            unchanged_reads, 0,
            "an unchanged workspace reads no file where the platform reports a change time"
        );
        #[cfg(not(unix))]
        assert_eq!(
            unchanged_reads, 2,
            "without a change time nothing proves the bytes unchanged, so they are read again"
        );

        // A file whose signal moved is a candidate on every platform. Where the cheap signal
        // cannot prove anything, every file is one.
        fs::write(root.path().join("docs/nested/b.md"), "changed\n").unwrap();
        let reads = source_content_reads();
        let changed = workspace_source_revision_for_root(root.path()).unwrap();
        assert_eq!(
            source_content_reads() - reads,
            if cfg!(unix) { 1 } else { 2 },
            "a moved signal is the candidate a poll reads"
        );
        assert_ne!(changed, revision);

        // The verification a commit performs still reads every file, whatever the cheap
        // observation remembers, and reaches the version the poll reported.
        let reads = source_content_reads();
        let verified = workspace_source_revision_from_fingerprints(
            &workspace_source_fingerprints(root.path()).unwrap(),
        );
        assert_eq!(source_content_reads() - reads, 2);
        assert_eq!(verified, changed);
    }

    /// A cached digest is reused only on a signature that carries a change stamp, and only while
    /// the bytes behind it are recent enough. Size and modification time are settable by the
    /// writer, so a signature without a change stamp — what a platform that reports none produces
    /// — must never be reused: a same-size rewrite that restores modification time would
    /// otherwise be reported as the version it replaced.
    #[test]
    fn a_cheap_observation_is_reused_only_on_a_signature_that_proves_unchanged() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.md"), "a\n").unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();

        let metadata = fs::metadata(root.path().join("a.md")).unwrap();
        let mut without_a_change_stamp = SourceEntrySignature::of(&metadata);
        without_a_change_stamp.changed = None;
        assert!(
            !without_a_change_stamp.proves_unchanged(),
            "size and modification time are both settable by the writer"
        );
        let mut with_a_change_stamp = SourceEntrySignature::of(&metadata);
        with_a_change_stamp.changed = Some((1, 2));
        assert!(
            with_a_change_stamp.proves_unchanged(),
            "an inode change time is not settable from userspace"
        );

        let now = Instant::now();
        let canonical = fs::canonicalize(root.path()).unwrap();
        retain_workspace_source_observation(
            &canonical,
            [(
                "a.md".to_owned(),
                CachedSourceFile {
                    signature: without_a_change_stamp,
                    digest: b"a digest nothing verified".to_vec(),
                    verified_at: now,
                },
            )]
            .into_iter()
            .collect(),
        );

        let reads = source_content_reads();
        let observed = observe_workspace_source_at(root.path(), now).unwrap();
        assert_eq!(
            source_content_reads() - reads,
            1,
            "a signature that cannot prove unchanged must not be reused"
        );
        assert_eq!(
            workspace_source_revision_from_fingerprints(&observed),
            revision,
            "the digest reported is the one read from the bytes"
        );
    }

    /// The change stamp narrows the signal but is not a proof: a writer can leave size,
    /// modification time and change time identical (an `mmap` write before its writeback, a
    /// filesystem with coarse timestamp granularity, a network filesystem caching attributes).
    /// Every file is therefore read from bytes again at least once per interval, which is what
    /// bounds how long such a change can stay unobserved.
    #[test]
    fn a_cheap_observation_is_verified_from_bytes_once_per_interval() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/a.md"), "a\n").unwrap();
        fs::write(root.path().join("docs/b.md"), "b\n").unwrap();
        let now = Instant::now();

        observe_workspace_source_at(root.path(), now).unwrap();
        let reads = source_content_reads();
        observe_workspace_source_at(root.path(), now + Duration::from_secs(1)).unwrap();
        assert_eq!(source_content_reads() - reads, 0, "inside the interval the signal decides");

        // One instant past the interval, every cached digest has to be earned again from bytes —
        // including the ones whose signature, by every field it carries, looks untouched.
        let reads = source_content_reads();
        let observed = observe_workspace_source_at(
            root.path(),
            now + FULL_VERIFICATION_INTERVAL,
        )
        .unwrap();
        assert_eq!(
            source_content_reads() - reads,
            2,
            "the interval bounds how long a signal can speak for the bytes"
        );
        assert_eq!(
            observed,
            workspace_source_fingerprints(root.path()).unwrap(),
            "the version reported is the one a full read produces"
        );
    }

    #[test]
    fn a_commit_drops_the_cheap_observation_so_the_next_poll_reads_every_file() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/a.md"), "a\n").unwrap();
        fs::write(root.path().join("docs/b.md"), "b\n").unwrap();

        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        let reads = source_content_reads();
        assert_eq!(workspace_source_revision_for_root(root.path()).unwrap(), revision);
        assert_eq!(
            source_content_reads() - reads,
            if cfg!(unix) { 0 } else { 2 },
            "before the commit, reuse follows the platform's signal"
        );

        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "expectedRevision": revision,
            "documents": [{ "path": "docs/a.md", "content": "a\n" }]
        }))
        .unwrap();
        assert_eq!(
            commit_workspace_source_changes_to_disk(root.path(), &changes).unwrap(),
            revision
        );

        // The commit replaced the basis the cache was built from, so the next poll verifies
        // every file from bytes again and reaches the version the commit predicted.
        let reads = source_content_reads();
        let observed = workspace_source_revision_for_root(root.path()).unwrap();
        assert_eq!(
            source_content_reads() - reads,
            2,
            "a commit must not leave a cheap observation behind"
        );
        assert_eq!(observed, revision);
    }

    #[test]
    fn workspace_source_observation_concludes_what_reading_every_file_concludes() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs/nested")).unwrap();
        fs::write(root.path().join("docs/a.md"), "a\n").unwrap();
        fs::write(root.path().join("docs/nested/b.md"), "b\n").unwrap();

        let initial = observed_revision(root.path());

        // A file touched without new content is re-read and concludes the same version.
        let moved = fs::metadata(root.path().join("docs/a.md"))
            .unwrap()
            .modified()
            .unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(root.path().join("docs/a.md"))
            .unwrap()
            .set_times(fs::FileTimes::new().set_modified(moved))
            .unwrap();
        assert_eq!(observed_revision(root.path()), initial);

        // A content change of the same length, in a nested file.
        fs::write(root.path().join("docs/nested/b.md"), "c\n").unwrap();
        let changed = observed_revision(root.path());
        assert_ne!(changed, initial);

        // Empty directories are not workspace content, whether they appear or go.
        fs::create_dir_all(root.path().join("docs/empty")).unwrap();
        assert_eq!(observed_revision(root.path()), changed);
        fs::remove_dir(root.path().join("docs/empty")).unwrap();
        assert_eq!(observed_revision(root.path()), changed);

        // An added, a renamed and a removed file each move the version, and removing the file
        // that was added returns to the version the same content had before.
        fs::write(root.path().join("docs/c.md"), "c\n").unwrap();
        let added = observed_revision(root.path());
        assert_ne!(added, changed);
        fs::rename(root.path().join("docs/c.md"), root.path().join("docs/d.md")).unwrap();
        let renamed = observed_revision(root.path());
        assert_ne!(renamed, added);
        fs::remove_file(root.path().join("docs/d.md")).unwrap();
        let removed = observed_revision(root.path());
        assert_ne!(removed, renamed);
        assert_eq!(removed, changed);
    }

    #[cfg(unix)]
    #[test]
    fn workspace_source_revision_sees_a_content_change_that_keeps_the_modification_time() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        let path = root.path().join("docs/a.md");
        fs::write(&path, "one\n").unwrap();
        let revision = observed_revision(root.path());

        // Two observations cannot share one clock tick, so the write below has a change time of
        // its own even though the modification time is put back to what it was.
        std::thread::sleep(std::time::Duration::from_millis(10));
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let mut file = fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.write_all(b"two\n").unwrap();
        file.set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        drop(file);

        let restored = fs::metadata(&path).unwrap();
        assert_eq!(
            restored.len(),
            4,
            "the change must keep the size to mean anything"
        );
        assert_eq!(
            restored.modified().unwrap(),
            modified,
            "the change must keep the modification time to mean anything"
        );
        assert_ne!(
            observed_revision(root.path()),
            revision,
            "a content change that restored the modification time was missed"
        );
    }

    #[cfg(unix)]
    #[test]
    fn workspace_source_revision_refuses_a_symlink_and_recovers_without_it() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/a.md"), "a\n").unwrap();
        let revision = observed_revision(root.path());

        std::os::unix::fs::symlink("a.md", root.path().join("docs/link.md")).unwrap();
        let error = workspace_source_revision_for_root(root.path()).unwrap_err();
        assert!(error.contains("symlink"), "{error}");

        // A refused observation leaves no cache behind to be trusted by the next poll.
        fs::remove_file(root.path().join("docs/link.md")).unwrap();
        assert_eq!(observed_revision(root.path()), revision);
    }

    #[cfg(unix)]
    #[test]
    fn workspace_source_revision_keeps_unreadable_documents_local() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        let path = root.path().join("docs/unreadable.md");
        fs::write(&path, "body").unwrap();
        let readable = workspace_source_revision_for_root(root.path()).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
        let unreadable = workspace_source_revision_for_root(root.path());
        let denied = fs::read(&path).is_err();
        if denied {
            // The cheap observation makes no claim about bytes it could not read: it agrees
            // with the full walk over the same unreadable file.
            assert_eq!(
                unreadable.as_ref().unwrap(),
                &workspace_source_revision_from_fingerprints(
                    &workspace_source_fingerprints(root.path()).unwrap()
                )
            );
        }
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        let unreadable = unreadable.unwrap();
        if denied { assert_ne!(readable, unreadable); }
        assert_eq!(readable, workspace_source_revision_for_root(root.path()).unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn workspace_source_revision_keeps_unreadable_directories_local() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("chapters/a");
        fs::create_dir_all(&directory).unwrap();
        fs::write(directory.join("index.html"), "body").unwrap();
        for mode in [0o000, 0o400, 0o100] {
            fs::set_permissions(&directory, fs::Permissions::from_mode(mode)).unwrap();
            let revision = workspace_source_revision_for_root(root.path());
            let commit = revision.as_ref().ok().map(|revision| {
                let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
                    "expectedRevision": revision,
                    "documents": [{ "path": "docs/unrelated.md", "content": "unrelated" }]
                })).unwrap();
                commit_workspace_source_changes_to_disk(root.path(), &changes)
            });
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
            revision.unwrap();
            commit.unwrap().unwrap();
        }
    }

    #[test]
    fn commit_revision_does_not_adopt_an_external_write_after_the_final_check() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/other.md"), "accepted").unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "expectedRevision": revision,
            "documents": [{ "path": "docs/local.md", "content": "local" }]
        })).unwrap();
        let committed = commit_workspace_source_changes_using(root.path(), &changes, |change| {
            write_workspace_source_content(&change.target, change.content.as_deref())?;
            fs::write(root.path().join("docs/other.md"), "external").unwrap();
            Ok(())
        }).unwrap();
        assert_ne!(committed, workspace_source_revision_for_root(root.path()).unwrap());
        fs::write(root.path().join("docs/other.md"), "accepted").unwrap();
        assert_eq!(committed, workspace_source_revision_for_root(root.path()).unwrap());
    }

    #[test]
    fn commit_reports_partial_delete_and_rollback_failures() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        let deleted = root.path().join("docs/deleted.md");
        fs::write(&deleted, "original").unwrap();
        fs::write(root.path().join("docs/updated.md"), "original").unwrap();
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "documents": [
                { "path": "docs/deleted.md", "content": null },
                { "path": "docs/updated.md", "content": "updated" }
            ]
        })).unwrap();
        let error = commit_workspace_source_changes_using(root.path(), &changes, |change| {
            write_workspace_source_content(&change.target, change.content.as_deref())?;
            if change.content.is_some() {
                fs::create_dir(&deleted).unwrap();
                return Err("injected partial write failure".to_owned());
            }
            Ok(())
        }).unwrap_err();
        assert!(error.contains("injected partial write failure"));
        assert!(error.contains("rollback also failed"));
        assert_eq!(fs::read_to_string(root.path().join("docs/updated.md")).unwrap(), "original");
    }

    /** Every file under a workspace, workspace-relative, for leftover-file assertions. */
    fn workspace_entry_names(root: &Path) -> Vec<String> {
        fn walk(root: &Path, directory: &Path, names: &mut Vec<String>) {
            for entry in fs::read_dir(directory).unwrap() {
                let entry = entry.unwrap();
                let path = entry.path();
                if entry.file_type().unwrap().is_dir() {
                    walk(root, &path, names);
                } else {
                    names.push(
                        path.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .into_owned(),
                    );
                }
            }
        }
        let mut names = Vec::new();
        walk(root, root, &mut names);
        names.sort();
        names
    }

    fn large_manifest(filler: char) -> String {
        // Large enough that an in-place write is observably truncated by a reader polling it.
        format!(
            "{{\n  \"schema\": \"derivon.workspace/v1\",\n  \"document\": {{ \"title\": \"{filler}\", \"description\": \"{}\" }},\n  \"graph\": {{ \"points\": [], \"hyperedges\": [] }}\n}}\n",
            filler.to_string().repeat(256 * 1024)
        )
    }

    #[test]
    fn replacement_temporary_files_are_siblings_of_their_targets() {
        let target = Path::new("workspace/.derivon/workspace.json");
        let temporary = temporary_sibling_path(target);

        // The rename must not cross a filesystem, and the name must stay attributable.
        assert_eq!(temporary.parent(), target.parent());
        assert_ne!(temporary, target);
        assert!(temporary
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("workspace.json"));
        assert_ne!(temporary, temporary_sibling_path(target));
    }

    #[test]
    fn manifest_replacement_is_whole_at_the_replacement_point() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        let manifest_path = root.path().join(MANIFEST_PATH);
        let previous = large_manifest('a');
        let next = large_manifest('b');
        fs::write(&manifest_path, &previous).unwrap();

        // A reader arriving while the temporary file is complete and the replacement has not
        // happened yet still gets the previous manifest in full, never a prefix of the new one.
        let mut observed = None;
        replace_workspace_source_file_with(&manifest_path, next.as_bytes(), || {
            observed = Some(fs::read(&manifest_path).map_err(|error| error.to_string())?);
            Ok(())
        })
        .unwrap();

        assert_eq!(observed.as_deref(), Some(previous.as_bytes()));
        assert_eq!(fs::read(&manifest_path).unwrap(), next.as_bytes());
    }

    #[test]
    fn a_reader_polling_during_a_manifest_replacement_never_sees_a_partial_file() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        let manifest_path = root.path().join(MANIFEST_PATH);
        let versions = [large_manifest('a'), large_manifest('b')];
        fs::write(&manifest_path, versions[0].as_bytes()).unwrap();

        let reading = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true));
        let reader_path = manifest_path.clone();
        let expected = versions.clone();
        let reader = {
            let reading = std::sync::Arc::clone(&reading);
            std::thread::spawn(move || -> Result<u64, String> {
                let mut observations = 0;
                while reading.load(Ordering::Relaxed) {
                    let bytes = fs::read(&reader_path).map_err(|error| {
                        format!("manifest vanished during replacement: {error}")
                    })?;
                    let whole = expected
                        .iter()
                        .any(|version| version.as_bytes() == bytes.as_slice());
                    if !whole {
                        return Err(format!(
                            "reader observed {} bytes that are neither manifest version",
                            bytes.len()
                        ));
                    }
                    observations += 1;
                }
                Ok(observations)
            })
        };

        for round in 0..64 {
            replace_workspace_source_file(&manifest_path, versions[round % 2].as_bytes()).unwrap();
        }
        reading.store(false, Ordering::Relaxed);

        let observations = reader.join().unwrap().unwrap();
        assert!(observations > 0, "the reader never read the manifest");
    }

    #[test]
    fn a_failed_replacement_keeps_the_previous_manifest_and_removes_its_temporary_file() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        let manifest_path = root.path().join(MANIFEST_PATH);
        let previous = large_manifest('a');
        fs::write(&manifest_path, &previous).unwrap();

        let error = replace_workspace_source_file_with(
            &manifest_path,
            large_manifest('b').as_bytes(),
            || Err("injected replacement failure".to_owned()),
        )
        .unwrap_err();

        assert!(error.contains("injected replacement failure"), "{error}");
        assert_eq!(fs::read(&manifest_path).unwrap(), previous.as_bytes());
        assert_eq!(
            workspace_entry_names(root.path()),
            vec![MANIFEST_PATH.to_owned()]
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_replacement_keeps_the_targets_permission_bits() {
        use std::os::unix::fs::PermissionsExt;
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        let target = root.path().join("docs/concept.md");
        fs::write(&target, "previous\n").unwrap();
        fs::set_permissions(&target, fs::Permissions::from_mode(0o600)).unwrap();

        // The target becomes a new file, so its mode has to travel with the replacement or a
        // restricted document would silently come back readable by everyone.
        write_workspace_source_content(&target, Some(b"next\n")).unwrap();

        assert_eq!(fs::read_to_string(&target).unwrap(), "next\n");
        assert_eq!(
            fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn a_commit_leaves_no_temporary_file_in_the_workspace() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let root = tempfile::tempdir().unwrap();
        let original_graph = fs::read_to_string(fixture.join(MANIFEST_PATH)).unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        fs::write(root.path().join(MANIFEST_PATH), &original_graph).unwrap();

        let mut changed_graph: serde_json::Value = serde_json::from_str(&original_graph).unwrap();
        changed_graph["document"]["title"] = serde_json::json!("Renamed");
        let changed_graph = serde_json::to_string_pretty(&changed_graph).unwrap();
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "graph": changed_graph.clone(),
            "documents": [{ "path": "docs/points/new/document.md", "content": "# New\n" }]
        }))
        .unwrap();

        commit_workspace_source_changes_to_disk(root.path(), &changes).unwrap();
        assert_eq!(
            fs::read_to_string(root.path().join(MANIFEST_PATH)).unwrap(),
            changed_graph
        );
        let committed = workspace_entry_names(root.path());
        assert!(!committed
            .iter()
            .any(|name| name.contains(TEMPORARY_FILE_MARKER)));

        // A failing commit is a failure to produce the new manifest, not a half-written one,
        // and it cleans up after itself as well. The manifest is the last target, so this is
        // also the rollback of a manifest replacement that already happened.
        let error = commit_workspace_source_changes_using(root.path(), &changes, |change| {
            write_workspace_source_content(&change.target, change.content.as_deref())?;
            if change.target.ends_with("workspace.json") {
                return Err("injected commit failure".to_owned());
            }
            Ok(())
        })
        .unwrap_err();
        assert!(error.contains("injected commit failure"), "{error}");
        assert_eq!(
            fs::read_to_string(root.path().join(MANIFEST_PATH)).unwrap(),
            changed_graph
        );
        assert_eq!(workspace_entry_names(root.path()), committed);
    }

    #[test]
    fn a_commit_replaces_documents_before_the_manifest() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let root = tempfile::tempdir().unwrap();
        let original_graph = fs::read_to_string(fixture.join(MANIFEST_PATH)).unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        fs::write(root.path().join(MANIFEST_PATH), &original_graph).unwrap();
        let manifest_path = root.path().join(MANIFEST_PATH);

        let mut changed_graph: serde_json::Value = serde_json::from_str(&original_graph).unwrap();
        changed_graph["document"]["title"] = serde_json::json!("Renamed");
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "graph": serde_json::to_string_pretty(&changed_graph).unwrap(),
            "documents": [
                { "path": "docs/points/new/document.md", "content": "# New\n" },
                { "path": "docs/points/other/document.md", "content": "# Other\n" }
            ]
        }))
        .unwrap();

        // A reader arriving while the documents are being written still finds the previous
        // manifest. Replacing it first would publish a graph naming documents that are not there
        // yet; replacing it last keeps the workspace loadable and truthful throughout.
        let mut manifest_during_document_writes = Vec::new();
        let error = commit_workspace_source_changes_using(root.path(), &changes, |change| {
            if change.target.ends_with("document.md") {
                manifest_during_document_writes.push(fs::read_to_string(&manifest_path).unwrap());
            }
            write_workspace_source_content(&change.target, change.content.as_deref())?;
            if change.target.ends_with("other/document.md") {
                return Err("injected commit failure".to_owned());
            }
            Ok(())
        })
        .unwrap_err();

        assert!(error.contains("injected commit failure"), "{error}");
        assert_eq!(
            manifest_during_document_writes,
            vec![original_graph.clone(), original_graph.clone()]
        );
        // The failure never reached the manifest, so the manifest that was there is still there.
        assert_eq!(
            fs::read_to_string(&manifest_path).unwrap(),
            original_graph
        );
    }

    #[test]
    fn workspace_source_revision_is_stable_for_unchanged_content() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs/nested")).unwrap();
        fs::write(root.path().join("docs/z.md"), "z\n").unwrap();
        fs::write(root.path().join("docs/a.md"), "a\n").unwrap();
        fs::write(root.path().join("docs/nested/b.md"), "b\n").unwrap();

        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        for _ in 0..10 {
            assert_eq!(
                workspace_source_revision_for_root(root.path()).unwrap(),
                revision
            );
        }
    }

    #[test]
    fn workspace_source_rejects_an_external_change_before_commit_without_overwriting_it() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/concept.md"), "accepted\n").unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        fs::write(root.path().join("docs/concept.md"), "external\n").unwrap();

        let error = commit_workspace_source_changes_to_disk(
            root.path(),
            &WorkspaceSourceChanges {
                graph: None,
                expected_revision: Some(revision),
                create_only: false,
                documents: vec![WorkspaceSourceTextChange {
                    path: "docs/concept.md".to_owned(),
                    content: Some("local\n".to_owned()),
                    create_only: false,
                }],
                assets: vec![],
                companion_metadata: vec![],
            },
        )
        .unwrap_err();

        assert!(error.contains("changed externally"));
        assert_eq!(
            fs::read_to_string(root.path().join("docs/concept.md")).unwrap(),
            "external\n"
        );
    }

    #[test]
    fn workspace_source_detects_an_external_change_after_preparation() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join("docs/concept.md"), "accepted\n").unwrap();
        let revision = workspace_source_revision_for_root(root.path()).unwrap();
        let prepared = prepare_workspace_source_change(
            root.path(),
            "docs/concept.md",
            Some(b"local\n".to_vec()),
        )
        .unwrap();
        fs::write(root.path().join("docs/concept.md"), "external\n").unwrap();

        let files = workspace_source_fingerprints(root.path()).unwrap();
        let error = verify_workspace_source_fingerprints(&files, Some(&revision)).unwrap_err();

        assert!(error.contains("changed externally"));
        assert_eq!(prepared.previous_content, Some(b"accepted\n".to_vec()));
        assert_eq!(
            fs::read_to_string(root.path().join("docs/concept.md")).unwrap(),
            "external\n"
        );
    }

    #[test]
    fn regular_commit_creates_complete_concept_when_new_documents_are_create_only() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let root = tempfile::tempdir().unwrap();
        let original_graph = fs::read_to_string(fixture.join(MANIFEST_PATH)).unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        fs::write(root.path().join(MANIFEST_PATH), &original_graph).unwrap();

        let mut changed_graph: serde_json::Value = serde_json::from_str(&original_graph).unwrap();
        changed_graph["graph"]["points"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "id": "new-concept",
                "data": {
                    "label": "New concept",
                    "document": "docs/points/new-concept",
                    "format": "markdown"
                }
            }));
        let changed_graph = serde_json::to_string_pretty(&changed_graph).unwrap();
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "graph": changed_graph,
            "documents": [
                {
                    "path": "docs/points/new-concept/index.html",
                    "content": "<article>New concept</article>\n",
                    "createOnly": true
                },
                {
                    "path": "docs/points/new-concept/document.md",
                    "content": "# New concept\n",
                    "createOnly": true
                }
            ]
        }))
        .unwrap();

        commit_workspace_source_changes_to_disk(root.path(), &changes).unwrap();

        assert_eq!(
            fs::read_to_string(root.path().join(MANIFEST_PATH)).unwrap(),
            changed_graph
        );
        assert_eq!(
            fs::read_to_string(root.path().join("docs/points/new-concept/index.html")).unwrap(),
            "<article>New concept</article>\n"
        );
        assert_eq!(
            fs::read_to_string(root.path().join("docs/points/new-concept/document.md")).unwrap(),
            "# New concept\n"
        );
    }

    #[test]
    fn create_only_text_change_cannot_delete() {
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "documents": [{
                "path": "docs/points/a/document.md",
                "content": null,
                "createOnly": true
            }]
        }))
        .unwrap();

        let error = validate_workspace_source_changes(&changes).unwrap_err();

        assert!(error.contains("cannot delete"));
    }

    #[test]
    fn create_only_commit_initializes_complete_concept_and_reopens_through_source_readers() {
        let graph = r#"{
  "schema": "derivon.workspace/v1",
  "document": { "title": "One concept", "description": "Complete workspace" },
  "graph": {
    "points": [
      { "id": "A", "data": { "label": "A", "document": "docs/points/a", "format": "markdown" } }
    ],
    "hyperedges": []
  }
}
"#
        .to_owned();
        let rendered = "<article>Concept A</article>\n".to_owned();
        let document = "# Concept A\n".to_owned();
        let root = tempfile::tempdir().unwrap();

        commit_workspace_source_changes_to_disk(
            root.path(),
            &WorkspaceSourceChanges {
                graph: Some(graph.clone()),
                expected_revision: None,
                create_only: true,
                documents: vec![
                    WorkspaceSourceTextChange {
                        path: "docs/points/a/index.html".to_owned(),
                        content: Some(rendered.clone()),
                        create_only: false,
                    },
                    WorkspaceSourceTextChange {
                        path: "docs/points/a/document.md".to_owned(),
                        content: Some(document.clone()),
                        create_only: false,
                    },
                ],
                assets: vec![],
                companion_metadata: vec![],
            },
        )
        .unwrap();

        assert_eq!(
            read_workspace_source_text(root.path(), MANIFEST_PATH).unwrap(),
            graph
        );
        assert_eq!(
            read_workspace_source_text(root.path(), "docs/points/a/index.html").unwrap(),
            rendered
        );
        assert_eq!(
            read_workspace_source_text(root.path(), "docs/points/a/document.md").unwrap(),
            document
        );
    }

    #[test]
    fn create_only_commit_refuses_to_overwrite_existing_manifest() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".derivon")).unwrap();
        fs::write(root.path().join(MANIFEST_PATH), "existing manifest\n").unwrap();

        let error = commit_workspace_source_changes_to_disk(
            root.path(),
            &WorkspaceSourceChanges {
                graph: Some(
                    fs::read_to_string(
                        Path::new(env!("CARGO_MANIFEST_DIR"))
                            .join("tests/fixtures/complete-workspace")
                            .join(MANIFEST_PATH),
                    )
                    .unwrap(),
                ),
                expected_revision: None,
                create_only: true,
                documents: vec![],
                assets: vec![],
                companion_metadata: vec![],
            },
        )
        .unwrap_err();

        assert!(error.contains("already exists"));
        assert_eq!(
            fs::read_to_string(root.path().join(MANIFEST_PATH)).unwrap(),
            "existing manifest\n"
        );
    }

    #[test]
    fn create_only_collision_preserves_existing_document_and_removes_attempt_files() {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/complete-workspace");
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs/points/a")).unwrap();
        fs::write(
            root.path().join("docs/points/a/document.md"),
            "existing document\n",
        )
        .unwrap();

        let error = commit_workspace_source_changes_to_disk(
            root.path(),
            &WorkspaceSourceChanges {
                graph: Some(fs::read_to_string(fixture.join(MANIFEST_PATH)).unwrap()),
                expected_revision: None,
                create_only: true,
                documents: vec![
                    WorkspaceSourceTextChange {
                        path: "docs/points/a/index.html".to_owned(),
                        content: Some("created by attempt\n".to_owned()),
                        create_only: false,
                    },
                    WorkspaceSourceTextChange {
                        path: "docs/points/a/document.md".to_owned(),
                        content: Some("replacement\n".to_owned()),
                        create_only: false,
                    },
                ],
                assets: vec![],
                companion_metadata: vec![],
            },
        )
        .unwrap_err();

        assert!(error.contains("already exists"));
        assert_eq!(
            fs::read_to_string(root.path().join("docs/points/a/document.md")).unwrap(),
            "existing document\n"
        );
        assert!(!root.path().join(MANIFEST_PATH).exists());
        assert!(!root.path().join("docs/points/a/index.html").exists());
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

    /** A manifest claiming `docs/concept-a` and `docs/concept-b`, for inventory ownership. */
    fn write_two_object_manifest(root: &Path) {
        fs::create_dir_all(root.join(".derivon")).unwrap();
        fs::write(root.join(MANIFEST_PATH), serde_json::json!({
            "schema": "derivon.workspace/v1",
            "document": { "title": "T", "description": "" },
            "graph": {
                "points": [
                    { "id": "c-a", "data": { "label": "A", "document": "docs/concept-a" } },
                    { "id": "c-b", "data": { "label": "B", "document": "docs/concept-b" } }
                ],
                "hyperedges": []
            }
        }).to_string()).unwrap();
    }

    #[test]
    fn owned_file_inventory_lists_every_file_under_an_object_directory() {
        let root = tempfile::tempdir().unwrap();
        write_two_object_manifest(root.path());
        fs::create_dir_all(root.path().join("docs/concept-a/assets/nested")).unwrap();
        fs::create_dir_all(root.path().join("docs/concept-b")).unwrap();
        fs::write(root.path().join("docs/concept-a/document.md"), "# A").unwrap();
        // An asset the document text no longer mentions is exactly what a body scan cannot
        // find, and exactly what has to go with its object.
        fs::write(root.path().join("docs/concept-a/assets/orphan.png"), [1_u8]).unwrap();
        fs::write(root.path().join("docs/concept-a/assets/nested/deep.svg"), [2_u8]).unwrap();
        fs::write(root.path().join("docs/concept-a/notes.scratch"), "x").unwrap();
        fs::write(root.path().join("docs/concept-b/document.md"), "# B").unwrap();

        assert_eq!(
            owned_files_for_directory(root.path(), "docs/concept-a").unwrap(),
            vec![
                "docs/concept-a/assets/nested/deep.svg".to_owned(),
                "docs/concept-a/assets/orphan.png".to_owned(),
                "docs/concept-a/document.md".to_owned(),
                "docs/concept-a/notes.scratch".to_owned(),
            ]
        );
        // An object whose directory is already gone owns nothing; that is an inventory of
        // zero, not a failure to take one.
        fs::remove_dir_all(root.path().join("docs/concept-b")).unwrap();
        assert!(owned_files_for_directory(root.path(), "docs/concept-b")
            .unwrap()
            .is_empty());
    }

    #[test]
    fn owned_file_inventory_refuses_a_directory_no_object_claims() {
        let root = tempfile::tempdir().unwrap();
        write_two_object_manifest(root.path());
        fs::write(root.path().join(".derivon/orientation.json"), "{}").unwrap();
        fs::create_dir_all(root.path().join("docs/unclaimed")).unwrap();
        fs::write(root.path().join("docs/unclaimed/document.md"), "x").unwrap();
        fs::write(root.path().join("loose.md"), "x").unwrap();

        assert!(owned_files_for_directory(root.path(), "../").is_err());
        assert!(owned_files_for_directory(root.path(), "/etc").is_err());
        assert!(owned_files_for_directory(root.path(), ".derivon").is_err());
        assert!(owned_files_for_directory(root.path(), "").is_err());
        assert!(owned_files_for_directory(root.path(), ".").is_err());
        assert!(owned_files_for_directory(root.path(), "loose.md").is_err());
        // A directory holding a plausible object document that no object claims is not one.
        assert!(owned_files_for_directory(root.path(), "docs/unclaimed").is_err());
        assert!(owned_files_for_directory(root.path(), "docs").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn owned_file_inventory_refuses_to_follow_a_symlink_out_of_the_object_directory() {
        let root = tempfile::tempdir().unwrap();
        write_two_object_manifest(root.path());
        fs::create_dir_all(root.path().join("docs/concept-a")).unwrap();
        fs::create_dir_all(root.path().join("docs/concept-b")).unwrap();
        fs::write(root.path().join("docs/concept-b/document.md"), "# B").unwrap();
        std::os::unix::fs::symlink(
            root.path().join("docs/concept-b"),
            root.path().join("docs/concept-a/borrowed"),
        )
        .unwrap();

        let error = owned_files_for_directory(root.path(), "docs/concept-a").unwrap_err();
        assert!(error.contains("symlink"), "{error}");
        assert!(root.path().join("docs/concept-b/document.md").exists());
    }

    #[test]
    fn deleting_an_objects_files_restores_all_of_them_when_one_delete_fails() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs/concept-a/assets")).unwrap();
        fs::write(root.path().join("docs/concept-a/document.md"), "# A\n").unwrap();
        fs::write(root.path().join("docs/concept-a/assets/one.png"), [1_u8, 2]).unwrap();
        fs::write(root.path().join("docs/concept-a/assets/two.png"), [3_u8, 4]).unwrap();
        let prepared = [
            "docs/concept-a/document.md",
            "docs/concept-a/assets/one.png",
            "docs/concept-a/assets/two.png",
        ]
        .map(|path| prepare_workspace_source_change(root.path(), path, None).unwrap());

        let mut deletes = 0;
        let error = apply_prepared_workspace_source_changes(&prepared, |change| {
            deletes += 1;
            write_workspace_source_content(&change.target, None)?;
            if deletes == 3 {
                return Err("simulated third delete failure".to_owned());
            }
            Ok(())
        })
        .unwrap_err();

        assert!(error.contains("simulated third delete failure"));
        assert!(!error.contains("rollback also failed"));
        assert_eq!(
            fs::read_to_string(root.path().join("docs/concept-a/document.md")).unwrap(),
            "# A\n"
        );
        assert_eq!(
            fs::read(root.path().join("docs/concept-a/assets/one.png")).unwrap(),
            vec![1_u8, 2]
        );
        assert_eq!(
            fs::read(root.path().join("docs/concept-a/assets/two.png")).unwrap(),
            vec![3_u8, 4]
        );
    }

    #[test]
    fn a_failed_multi_file_deletion_whose_rollback_also_fails_is_not_reported_as_success() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("docs/concept-a/assets")).unwrap();
        fs::write(root.path().join("docs/concept-a/document.md"), "# A\n").unwrap();
        fs::write(root.path().join("docs/concept-a/assets/one.png"), [1_u8]).unwrap();
        let changes: WorkspaceSourceChanges = serde_json::from_value(serde_json::json!({
            "documents": [{ "path": "docs/concept-a/document.md", "content": null }],
            "assets": [{ "path": "docs/concept-a/assets/one.png", "content": null }]
        }))
        .unwrap();

        // The document is deleted, the asset delete then fails, and by that point neither
        // file can be written back. Both failures are reported and no revision is returned:
        // a partly carried out deletion is never reported as a completed one.
        let mut deletes = 0;
        let result = commit_workspace_source_changes_using(root.path(), &changes, |change| {
            deletes += 1;
            if change.target.ends_with("one.png") {
                fs::remove_dir_all(root.path().join("docs/concept-a")).unwrap();
                fs::write(root.path().join("docs/concept-a"), "no longer a directory").unwrap();
                return Err("simulated asset delete failure".to_owned());
            }
            write_workspace_source_content(&change.target, None)
        });

        assert_eq!(deletes, 2, "both files should have been attempted");
        let error = result.unwrap_err();
        assert!(error.contains("simulated asset delete failure"), "{error}");
        assert!(error.contains("rollback also failed"), "{error}");
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
        assert_eq!(saved.workspace.files.len(), 28);
        // The copy carries the workspace identity: writing a manifest back must not drop the
        // key learner records are stored under.
        assert_eq!(
            saved.workspace.manifest.id,
            serde_json::json!("complete-workspace")
        );

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
        assert_eq!(snapshot.workspace.files.len(), 28);
        assert!(snapshot
            .workspace
            .files
            .contains_key("docs/points/a/document.md"));
        // Every object owns a Markdown source and the page rendered from it.
        assert!(snapshot
            .workspace
            .files
            .contains_key("docs/points/y/index.html"));
        assert!(snapshot
            .workspace
            .files
            .contains_key("docs/points/y/document.md"));

        assert_eq!(manifest.schema, "derivon.workspace/v1");
        assert_eq!(
            manifest.graph.points[0].data["tags"],
            serde_json::json!(["given"])
        );

        let manifest_only = read_snapshot(&root, false).unwrap();
        assert!(manifest_only.workspace.files.is_empty());
        assert_eq!(manifest_only.revision, snapshot.revision);
    }
}
