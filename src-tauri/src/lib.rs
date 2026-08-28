mod crash_report;
#[cfg(all(debug_assertions, desktop))]
mod desktop_debug;
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
    #[cfg(all(debug_assertions, desktop, feature = "debug-tools"))]
    let trace_guard = desktop_debug::start_performance_trace();

    let builder = tauri::Builder::default();
    #[cfg(all(debug_assertions, desktop))]
    let builder = builder
        .menu(desktop_debug::menu)
        .on_menu_event(desktop_debug::handle_menu_event);

    let app = builder
        .setup(|app| {
            crash_report::install_panic_hook(app.handle())?;
            #[cfg(all(debug_assertions, desktop))]
            desktop_debug::open_on_startup(app)?;
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
        .build(tauri::generate_context!())
        .expect("error while building Derivon");

    #[cfg(all(debug_assertions, desktop, feature = "debug-tools"))]
    {
        let mut trace_guard = trace_guard;
        app.run(move |_app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                drop(trace_guard.take());
            }
        });
    }
    #[cfg(not(all(debug_assertions, desktop, feature = "debug-tools")))]
    app.run(|_app, _event| {});
}
