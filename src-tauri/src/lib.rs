mod win_grid;
mod screen_capture;

use tauri::Emitter;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg(desktop)]
use tauri::Manager;

#[cfg(desktop)]
use tauri::{menu::{Menu, MenuItem}, tray::{TrayIconBuilder, TrayIconEvent}};

#[tauri::command]
fn calculate_secure_loyalty(amount: f64) -> u32 {
    // Mission-critical secure business logic: 1 point per 1000 of currency
    (amount / 1000.0).floor() as u32
}

#[tauri::command]
fn calculate_royalty(total_sales: f64, rate: f64) -> f64 {
    // Secure royalty calculation to prevent tampering
    total_sales * rate
}

#[tauri::command]
fn validate_subscription(access_level: String, trial_expires_at: i64) -> bool {
    if access_level == "lifetime" {
        return true;
    }
    
    let now = match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_secs() as i64,
        Err(_) => 0,
    };
        
    trial_expires_at > now
}

#[tauri::command]
fn set_detectable(window: tauri::Window, detectable: bool) -> Result<(), String> {
    // In the frontend, 'detectable' = true means Stealth Mode is ON (100% Undetectable).
    // 1. Exclude window from screen capture (Zoom, Google Meet, Teams, OBS via WDA_EXCLUDEFROMCAPTURE)
    window.set_content_protected(detectable).map_err(|e| e.to_string())?;
    // 2. Hide or restore taskbar icon so the interviewer never sees Voiceflow in the taskbar
    window.set_skip_taskbar(detectable).map_err(|e| e.to_string())?;
    // 3. Keep floating widget levitating smoothly above meeting windows
    if detectable {
        let _ = window.set_always_on_top(true);
    } else {
        let _ = window.set_always_on_top(false);
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn set_ignore_cursor_events(window: tauri::Window, ignore: bool) -> Result<(), String> {
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

#[tauri::command]
fn enter_hud_mode(window: tauri::Window, is_expanded: bool, is_hidden: bool) -> Result<(), String> {
    println!("Voiceflow: Entering HUD mode (expanded: {}, hidden: {})...", is_expanded, is_hidden);

    // 1. Unmaximize first if window is maximized (Windows OS requirement)
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }

    let (target_w, target_h) = if is_hidden {
        (440.0, 70.0)
    } else if is_expanded {
        (660.0, 600.0)
    } else {
        (580.0, 480.0)
    };

    // 2. Set size
    window.set_size(tauri::LogicalSize::new(target_w, target_h)).map_err(|e| e.to_string())?;

    // 3. Position top-center of the active screen
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale = monitor.scale_factor();
        let screen_w = monitor.size().width as f64 / scale;
        let pos_x = ((screen_w - target_w) / 2.0).max(0.0);
        let pos_y = 35.0; // 35px from top
        let _ = window.set_position(tauri::LogicalPosition::new(pos_x, pos_y));
    } else {
        let _ = window.center();
    }

    // 4. Always on top, skip taskbar, and stealth exclude from screen capture
    let _ = window.set_always_on_top(true);
    let _ = window.set_skip_taskbar(true);
    let _ = window.set_content_protected(true);

    Ok(())
}

#[tauri::command]
fn exit_hud_mode(window: tauri::Window) -> Result<(), String> {
    println!("Voiceflow: Exiting HUD mode, restoring dashboard...");
    let _ = window.set_always_on_top(false);
    let _ = window.set_skip_taskbar(false);
    let _ = window.set_content_protected(false);

    window.set_size(tauri::LogicalSize::new(1024.0, 768.0)).map_err(|e| e.to_string())?;
    let _ = window.center();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn get_machine_guid() -> String {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("reg");
        cmd.args(["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                for line in text.lines() {
                    if line.contains("MachineGuid") {
                        if let Some(guid) = line.split_whitespace().last() {
                            return guid.to_string();
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("IOPlatformUUID") {
                    if let Some(uuid) = line.split('"').nth(3) {
                        return uuid.to_string();
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        if let Ok(id) = std::fs::read_to_string("/var/lib/dbus/machine-id") {
            let trimmed = id.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    String::new()
}

#[tauri::command]
async fn start_oauth_listener(app: tauri::AppHandle) -> Result<u16, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let app_handle = app.clone();
    std::thread::spawn(move || {
        // Accept one connection from the browser callback
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buffer = [0u8; 16384];
            if let Ok(n) = stream.read(&mut buffer) {
                let req = String::from_utf8_lossy(&buffer[..n]);
                // Parse GET /callback?token=... HTTP/1.1
                if let Some(pos) = req.find("token=") {
                    let after = &req[pos + 6..];
                    let raw_token = after.split_whitespace().next().unwrap_or("").split('&').next().unwrap_or("");
                    
                    // Percent-decode
                    let mut decoded = Vec::new();
                    let bytes = raw_token.as_bytes();
                    let mut i = 0;
                    while i < bytes.len() {
                        if bytes[i] == b'%' && i + 2 < bytes.len() {
                            if let Ok(val) = u8::from_str_radix(std::str::from_utf8(&bytes[i+1..=i+2]).unwrap_or(""), 16) {
                                decoded.push(val);
                                i += 3;
                                continue;
                            }
                        }
                        decoded.push(bytes[i]);
                        i += 1;
                    }
                    let token_str = String::from_utf8_lossy(&decoded).to_string();
                    let _ = app_handle.emit("desktop-auth-callback", token_str);
                }
            }

            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Voiceflow - Signed In</title><style>body{background:#09090b;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:36px 32px;max-width:400px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5)}.icon{width:52px;height:52px;background:#ea580c;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;font-weight:bold}h2{color:#fff;margin:0 0 8px;font-size:20px}p{color:#a1a1aa;margin:0;font-size:14px;line-height:1.5}</style></head><body><div class=\"card\"><div class=\"icon\">&#10003;</div><h2>Successfully Signed In!</h2><p>You have authenticated with Google. You can now close this tab and return to Voiceflow Desktop.</p></div><script>setTimeout(function(){window.close();},2000);</script></body></html>";
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        }
    });

    Ok(port)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.args(["/c", "start", "", &url]);
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        let _ = cmd.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "android")]
  let _ = rustls::crypto::ring::default_provider().install_default();

  println!("Zeneva: Initializing Builder...");
  
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default()
      .level(log::LevelFilter::Info)
      .build())
    .invoke_handler(tauri::generate_handler![
        calculate_secure_loyalty, 
        calculate_royalty, 
        validate_subscription,
        set_detectable,
        set_ignore_cursor_events,
        enter_hud_mode,
        exit_hud_mode,
        get_machine_guid,
        win_grid::list_desktop_windows,
        win_grid::read_desktop_grid,
        screen_capture::capture_screen,
        open_url,
        start_oauth_listener
    ])
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    // .plugin(tauri_plugin_stronghold::Builder::new(|_password| {
    //     "zeneva-secure-key-2024".as_bytes().to_vec()
    // }).build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    use tauri_plugin_global_shortcut::Shortcut;
                    use std::str::FromStr;
                    
                    let toggle = Shortcut::from_str("CommandOrControl+`").unwrap();
                    let ask = Shortcut::from_str("CommandOrControl+Enter").unwrap();
                    let clear = Shortcut::from_str("CommandOrControl+R").unwrap();
                    let session = Shortcut::from_str("CommandOrControl+Shift+\\").unwrap();

                    if shortcut == &toggle {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    } else if shortcut == &ask {
                        app.emit("shortcut-ask", ()).unwrap_or(());
                    } else if shortcut == &clear {
                        app.emit("shortcut-clear", ()).unwrap_or(());
                    } else if shortcut == &session {
                        app.emit("shortcut-session", ()).unwrap_or(());
                    } else {
                        app.emit("shortcut-other", shortcut.to_string()).unwrap_or(());
                    }
                }
            })
            .build(),
    )
    .plugin(tauri_plugin_shell::init());

  // Single-instance: if a second instance is launched, show the existing window
  #[cfg(desktop)]
  {
    use tauri::Manager;
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        println!("Zeneva: Second instance detected — focusing existing window.");
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
  }

  builder
    .setup(|app| {
        println!("Zeneva: Entering setup...");

        #[cfg(desktop)]
        {
            use tauri::Manager;
            // FIX: Explicitly show and focus the main window on startup.
            // This is the primary fix — without this, the window can start hidden.
            if let Some(window) = app.get_webview_window("main") {
                println!("Zeneva: Showing and focusing main window...");
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            } else {
                println!("Zeneva: WARNING — could not find 'main' window in setup!");
            }

            // Build tray menu
            let quit_i = MenuItem::with_id(app, "quit", "Quit Zeneva", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Zeneva Dashboard", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // Build tray icon (non-fatal if icon is missing)
            if let Some(tray_icon) = app.default_window_icon().cloned() {
                println!("Zeneva: Building tray icon...");
                let tray_result = TrayIconBuilder::new()
                    .icon(tray_icon)
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "quit" => {
                                println!("Zeneva: Quit requested from tray.");
                                std::process::exit(0);
                            }
                            "show" => {
                                if let Some(win) = app.get_webview_window("main") {
                                    let _ = win.show();
                                    let _ = win.unminimize();
                                    let _ = win.set_focus();
                                }
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                            let app = tray.app_handle();
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
                            }
                        }
                    })
                    .build(app);

                match tray_result {
                    Ok(_) => println!("Zeneva: Tray icon built successfully."),
                    Err(e) => println!("Zeneva: WARNING — Tray icon failed to build: {:?}", e),
                }
            } else {
                println!("Zeneva: WARNING — No default window icon found, skipping tray.");
            }
        }
        
        #[cfg(desktop)]
        {
            use tauri_plugin_global_shortcut::Shortcut;
            use std::str::FromStr;
            
            let shortcuts = vec![
                "CommandOrControl+`",
                "CommandOrControl+Enter",
                "CommandOrControl+R",
                "CommandOrControl+Shift+\\",
                "CommandOrControl+Up",
                "CommandOrControl+Down",
                "CommandOrControl+Left",
                "CommandOrControl+Right",
                "CommandOrControl+Shift+Up",
                "CommandOrControl+Shift+Down"
            ];
            
            for s in shortcuts {
                if let Ok(shortcut) = Shortcut::from_str(s) {
                    if let Err(e) = app.app_handle().global_shortcut().register(shortcut) {
                        println!("Zeneva: WARNING - Failed to register {}: {:?}", s, e);
                    } else {
                        println!("Zeneva: Global shortcut {} registered.", s);
                    }
                }
            }
        }

        #[cfg(mobile)]
        {
            let _ = app;
        }

        println!("Zeneva: Setup completed successfully.");
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
