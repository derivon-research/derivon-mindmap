//! Learner records on disk: the application data directory, the workspace id as the key, and
//! the two files the protocols specify. The shape is fixed by
//! `docs/learner-records.md`; the record protocols themselves are parsed and validated on the
//! TypeScript side, which is why this module moves bytes and never interprets them.
//!
//! A write is compare-and-swap on the file: the caller passes the version it read, and a
//! mismatched version refuses before anything is replaced. The replacement itself is the same
//! temporary-sibling-and-rename the workspace uses, so a reader sees the whole previous file
//! or the whole new one and never a prefix.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::workspace::replace_file_atomically;

const LEARNER_RECORDS_DIR: &str = "learner-records";
const STATE_FILE: &str = "state.json";
const ROUTES_FILE: &str = "routes.json";
const WORKSPACE_ID_MAX_LENGTH: usize = 64;

/// What one read found: the file's text and the version a later write has to carry, or two
/// `None`s for a record that is not there. An absent record is not an error.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnerRecordFile {
    pub text: Option<String>,
    pub version: Option<String>,
}

fn record_file_name(file: &str) -> Result<&'static str, String> {
    match file {
        "state" => Ok(STATE_FILE),
        "routes" => Ok(ROUTES_FILE),
        other => Err(format!(
            "unknown learner record file `{other}`; expected `state` or `routes`"
        )),
    }
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

fn learner_record_directory(root: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    validate_workspace_id(workspace_id)?;
    Ok(root.join(LEARNER_RECORDS_DIR).join(workspace_id))
}

fn digest_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Read one record file under `root`, which is the application data directory.
pub fn read_learner_record_file(
    root: &Path,
    workspace_id: &str,
    file: &str,
) -> Result<LearnerRecordFile, String> {
    let target = learner_record_directory(root, workspace_id)?.join(record_file_name(file)?);
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
    file: &str,
    text: &str,
    expected_version: Option<&str>,
) -> Result<String, String> {
    let directory = learner_record_directory(root, workspace_id)?;
    let target = directory.join(record_file_name(file)?);
    let current = match fs::read(&target) {
        Ok(bytes) => Some(digest_hex(&bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("cannot read {} before write: {error}", target.display())),
    };
    if current.as_deref() != expected_version {
        return Err(format!(
            "{} changed since it was read; re-read the learner record before writing",
            target.display()
        ));
    }
    fs::create_dir_all(&directory)
        .map_err(|error| format!("cannot create {}: {error}", directory.display()))?;
    replace_file_atomically(&target, text.as_bytes())?;
    Ok(digest_hex(text.as_bytes()))
}

#[tauri::command]
pub async fn read_learner_record(
    app: AppHandle,
    workspace_id: String,
    file: String,
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
    file: String,
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

    fn root() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn a_missing_record_reads_as_missing_and_creates_nothing() {
        let root = root();
        let read = read_learner_record_file(root.path(), "math-reforged", "state").unwrap();
        assert_eq!(read.text, None);
        assert_eq!(read.version, None);
        assert!(!root.path().join(LEARNER_RECORDS_DIR).exists());
    }

    #[test]
    fn a_write_creates_the_workspace_directory_and_reads_back() {
        let root = root();
        let version =
            write_learner_record_file(root.path(), "math-reforged", "routes", "{}\n", None).unwrap();
        assert_eq!(version.len(), 64);
        let read = read_learner_record_file(root.path(), "math-reforged", "routes").unwrap();
        assert_eq!(read.text.as_deref(), Some("{}\n"));
        assert_eq!(read.version.as_deref(), Some(version.as_str()));
        assert!(root
            .path()
            .join("learner-records/math-reforged/routes.json")
            .is_file());
    }

    #[test]
    fn the_two_files_are_read_and_replaced_independently() {
        let root = root();
        write_learner_record_file(root.path(), "w", "state", "state\n", None).unwrap();
        write_learner_record_file(root.path(), "w", "routes", "routes\n", None).unwrap();
        fs::remove_file(root.path().join("learner-records/w/state.json")).unwrap();
        let routes = read_learner_record_file(root.path(), "w", "routes").unwrap();
        assert_eq!(routes.text.as_deref(), Some("routes\n"));
        assert_eq!(read_learner_record_file(root.path(), "w", "state").unwrap().text, None);
    }

    #[test]
    fn a_write_whose_precondition_no_longer_holds_refuses_and_changes_nothing() {
        let root = root();
        write_learner_record_file(root.path(), "w", "state", "first\n", None).unwrap();
        let error = write_learner_record_file(root.path(), "w", "state", "second\n", None).unwrap_err();
        assert!(error.contains("changed since it was read"), "{error}");
        let read = read_learner_record_file(root.path(), "w", "state").unwrap();
        assert_eq!(read.text.as_deref(), Some("first\n"));
    }

    #[test]
    fn a_write_that_carries_the_version_it_read_succeeds() {
        let root = root();
        let first = write_learner_record_file(root.path(), "w", "state", "first\n", None).unwrap();
        let second =
            write_learner_record_file(root.path(), "w", "state", "second\n", Some(&first)).unwrap();
        assert_ne!(first, second);
        assert_eq!(read_learner_record_file(root.path(), "w", "state").unwrap().text.as_deref(), Some("second\n"));
    }

    #[test]
    fn an_id_that_could_escape_the_records_directory_is_refused() {
        let root = root();
        for id in ["../escape", "a/b", "/absolute", "", "UPPER", "con", "lpt3", "a..b", "a b"] {
            assert!(
                write_learner_record_file(root.path(), id, "state", "{}\n", None).is_err(),
                "`{id}` should be refused"
            );
            assert!(read_learner_record_file(root.path(), id, "state").is_err(), "`{id}` should be refused");
        }
        assert!(!root.path().join(LEARNER_RECORDS_DIR).exists());
    }

    #[test]
    fn only_the_two_record_files_have_names() {
        let root = root();
        assert!(read_learner_record_file(root.path(), "w", "orientation").is_err());
        assert!(write_learner_record_file(root.path(), "w", "extra", "x", None).is_err());
    }
}
