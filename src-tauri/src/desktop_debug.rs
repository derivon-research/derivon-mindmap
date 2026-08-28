use std::ffi::OsString;
#[cfg(feature = "debug-tools")]
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{
    menu::{Menu, MenuItemBuilder, Submenu},
    App, AppHandle, Manager, Runtime,
};

const OPEN_DEVTOOLS_MENU_ID: &str = "open-developer-tools";
const DEBUG_FLAG: &str = "--debug";

#[cfg(feature = "debug-tools")]
pub fn start_performance_trace() -> Option<tracing_chrome::FlushGuard> {
    if !debug_requested(std::env::args_os()) {
        return None;
    }

    let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/perf");
    if let Err(error) = fs::create_dir_all(&directory) {
        eprintln!(
            "cannot create performance trace directory {}: {error}",
            directory.display()
        );
        return None;
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());
    let path = directory.join(format!(
        "derivon-native-{timestamp}-{}.json",
        std::process::id()
    ));
    let file = match fs::File::create(&path) {
        Ok(file) => file,
        Err(error) => {
            eprintln!(
                "cannot create performance trace {}: {error}",
                path.display()
            );
            return None;
        }
    };
    let (layer, guard) = tracing_chrome::ChromeLayerBuilder::new()
        .writer(file)
        .include_args(true)
        .build();
    use tracing_subscriber::prelude::*;
    let performance_spans = tracing_subscriber::filter::filter_fn(|metadata| {
        metadata.is_span()
            && (metadata.target().starts_with("derivon_app")
                || metadata.target().starts_with("tauri"))
    });
    tracing_subscriber::registry()
        .with(layer.with_filter(performance_spans))
        .init();
    eprintln!(
        "recording native performance trace; quit Derivon to finalize {}",
        path.display()
    );
    Some(guard)
}

pub fn menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let open_devtools = MenuItemBuilder::with_id(OPEN_DEVTOOLS_MENU_ID, "Open Developer Tools")
        .accelerator("CmdOrCtrl+Shift+KeyI")
        .build(app)?;
    let develop = Submenu::with_items(app, "Develop", true, &[&open_devtools])?;
    menu.append(&develop)?;
    Ok(menu)
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == OPEN_DEVTOOLS_MENU_ID {
        if let Some(window) = app.get_webview_window("main") {
            window.open_devtools();
        }
    }
}

pub fn open_on_startup(app: &App) -> tauri::Result<()> {
    if debug_requested(std::env::args_os()) {
        app.get_webview_window("main")
            .ok_or_else(|| tauri::Error::AssetNotFound("main webview window".into()))?
            .open_devtools();
    }
    Ok(())
}

fn debug_requested(args: impl IntoIterator<Item = OsString>) -> bool {
    args.into_iter().any(|argument| argument == DEBUG_FLAG)
}

#[cfg(test)]
mod tests {
    use super::debug_requested;
    use std::ffi::OsString;

    #[test]
    fn recognizes_explicit_debug_flag() {
        assert!(debug_requested([
            OsString::from("derivon-app"),
            OsString::from("--debug"),
        ]));
    }

    #[test]
    fn regular_development_does_not_open_devtools_automatically() {
        assert!(!debug_requested([OsString::from("derivon-app")]));
    }
}
