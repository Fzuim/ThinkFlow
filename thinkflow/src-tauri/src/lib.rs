mod agents;
mod commands;
mod db;
mod llm;
mod models;
mod tray;

use db::sqlite::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let db_path = app_dir.join("thinkflow.db");

            // On first launch of a packaged app, copy the pre-initialized seed
            // database so the user starts with a clean, schema-ready file. In
            // dev mode the bundled resource is absent and ensure_schema() runs
            // normally — the developer's own database is never touched.
            if !db_path.exists() {
                if let Ok(seed_path) = app.path().resolve("seed/thinkflow.db", tauri::path::BaseDirectory::Resource) {
                    if seed_path.exists() {
                        std::fs::create_dir_all(&app_dir).ok();
                        let _ = std::fs::copy(&seed_path, &db_path);
                    }
                }
            }

            let database = Database::new(app_dir).expect("failed to initialize database");
            app.manage(database);

            // Global shortcuts disabled
            // commands::hotkey::register_global_shortcuts(app.handle());

            // Set up system tray icon and menu
            tray::create_tray(app)?;

            log::info!("ThinkFlow initialized successfully");
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if cfg!(target_os = "macos") {
                        // Hide to tray instead of closing (macOS convention)
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Task commands
            commands::task::create_task,
            commands::task::append_task_progress,
            commands::task::get_task,
            commands::task::get_all_tasks,
            commands::task::get_tasks_by_status,
            commands::task::get_tasks_by_category,
            commands::task::search_tasks,
            commands::task::update_task,
            commands::task::update_task_status,
            commands::task::delete_task,
            // Goal commands
            commands::task::create_goal,
            commands::task::get_goal,
            commands::task::get_all_goals,
            commands::task::update_goal,
            commands::task::delete_goal,
            // Project commands
            commands::task::create_project,
            commands::task::get_all_projects,
            // LLM commands
            commands::llm::get_llm_config,
            commands::llm::save_llm_config,
            commands::llm::extract_tasks,
            commands::llm::prioritize_tasks,
            commands::llm::daily_brief,
            commands::llm::test_connection,
            commands::llm::list_models,
            commands::llm::extract_memories,
            commands::llm::ask_memory,
            commands::llm::task_assistant,
            commands::llm::task_assistant_stream,
            commands::llm::generate_fable,
            // Memory commands
            commands::memory::get_memories,
            commands::memory::get_memories_by_type,
            commands::memory::search_memories,
            commands::memory::create_memory,
            commands::memory::update_memory,
            commands::memory::delete_memory,
            // Settings commands
            commands::settings::get_setting,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
