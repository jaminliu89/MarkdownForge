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


#[tauri::command]
fn smoketest_save_png(b64_data: String, w: u32, h: u32, expected_h: u32) -> Result<(), String> {
    write_debug(&format!("[SMOKE][RUST] save_png w={} h={} expected_h={} b64_len={}", w, h, expected_h, b64_data.len()));
    let bytes = B64.decode(b64_data).map_err(|e| e.to_string())?;
    std::fs::write("/tmp/mfsmoke.png", bytes).map_err(|e| e.to_string())?;
    write_debug("[SMOKE][RUST] wrote /tmp/mfsmoke.png");
    Ok(())
}

#[tauri::command]
fn smoketest_done(app: tauri::AppHandle) {
    write_debug("[SMOKE][RUST] done, exiting");
    app.exit(0);
}

#[tauri::command]
fn e2e_write_result(json: String) -> Result<(), String> {
    std::fs::write("/tmp/mf-e2e.json", json).map_err(|e| e.to_string())
}

#[tauri::command]
fn e2e_done(app: tauri::AppHandle) {
    write_debug("[E2E][RUST] done, exiting");
    app.exit(0);
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    // 限制单文件 5MB，防止误拖大文件把内存打爆
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err(format!("文件超过 5MB: {} ({} bytes)", path, meta.len()));
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_blob_base64, debug_log, smoketest_save_png, smoketest_done, read_text_file, e2e_write_result, e2e_done])
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
            // Smoketest 触发
            if std::env::var("MF_SMOKETEST").ok().as_deref() == Some("1") {
                write_debug("[SMOKE][RUST] MF_SMOKETEST=1, will eval trigger");
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    // 等 webview ready
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.eval("window.__mfSmoketest && window.__mfSmoketest();");
                        write_debug("[SMOKE][RUST] eval dispatched");
                    } else {
                        write_debug("[SMOKE][RUST] no main window!");
                    }
                });
            }
            // E2E 触发（覆盖 v1.0.3 所有新功能）
            if std::env::var("MF_E2E").ok().as_deref() == Some("1") {
                write_debug("[E2E][RUST] MF_E2E=1, will eval trigger");
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.eval("window.__mfE2E && window.__mfE2E();");
                        write_debug("[E2E][RUST] eval dispatched");
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MarkdownForge");
}