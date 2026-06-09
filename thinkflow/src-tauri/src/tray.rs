use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// Build and initialize the system tray icon with menu.
pub fn create_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let handle = app.handle();

    let quick_capture = MenuItem::with_id(handle, "quick-capture", "Quick Capture", true, None::<&str>)?;
    let focus_mode = MenuItem::with_id(handle, "focus-mode", "Focus Mode", true, None::<&str>)?;
    let show_window = MenuItem::with_id(handle, "show-window", "Show Window", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", "Quit", true, None::<&str>)?;

    let menu = MenuBuilder::new(handle)
        .item(&quick_capture)
        .item(&focus_mode)
        .separator()
        .item(&show_window)
        .item(&quit)
        .build()?;

    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("Failed to load tray icon from icons/32x32.png");

    let handle_clone = handle.clone();
    let _tray = TrayIconBuilder::with_id("thinkflow-tray")
        .icon(icon)
        .tooltip("ThinkFlow")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "quick-capture" => {
                let _ = app.emit(
                    "hotkey-triggered",
                    serde_json::json!({ "action": "quick-capture" }),
                );
                // Bring window to front
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "focus-mode" => {
                let _ = app.emit(
                    "hotkey-triggered",
                    serde_json::json!({ "action": "focus-mode" }),
                );
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "show-window" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {
                log::warn!("Unhandled tray menu item: {:?}", event.id);
            }
        })
        .on_tray_icon_event(move |tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // Left click: show/hide main window
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    // Update tray tooltip with pending task count
    update_tray_tooltip(&handle_clone);

    Ok(())
}

/// Update tray tooltip to show today's pending task count.
pub fn update_tray_tooltip<R: Runtime>(app: &AppHandle<R>) {
    // Count pending tasks for today
    let pending_count = count_today_pending_tasks(app);

    let tooltip = if pending_count > 0 {
        format!("ThinkFlow - {} pending today", pending_count)
    } else {
        "ThinkFlow".to_string()
    };

    if let Some(tray) = app.tray_by_id("thinkflow-tray") {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

/// Count tasks that are pending (not done/archived) and have a deadline today
/// or were created today without a deadline (i.e. quick captures).
fn count_today_pending_tasks<R: Runtime>(app: &AppHandle<R>) -> usize {
    use crate::db::sqlite::Database;
    use chrono::Local;

    let today = Local::now().format("%Y-%m-%d").to_string();

    match app.try_state::<Database>() {
        Some(db) => match db.conn.lock() {
            Ok(conn) => {
                let query = "
                    SELECT COUNT(*) FROM tasks
                    WHERE status != 'done' AND status != 'archived'
                    AND (
                        (deadline IS NOT NULL AND deadline <= ?1)
                        OR (deadline IS NULL AND date(created_at) = ?1)
                    )
                ";
                match conn.query_row(query, rusqlite::params![today], |row| row.get::<_, i64>(0)) {
                    Ok(count) => count as usize,
                    Err(e) => {
                        log::warn!("Failed to count pending tasks: {}", e);
                        0
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to lock database for task count: {}", e);
                0
            }
        },
        None => {
            log::warn!("Database state not available for tray tooltip");
            0
        }
    }
}
