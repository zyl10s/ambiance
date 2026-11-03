use tauri::{Manager, WindowEvent, WebviewUrl, WebviewWindowBuilder, LogicalPosition, LogicalSize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

#[tauri::command]
fn list_displays(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let main = app.get_webview_window("main").ok_or("Main window unavailable")?;
    let monitors = main.available_monitors().map_err(|e|e.to_string())?;
    Ok(monitors.iter().enumerate().map(|(i,m)| format!("{} ({}×{})",m.name().map(String::as_str).unwrap_or("Display"),m.size().width,m.size().height)).enumerate().map(|(i,s)|format!("{} {}",i+1,s)).collect())
}

#[tauri::command]
fn open_focus_shield(app: tauri::AppHandle, index: usize) -> Result<(), String> {
    let main = app.get_webview_window("main").ok_or("Main window unavailable")?;
    let monitors = main.available_monitors().map_err(|e|e.to_string())?;
    let target = monitors.get(index).ok_or("Selected display is unavailable")?;
    if monitors.len() < 2 { return Err("Connect a second display to use the screen shield".into()); }
    let main_monitor=main.current_monitor().map_err(|e|e.to_string())?;
    if let Some(current)=main_monitor {
        if current.position()==target.position() { return Err("Choose a display other than the one containing Ambiance".into()); }
    }
    if let Some(existing)=app.get_webview_window("focus-shield"){let _=existing.close();}
    let scale=target.scale_factor();
    let position=target.position();
    let size=target.size();
    WebviewWindowBuilder::new(&app,"focus-shield",WebviewUrl::App("focus.html".into()))
        .title("Ambiance Focus Shield")
        .decorations(false)
        .always_on_top(true)
        .position(position.x as f64/scale,position.y as f64/scale)
        .inner_size(size.width as f64/scale,size.height as f64/scale)
        .build().map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_focus_shield(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window)=app.get_webview_window("focus-shield"){window.close().map_err(|e|e.to_string())?;}
    Ok(())
}

#[tauri::command]
fn open_windows_notifications_settings() -> Result<(), String> {
    #[cfg(target_os="windows")]
    {
        std::process::Command::new("cmd").args(["/C","start","","ms-settings:notifications"]).spawn().map_err(|e|e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os="windows"))]
    { Err("Available on Windows only".into()) }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![list_displays,open_focus_shield,close_focus_shield,open_windows_notifications_settings])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Ambiance", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide Ambiance", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
            let mut tray = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "show" => { if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();} }
                    "hide" => { if let Some(w)=app.get_webview_window("main"){let _=w.hide();} }
                    "quit" => app.exit(0),
                    _ => {}
                }
            }).on_tray_icon_event(|tray,event| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                    if let Some(w)=tray.app_handle().get_webview_window("main"){let _=w.show();let _=w.set_focus();}
                }
            }).build(app)?;
            let window=app.get_webview_window("main").expect("main window");
            let hidden=std::fs::read_to_string(app.path().app_config_dir()?.join("start-hidden"))
                .map(|v|v.trim()=="true").unwrap_or(false);
            if hidden { let _=window.hide(); }
            Ok(())
        })
        .on_window_event(|window,event| {
            if let WindowEvent::CloseRequested { api, .. }=event {
                if window.label()=="main" { api.prevent_close(); let _=window.hide(); }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Ambiance");
}
