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
        .invoke_handler(tauri::generate_handler![
            solve_route,
            workspace::choose_workspace,
            workspace::read_workspace,
            workspace::workspace_revision,
            workspace::read_workspace_file,
            workspace::write_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Derivon");
}
