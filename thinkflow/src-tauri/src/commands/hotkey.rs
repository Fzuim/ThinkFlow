use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyPayload {
    pub action: String,
}

/// Register global shortcuts on app startup.
/// CmdOrCtrl+Shift+T → quick-capture
/// CmdOrCtrl+Shift+F → focus-mode
pub fn register_global_shortcuts(app_handle: &AppHandle) {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

        let result = app_handle.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["CommandOrControl+Shift+T", "CommandOrControl+Shift+F"])
                .expect("failed to initialize global shortcut builder")
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let action = if shortcut.matches(Modifiers::SUPER, Code::KeyT)
                            || shortcut.matches(Modifiers::CONTROL, Code::KeyT)
                        {
                            "quick-capture"
                        } else if shortcut.matches(Modifiers::SUPER, Code::KeyF)
                            || shortcut.matches(Modifiers::CONTROL, Code::KeyF)
                        {
                            "focus-mode"
                        } else {
                            return;
                        };
                        let _ = app.emit(
                            "hotkey-triggered",
                            HotkeyPayload {
                                action: action.to_string(),
                            },
                        );
                        log::info!("Global shortcut triggered: {}", action);
                    }
                })
                .build(),
        );

        match result {
            Ok(_) => {
                log::info!("Global shortcuts registered: CmdOrCtrl+Shift+T, CmdOrCtrl+Shift+F");
            }
            Err(e) => {
                log::warn!("Failed to register global shortcuts: {}", e);
            }
        }
    }
}
