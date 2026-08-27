mod crash_report;
mod route;
mod workspace;

#[tauri::command]
async fn solve_route(request: route::RouteRequest) -> Result<route::RouteResponse, String> {
    tauri::async_runtime::spawn_blocking(move || route::solve_route(request))
        .await
        .map_err(|error| format!("route solver task failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            crash_report::install_panic_hook(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crash_report::clear_crash_report,
            crash_report::read_crash_report,
            solve_route,
            workspace::choose_workspace,
            workspace::save_workspace_as,
            workspace::read_workspace,
            workspace::workspace_revision,
            workspace::read_workspace_file,
            workspace::write_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Derivon");
}
