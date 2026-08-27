use std::backtrace::Backtrace;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

const CRASH_REPORT_FILE: &str = "last-crash.txt";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedCrashReport {
    details: String,
    path: String,
}

fn report_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_log_dir()
        .map(|directory| directory.join(CRASH_REPORT_FILE))
        .map_err(|error| format!("cannot resolve crash report directory: {error}"))
}

fn write_report(path: &Path, details: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "crash report path has no parent".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("cannot create {}: {error}", parent.display()))?;
    fs::write(path, details).map_err(|error| format!("cannot write {}: {error}", path.display()))
}

fn read_report(path: &Path) -> Result<Option<String>, String> {
    match fs::read_to_string(path) {
        Ok(details) => Ok(Some(details)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("cannot read {}: {error}", path.display())),
    }
}

fn clear_report(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("cannot remove {}: {error}", path.display())),
    }
}

pub fn install_panic_hook<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let path = report_path(app)?;
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis().to_string())
            .unwrap_or_else(|_| "unknown".to_owned());
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|value| (*value).to_owned())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "non-string panic payload".to_owned());
        let location = info
            .location()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_owned());
        let details = format!(
            "来源: Rust panic\nUnix time (ms): {timestamp}\n位置: {location}\n\nPanic: {message}\n\nBacktrace:\n{}\n",
            Backtrace::force_capture()
        );
        let _ = write_report(&path, &details);
        previous(info);
    }));
    Ok(())
}

#[tauri::command]
pub fn read_crash_report<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<PersistedCrashReport>, String> {
    let path = report_path(&app)?;
    Ok(read_report(&path)?.map(|details| PersistedCrashReport {
        details,
        path: path.to_string_lossy().into_owned(),
    }))
}

#[tauri::command]
pub fn clear_crash_report<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    clear_report(&report_path(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_reads_and_clears_a_crash_report() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(CRASH_REPORT_FILE);
        write_report(&path, "panic details").unwrap();
        assert_eq!(
            read_report(&path).unwrap().as_deref(),
            Some("panic details")
        );
        clear_report(&path).unwrap();
        assert_eq!(read_report(&path).unwrap(), None);
        clear_report(&path).unwrap();
    }
}
