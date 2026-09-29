//! Learner records on disk: the application data directory, the workspace id as the key, and
//! the files the protocols specify — `state.json` and one `routes/<route id>.json` per personal
//! route. The shape is fixed by `docs/learner-records.md`; the record protocols themselves are
//! parsed and validated on the TypeScript side, which is why this module moves bytes and never
//! interprets them.
//!
//! A write or a delete is compare-and-swap on one file: the caller passes the version it read,
//! and a mismatched version refuses before anything is replaced. The replacement itself is the
//! same temporary-sibling-and-rename the workspace uses, so a reader sees the whole previous
//! file or the whole new one and never a prefix.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::workspace::replace_file_atomically;

const LEARNER_RECORDS_DIR: &str = "learner-records";
const STATE_FILE: &str = "state.json";
const ROUTES_DIR: &str = "routes";
const WORKSPACE_ID_MAX_LENGTH: usize = 64;
/// The object-id alphabet: lowercase ASCII letters and digits without `0 1 i l o u`.
const ROUTE_ID_ALPHABET: &[u8] = b"23456789abcdefghjkmnpqrstvwxyz";

/// What one read found: the file's text and the version a later write has to carry, or two
/// `None`s for a record that is not there. An absent record is not an error.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnerRecordFile {
    pub text: Option<String>,
    pub version: Option<String>,
}

/// Which record file a read or a write is about: the one `state.json`, or one personal route
/// by its id.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RecordFile {
    State,
    Route { id: String },
}

/// The workspace id's own rule lives in the workspace protocol (`src/workspace/manifest.ts`).
/// This is a second implementation of the safety-critical part, not the normative one: the id
/// becomes a directory name here, so a segment that could escape `learner-records/` must never
/// reach a join. The two writers share one specification, not one implementation (ADR-0009).
fn validate_workspace_id(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    let shape_ok = !value.is_empty()
        && value.len() <= WORKSPACE_ID_MAX_LENGTH
        && bytes.iter().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
        && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
        && bytes.last().is_some_and(u8::is_ascii_alphanumeric);
    let reserved = matches!(value, "con" | "prn" | "aux" | "nul")
        || (1..=9).any(|index| value == format!("com{index}") || value == format!("lpt{index}"));
    if shape_ok && !reserved {
        Ok(())
    } else {
        Err(format!("`{value}` is not a usable workspace id"))
    }
}

/// The route id's rule lives in the route protocol (`src/workspace/route.ts`): `r-` plus six
/// characters of the object-id alphabet. As with the workspace id, this is the safety-critical
/// part again, because the id becomes a file name under `routes/`: no id that passes can name
/// anything outside that directory.
fn validate_route_id(value: &str) -> Result<(), String> {
    let shape_ok = value.len() == 8
        && value.starts_with("r-")
        && value.as_bytes()[2..].iter().all(|byte| ROUTE_ID_ALPHABET.contains(byte));
    if shape_ok {
        Ok(())
    } else {
        Err(format!("`{value}` is not a route id"))
    }
}

fn learner_record_directory(root: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    validate_workspace_id(workspace_id)?;
    Ok(root.join(LEARNER_RECORDS_DIR).join(workspace_id))
}

/// The file a record lives in, and the directory a first write has to create.
fn record_path(root: &Path, workspace_id: &str, file: &RecordFile) -> Result<(PathBuf, PathBuf), String> {
    let directory = learner_record_directory(root, workspace_id)?;
    Ok(match file {
        RecordFile::State => (directory.clone(), directory.join(STATE_FILE)),
        RecordFile::Route { id } => {
            validate_route_id(id)?;
            let routes = directory.join(ROUTES_DIR);
            let target = routes.join(format!("{id}.json"));
            (routes, target)
        }
    })
}

fn digest_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn check_precondition(target: &Path, expected_version: Option<&str>) -> Result<(), String> {
    let current = match fs::read(target) {
        Ok(bytes) => Some(digest_hex(&bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("cannot read {} before write: {error}", target.display())),
    };
    if current.as_deref() == expected_version {
        Ok(())
    } else {
        Err(format!(
            "{} changed since it was read; re-read the learner record before writing",
            target.display()
        ))
    }
}

/// Read one record file under `root`, which is the application data directory.
pub fn read_learner_record_file(
    root: &Path,
    workspace_id: &str,
    file: &RecordFile,
) -> Result<LearnerRecordFile, String> {
    let (_, target) = record_path(root, workspace_id, file)?;
    match fs::read(&target) {
        Ok(bytes) => {
            let text = String::from_utf8(bytes.clone())
                .map_err(|error| format!("cannot read {}: not UTF-8: {error}", target.display()))?;
            Ok(LearnerRecordFile {
                text: Some(text),
                version: Some(digest_hex(&bytes)),
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(LearnerRecordFile { text: None, version: None })
        }
        Err(error) => Err(format!("cannot read {}: {error}", target.display())),
    }
}

/// Replace one record file under `root`. `expected_version` is the version the caller read
/// (`None` when it read an absent record); anything else refuses and leaves the file as it was.
/// The directory is created on first write, because an absent directory is an absent record.
pub fn write_learner_record_file(
    root: &Path,
    workspace_id: &str,
    file: &RecordFile,
    text: &str,
    expected_version: Option<&str>,
) -> Result<String, String> {
    let (directory, target) = record_path(root, workspace_id, file)?;
    check_precondition(&target, expected_version)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("cannot create {}: {error}", directory.display()))?;
    replace_file_atomically(&target, text.as_bytes())?;
    Ok(digest_hex(text.as_bytes()))
}

/// Delete one personal route under `root`. The precondition is the version the caller read,
/// exactly as for a write: a route another writer changed since is left alone.
pub fn delete_learner_route_file(
    root: &Path,
    workspace_id: &str,
    route_id: &str,
    expected_version: &str,
) -> Result<(), String> {
    let file = RecordFile::Route { id: route_id.to_owned() };
    let (_, target) = record_path(root, workspace_id, &file)?;
    check_precondition(&target, Some(expected_version))?;
    fs::remove_file(&target).map_err(|error| format!("cannot delete {}: {error}", target.display()))
}

/// The file names directly under `routes/`, sorted. Which of them are route files is the
/// protocol's rule, applied on the TypeScript side; a subdirectory is not a file and is
/// skipped. A symlink — the directory itself or one of its entries — is refused rather than
/// followed, and a directory that does not exist is an empty listing, not a failure.
pub fn list_learner_route_files(root: &Path, workspace_id: &str) -> Result<Vec<String>, String> {
    let directory = learner_record_directory(root, workspace_id)?.join(ROUTES_DIR);
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(format!("learner route directory {} is a symlink", directory.display()));
        }
        Ok(metadata) if !metadata.is_dir() => {
            return Err(format!("{} is not a directory", directory.display()));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("cannot inspect {}: {error}", directory.display())),
    }
    let entries = fs::read_dir(&directory)
        .map_err(|error| format!("cannot read {}: {error}", directory.display()))?;
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("cannot read learner route entry: {error}"))?;
        let path = entry.path();
        let kind = entry
            .file_type()
            .map_err(|error| format!("cannot inspect {}: {error}", path.display()))?;
        if kind.is_symlink() {
            return Err(format!("learner route directory contains symlink {}", path.display()));
        }
        if kind.is_file() {
            names.push(
                entry
                    .file_name()
                    .into_string()
                    .map_err(|name| format!("learner route file name {name:?} is not UTF-8"))?,
            );
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub async fn read_learner_record(
    app: AppHandle,
    workspace_id: String,
    file: RecordFile,
) -> Result<LearnerRecordFile, String> {
    let root = data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || read_learner_record_file(&root, &workspace_id, &file))
        .await
        .map_err(|error| format!("learner record reader task failed: {error}"))?
}

#[tauri::command]
pub async fn write_learner_record(
    app: AppHandle,
    workspace_id: String,
    file: RecordFile,
    text: String,
    expected_version: Option<String>,
) -> Result<String, String> {
    let root = data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        write_learner_record_file(&root, &workspace_id, &file, &text, expected_version.as_deref())
    })
    .await
    .map_err(|error| format!("learner record writer task failed: {error}"))?
}

#[tauri::command]
pub async fn delete_learner_route(
    app: AppHandle,
    workspace_id: String,
    route_id: String,
    expected_version: String,
) -> Result<(), String> {
    let root = data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        delete_learner_route_file(&root, &workspace_id, &route_id, &expected_version)
    })
    .await
    .map_err(|error| format!("learner route delete task failed: {error}"))?
}

#[tauri::command]
pub async fn list_learner_routes(app: AppHandle, workspace_id: String) -> Result<Vec<String>, String> {
    let root = data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || list_learner_route_files(&root, &workspace_id))
        .await
        .map_err(|error| format!("learner route listing task failed: {error}"))?
}

/// The application data directory. This is deliberately not the configuration directory that
/// holds `models.json` and `auth.json`: learner records are data, and the specification says so.
fn data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("no application data directory: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATE: RecordFile = RecordFile::State;

    fn route(id: &str) -> RecordFile {
        RecordFile::Route { id: id.to_owned() }
    }

    fn root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn a_missing_record_reads_as_missing_and_creates_nothing() {
        let root = root();
        let read = read_learner_record_file(root.path(), "math-reforged", &STATE).unwrap();
        assert_eq!(read.text, None);
        assert_eq!(read.version, None);
        let read = read_learner_record_file(root.path(), "math-reforged", &route("r-k7f3q2")).unwrap();
        assert_eq!(read.text, None);
        assert!(!root.path().join(LEARNER_RECORDS_DIR).exists());
    }

    #[test]
    fn a_write_creates_the_workspace_directory_and_reads_back() {
        let root = root();
        let version =
            write_learner_record_file(root.path(), "math-reforged", &STATE, "{}\n", None).unwrap();
        assert_eq!(version.len(), 64);
        let read = read_learner_record_file(root.path(), "math-reforged", &STATE).unwrap();
        assert_eq!(read.text.as_deref(), Some("{}\n"));
        assert_eq!(read.version.as_deref(), Some(version.as_str()));
        assert!(root.path().join("learner-records/math-reforged/state.json").is_file());
    }

    #[test]
    fn a_route_is_written_to_its_own_file_under_routes() {
        let root = root();
        let version =
            write_learner_record_file(root.path(), "w", &route("r-k7f3q2"), "route\n", None).unwrap();
        assert!(root.path().join("learner-records/w/routes/r-k7f3q2.json").is_file());
        let read = read_learner_record_file(root.path(), "w", &route("r-k7f3q2")).unwrap();
        assert_eq!(read.text.as_deref(), Some("route\n"));
        assert_eq!(read.version.as_deref(), Some(version.as_str()));
    }

    #[test]
    fn every_file_is_read_and_replaced_independently() {
        let root = root();
        write_learner_record_file(root.path(), "w", &STATE, "state\n", None).unwrap();
        write_learner_record_file(root.path(), "w", &route("r-aaaaaa"), "a\n", None).unwrap();
        write_learner_record_file(root.path(), "w", &route("r-bbbbbb"), "b\n", None).unwrap();
        fs::remove_file(root.path().join("learner-records/w/state.json")).unwrap();
        let first = read_learner_record_file(root.path(), "w", &route("r-aaaaaa")).unwrap();
        assert_eq!(first.text.as_deref(), Some("a\n"));
        assert_eq!(read_learner_record_file(root.path(), "w", &STATE).unwrap().text, None);
        write_learner_record_file(root.path(), "w", &route("r-aaaaaa"), "a2\n", first.version.as_deref())
            .unwrap();
        let second = read_learner_record_file(root.path(), "w", &route("r-bbbbbb")).unwrap();
        assert_eq!(second.text.as_deref(), Some("b\n"));
    }

    #[test]
    fn a_write_whose_precondition_no_longer_holds_refuses_and_changes_nothing() {
        let root = root();
        write_learner_record_file(root.path(), "w", &STATE, "first\n", None).unwrap();
        let error = write_learner_record_file(root.path(), "w", &STATE, "second\n", None).unwrap_err();
        assert!(error.contains("changed since it was read"), "{error}");
        let read = read_learner_record_file(root.path(), "w", &STATE).unwrap();
        assert_eq!(read.text.as_deref(), Some("first\n"));
    }

    #[test]
    fn a_route_write_whose_precondition_no_longer_holds_refuses_and_changes_nothing() {
        let root = root();
        let first =
            write_learner_record_file(root.path(), "w", &route("r-k7f3q2"), "first\n", None).unwrap();
        write_learner_record_file(root.path(), "w", &route("r-k7f3q2"), "theirs\n", Some(&first)).unwrap();
        let error = write_learner_record_file(root.path(), "w", &route("r-k7f3q2"), "mine\n", Some(&first))
            .unwrap_err();
        assert!(error.contains("changed since it was read"), "{error}");
        let read = read_learner_record_file(root.path(), "w", &route("r-k7f3q2")).unwrap();
        assert_eq!(read.text.as_deref(), Some("theirs\n"));
        let entries: Vec<_> = fs::read_dir(root.path().join("learner-records/w/routes"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(entries.len(), 1, "no temporary file is left behind: {entries:?}");
    }

    #[test]
    fn a_write_that_carries_the_version_it_read_succeeds() {
        let root = root();
        let first = write_learner_record_file(root.path(), "w", &STATE, "first\n", None).unwrap();
        let second =
            write_learner_record_file(root.path(), "w", &STATE, "second\n", Some(&first)).unwrap();
        assert_ne!(first, second);
        assert_eq!(
            read_learner_record_file(root.path(), "w", &STATE).unwrap().text.as_deref(),
            Some("second\n")
        );
    }

    #[test]
    fn a_route_is_deleted_only_under_the_version_it_was_read_at() {
        let root = root();
        let first =
            write_learner_record_file(root.path(), "w", &route("r-k7f3q2"), "first\n", None).unwrap();
        let second =
            write_learner_record_file(root.path(), "w", &route("r-k7f3q2"), "second\n", Some(&first)).unwrap();
        let error = delete_learner_route_file(root.path(), "w", "r-k7f3q2", &first).unwrap_err();
        assert!(error.contains("changed since it was read"), "{error}");
        assert!(root.path().join("learner-records/w/routes/r-k7f3q2.json").is_file());
        delete_learner_route_file(root.path(), "w", "r-k7f3q2", &second).unwrap();
        assert!(!root.path().join("learner-records/w/routes/r-k7f3q2.json").exists());
        assert!(delete_learner_route_file(root.path(), "w", "r-k7f3q2", &second).is_err());
    }

    #[test]
    fn an_id_that_could_escape_the_records_directory_is_refused() {
        let root = root();
        for id in ["../escape", "a/b", "/absolute", "", "UPPER", "con", "lpt3", "a..b", "a b"] {
            assert!(
                write_learner_record_file(root.path(), id, &STATE, "{}\n", None).is_err(),
                "`{id}` should be refused"
            );
            assert!(read_learner_record_file(root.path(), id, &STATE).is_err(), "`{id}` should be refused");
            assert!(list_learner_route_files(root.path(), id).is_err(), "`{id}` should be refused");
        }
        assert!(!root.path().join(LEARNER_RECORDS_DIR).exists());
    }

    #[test]
    fn a_route_id_that_could_escape_the_routes_directory_is_refused() {
        let root = root();
        for id in [
            "../state", "r-../../x", "r-abc/ef", "r-k7f3q2/..", "/r-k7f3q2", "r-K7F3Q2", "r-k7f3q",
            "r-k7f3q22", "r-k0f3q2", "x-k7f3q2", "", "r-k7f3q2.json", "r-é3q2",
        ] {
            assert!(
                write_learner_record_file(root.path(), "w", &route(id), "{}\n", None).is_err(),
                "`{id}` should be refused"
            );
            assert!(read_learner_record_file(root.path(), "w", &route(id)).is_err(), "`{id}` should be refused");
            assert!(delete_learner_route_file(root.path(), "w", id, "0").is_err(), "`{id}` should be refused");
        }
        assert!(!root.path().join(LEARNER_RECORDS_DIR).exists());
    }

    #[test]
    fn a_missing_routes_directory_lists_as_empty() {
        let root = root();
        assert_eq!(list_learner_route_files(root.path(), "w").unwrap(), Vec::<String>::new());
        write_learner_record_file(root.path(), "w", &STATE, "{}\n", None).unwrap();
        assert_eq!(list_learner_route_files(root.path(), "w").unwrap(), Vec::<String>::new());
    }

    #[test]
    fn the_listing_names_the_direct_files_only() {
        let root = root();
        write_learner_record_file(root.path(), "w", &route("r-bbbbbb"), "b\n", None).unwrap();
        write_learner_record_file(root.path(), "w", &route("r-aaaaaa"), "a\n", None).unwrap();
        let routes = root.path().join("learner-records/w/routes");
        fs::write(routes.join("notes.txt"), "x").unwrap();
        fs::create_dir_all(routes.join("nested")).unwrap();
        fs::write(routes.join("nested/r-cccccc.json"), "c\n").unwrap();
        assert_eq!(
            list_learner_route_files(root.path(), "w").unwrap(),
            vec!["notes.txt", "r-aaaaaa.json", "r-bbbbbb.json"]
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_listing_refuses_a_symlinked_entry_or_directory() {
        let root = root();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("r-cccccc.json"), "c\n").unwrap();
        write_learner_record_file(root.path(), "w", &route("r-aaaaaa"), "a\n", None).unwrap();
        let routes = root.path().join("learner-records/w/routes");
        std::os::unix::fs::symlink(outside.path().join("r-cccccc.json"), routes.join("r-cccccc.json"))
            .unwrap();
        let error = list_learner_route_files(root.path(), "w").unwrap_err();
        assert!(error.contains("symlink"), "{error}");

        fs::remove_dir_all(&routes).unwrap();
        std::os::unix::fs::symlink(outside.path(), &routes).unwrap();
        let error = list_learner_route_files(root.path(), "w").unwrap_err();
        assert!(error.contains("symlink"), "{error}");
    }

    #[test]
    fn a_record_file_is_named_by_kind() {
        let parsed: RecordFile = serde_json::from_str(r#"{"kind":"route","id":"r-k7f3q2"}"#).unwrap();
        assert!(matches!(parsed, RecordFile::Route { ref id } if id == "r-k7f3q2"));
        assert!(matches!(serde_json::from_str(r#"{"kind":"state"}"#).unwrap(), RecordFile::State));
        assert!(serde_json::from_str::<RecordFile>(r#"{"kind":"routes"}"#).is_err());
        assert!(serde_json::from_str::<RecordFile>(r#""state""#).is_err());
    }
}
