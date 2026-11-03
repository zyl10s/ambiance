use tauri::{Manager, WindowEvent};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

#[tauri::command]
fn set_start_hidden(app: tauri::AppHandle, hidden: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window unavailable")?;
    if hidden { window.hide().map_err(|e| e.to_string())?; }
    else { window.show().map_err(|e| e.to_string())?; }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![set_start_hidden])
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
                api.prevent_close();
                let _=window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Ambiance");
}
