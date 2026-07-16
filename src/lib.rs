// MarkdownForge Tauri 后端 · 主入口
// 用 Tauri v2 · 支持 macOS / Windows / Linux

use tauri::Manager;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::io::Write;

fn write_debug(msg: &str) {
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true).append(true)
        .open("/tmp/mf-debug.log")
    {
        let _ = writeln!(f, "{}", msg);
    }
}

#[tauri::command]
fn debug_log(msg: String) {
    write_debug(&format!("[FRONTEND] {}", msg));
}

#[tauri::command]
async fn save_blob_base64(
    app: tauri::AppHandle,
    default_name: String,
    filters: Vec<(String, Vec<String>)>,
    b64_data: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::sync::mpsc;
    use std::path::PathBuf;

    write_debug(&format!("[RUST] save_blob_base64 called: name={}, b64_len={}", default_name, b64_data.len()));

    let (tx, rx) = mpsc::channel::<Option<PathBuf>>();
    let mut builder = app.dialog().file().set_file_name(&default_name);
    for (name, exts) in filters {
        let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        builder = builder.add_filter(&name, &refs);
    }
    builder.save_file(move |path| {
        let _ = tx.send(path.map(|p| p.into_path().unwrap_or_default()));
    });

    let path = rx.recv().map_err(|e| {
        write_debug(&format!("[RUST] recv error: {}", e));
        e.to_string()
    })?;
    match path {
        Some(p) => {
            write_debug(&format!("[RUST] user picked path: {}", p.display()));
            let bytes = B64.decode(b64_data).map_err(|e| {
                write_debug(&format!("[RUST] base64 decode error: {}", e));
                e.to_string()
            })?;
            std::fs::write(&p, bytes).map_err(|e| {
                write_debug(&format!("[RUST] fs::write error: {}", e));
                e.to_string()
            })?;
            write_debug(&format!("[RUST] saved OK to {}", p.display()));
            Ok(Some(p.to_string_lossy().into_owned()))
        }
        None => {
            write_debug("[RUST] user cancelled dialog");
            Ok(None)
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_blob_base64, debug_log])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
                let modifier = if cfg!(target_os = "macos") {
                    Modifiers::SUPER | Modifiers::SHIFT
                } else {
                    Modifiers::CONTROL | Modifiers::SHIFT
                };
                let shortcut = Shortcut::new(Some(modifier), Code::KeyM);
                let handle = app.handle().clone();
                app.global_shortcut()
                    .on_shortcut(shortcut, move |_app, _sc, event| {
                        if event.state == ShortcutState::Pressed {
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.unminimize();
                            }
                        }
                    })
                    .ok();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MarkdownForge");
}