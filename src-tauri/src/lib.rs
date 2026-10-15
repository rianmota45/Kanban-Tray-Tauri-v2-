use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    Emitter, Manager, WebviewWindow,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Todo,
    InProgress,
    Done,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
enum TasksDataPayload {
    Array(Vec<Task>),
    Object { tasks: Vec<Task> },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub shortcut: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Space".to_string(),
        }
    }
}

pub struct AppState {
    pub is_pinned: Arc<AtomicBool>,
    pub current_shortcut: Arc<Mutex<String>>,
    pub open_menu_item: Arc<Mutex<Option<MenuItem<tauri::Wry>>>>,
}

// Retorna o caminho absoluto do arquivo tasks.json
pub fn resolve_tasks_path(app: &tauri::AppHandle) -> PathBuf {
    // 1. Se KANBAN_TASKS_PATH estiver definida por variável de ambiente
    if let Ok(env_path) = std::env::var("KANBAN_TASKS_PATH") {
        let p = PathBuf::from(env_path);
        if p.exists() {
            return p;
        }
    }

    // 2. Verifica se existe tasks.json na pasta do executável atual (ex: AppData\Local\kanban-tray)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let p_exe = exe_dir.join("tasks.json");
            if p_exe.exists() {
                return p_exe;
            }
        }
    }

    // 3. Verifica se existe tasks.json no diretório atual de trabalho ou na pasta mãe
    if let Ok(cwd) = std::env::current_dir() {
        let p_root = cwd.join("tasks.json");
        if p_root.exists() {
            return p_root;
        }
        if let Some(parent) = cwd.parent() {
            let p_parent = parent.join("tasks.json");
            if p_parent.exists() {
                return p_parent;
            }
        }
    }

    // 4. Verifica no AppData Local padrão do Windows
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        let appdata_p = PathBuf::from(user_profile)
            .join("AppData")
            .join("Local")
            .join("kanban-tray")
            .join("tasks.json");
        if appdata_p.exists() {
            return appdata_p;
        }
    }

    // 5. Fallback para AppData do Tauri
    if let Ok(app_dir) = app.path().app_data_dir() {
        fs::create_dir_all(&app_dir).ok();
        return app_dir.join("tasks.json");
    }

    PathBuf::from("tasks.json")
}

pub fn resolve_settings_path(app: &tauri::AppHandle) -> PathBuf {
    // 1. Diretório do executável
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let p_exe = exe_dir.join("settings.json");
            if p_exe.exists() {
                return p_exe;
            }
        }
    }

    // 2. Diretório de trabalho atual
    if let Ok(cwd) = std::env::current_dir() {
        let p_root = cwd.join("settings.json");
        if p_root.exists() {
            return p_root;
        }
    }

    // 3. AppData Local do Windows
    if let Some(user_profile) = std::env::var_os("USERPROFILE") {
        let appdata_p = PathBuf::from(user_profile)
            .join("AppData")
            .join("Local")
            .join("kanban-tray")
            .join("settings.json");
        if let Some(parent) = appdata_p.parent() {
            fs::create_dir_all(parent).ok();
        }
        return appdata_p;
    }

    // 4. Fallback no AppData do Tauri
    if let Ok(app_dir) = app.path().app_data_dir() {
        fs::create_dir_all(&app_dir).ok();
        return app_dir.join("settings.json");
    }

    PathBuf::from("settings.json")
}

pub fn read_settings_from_disk(app: &tauri::AppHandle) -> AppSettings {
    let path = resolve_settings_path(app);
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&content) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

pub fn write_settings_to_disk(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = resolve_settings_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| format!("Erro ao salvar settings.json: {}", e))
}

pub fn format_shortcut_friendly(shortcut: &str) -> String {
    shortcut
        .replace("CommandOrControl", "Ctrl")
        .replace("CmdOrCtrl", "Ctrl")
        .replace("Control", "Ctrl")
        .replace("Space", "Espaço")
        .replace("+", " + ")
}

// Garante que o arquivo exista com dados iniciais caso ainda não exista
fn ensure_tasks_file(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let now = Utc::now().to_rfc3339();
        let initial_tasks = vec![
            Task {
                id: Uuid::new_v4().to_string(),
                title: "Configurar ambiente Tauri v2".to_string(),
                description: "Verificar rustc, MSVC, WebView2 e dependências básicas.".to_string(),
                status: TaskStatus::Done,
                priority: TaskPriority::High,
                updated_at: now.clone(),
            },
            Task {
                id: Uuid::new_v4().to_string(),
                title: "Gerenciador Kanban no Tray".to_string(),
                description: "Implementar UI compacta com suporte a drag & drop e hot-reload."
                    .to_string(),
                status: TaskStatus::InProgress,
                priority: TaskPriority::High,
                updated_at: now.clone(),
            },
            Task {
                id: Uuid::new_v4().to_string(),
                title: "Instruções para Agentes de IA".to_string(),
                description:
                    "Criar .ai-rules/tarefas_para_hoje.md para automatizar fluxo de trabalho."
                        .to_string(),
                status: TaskStatus::Todo,
                priority: TaskPriority::Medium,
                updated_at: now,
            },
        ];
        let content = serde_json::to_string_pretty(&initial_tasks).map_err(|e| e.to_string())?;
        fs::write(path, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn read_tasks_from_disk(path: &PathBuf) -> Result<Vec<Task>, String> {
    ensure_tasks_file(path)?;
    let content = fs::read_to_string(path).map_err(|e| format!("Erro ao ler tasks.json: {}", e))?;
    let bak_path = path.with_extension("json.bak");

    if content.trim().is_empty() {
        if bak_path.exists() {
            if let Ok(bak_content) = fs::read_to_string(&bak_path) {
                if !bak_content.trim().is_empty() {
                    if let Ok(TasksDataPayload::Array(tasks)) =
                        serde_json::from_str::<TasksDataPayload>(&bak_content)
                    {
                        eprintln!(
                            "[Kanban Tray] Arquivo tasks.json vazio. Auto-recuperando de tasks.json.bak"
                        );
                        let _ = fs::write(path, &bak_content);
                        return Ok(tasks);
                    }
                }
            }
        }
        return Ok(Vec::new());
    }

    match serde_json::from_str::<TasksDataPayload>(&content) {
        Ok(TasksDataPayload::Array(tasks)) => Ok(tasks),
        Ok(TasksDataPayload::Object { tasks }) => Ok(tasks),
        Err(err) => {
            eprintln!(
                "[Kanban Tray] Aviso: Sintaxe inválida no tasks.json: {}. Tentando ler backup...",
                err
            );
            // Tenta recuperar do backup tasks.json.bak
            if bak_path.exists() {
                if let Ok(bak_content) = fs::read_to_string(&bak_path) {
                    if let Ok(TasksDataPayload::Array(tasks)) =
                        serde_json::from_str::<TasksDataPayload>(&bak_content)
                    {
                        eprintln!(
                            "[Kanban Tray] Recuperado e auto-restaurado com sucesso a partir de tasks.json.bak"
                        );
                        let _ = fs::write(path, &bak_content);
                        return Ok(tasks);
                    }
                }
            }
            Err(format!("Erro ao deserializar tasks.json: {}", err))
        }
    }
}

fn write_tasks_to_disk(path: &PathBuf, tasks: &[Task]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Cria backup de segurança antes de sobrescrever
    if path.exists() {
        let bak_path = path.with_extension("json.bak");
        let _ = fs::copy(path, &bak_path);
    }
    let content = serde_json::to_string_pretty(tasks).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| format!("Erro ao salvar tasks.json: {}", e))
}

#[tauri::command]
fn get_tasks(app: tauri::AppHandle) -> Result<Vec<Task>, String> {
    let path = resolve_tasks_path(&app);
    read_tasks_from_disk(&path)
}

#[tauri::command]
fn save_tasks(app: tauri::AppHandle, tasks: Vec<Task>) -> Result<(), String> {
    let path = resolve_tasks_path(&app);
    write_tasks_to_disk(&path, &tasks)?;
    let _ = app.emit("tasks-updated", ());
    Ok(())
}

#[tauri::command]
fn create_task(
    app: tauri::AppHandle,
    title: String,
    description: String,
    priority: TaskPriority,
) -> Result<Task, String> {
    let path = resolve_tasks_path(&app);
    let mut tasks = read_tasks_from_disk(&path)?;
    let new_task = Task {
        id: Uuid::new_v4().to_string(),
        title,
        description,
        status: TaskStatus::Todo,
        priority,
        updated_at: Utc::now().to_rfc3339(),
    };
    tasks.insert(0, new_task.clone());
    write_tasks_to_disk(&path, &tasks)?;
    let _ = app.emit("tasks-updated", ());
    Ok(new_task)
}

#[tauri::command]
fn update_task_status(
    app: tauri::AppHandle,
    id: String,
    status: TaskStatus,
) -> Result<Task, String> {
    let path = resolve_tasks_path(&app);
    let mut tasks = read_tasks_from_disk(&path)?;
    let mut updated_task: Option<Task> = None;

    for task in tasks.iter_mut() {
        if task.id == id {
            task.status = status.clone();
            task.updated_at = Utc::now().to_rfc3339();
            updated_task = Some(task.clone());
            break;
        }
    }

    if let Some(task) = updated_task {
        write_tasks_to_disk(&path, &tasks)?;
        let _ = app.emit("tasks-updated", ());
        Ok(task)
    } else {
        Err(format!("Tarefa com id {} não encontrada", id))
    }
}

#[tauri::command]
fn update_task(app: tauri::AppHandle, task: Task) -> Result<(), String> {
    let path = resolve_tasks_path(&app);
    let mut tasks = read_tasks_from_disk(&path)?;
    let mut found = false;

    for t in tasks.iter_mut() {
        if t.id == task.id {
            t.title = task.title.clone();
            t.description = task.description.clone();
            t.status = task.status.clone();
            t.priority = task.priority.clone();
            t.updated_at = Utc::now().to_rfc3339();
            found = true;
            break;
        }
    }

    if found {
        write_tasks_to_disk(&path, &tasks)?;
        let _ = app.emit("tasks-updated", ());
        Ok(())
    } else {
        Err(format!("Tarefa com id {} não encontrada", task.id))
    }
}

#[tauri::command]
fn delete_task(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = resolve_tasks_path(&app);
    let mut tasks = read_tasks_from_disk(&path)?;
    let initial_len = tasks.len();
    tasks.retain(|t| t.id != id);

    if tasks.len() != initial_len {
        write_tasks_to_disk(&path, &tasks)?;
        let _ = app.emit("tasks-updated", ());
        Ok(())
    } else {
        Err(format!("Tarefa com id {} não encontrada", id))
    }
}

#[tauri::command]
fn get_tasks_file_path(app: tauri::AppHandle) -> String {
    let path = resolve_tasks_path(&app);
    path.to_string_lossy().to_string()
}

#[tauri::command]
fn open_tasks_file(app: tauri::AppHandle) -> Result<(), String> {
    let path = resolve_tasks_path(&app);
    ensure_tasks_file(&path)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        open::that(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn hide_window(window: WebviewWindow) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_pinned(state: tauri::State<'_, AppState>, pinned: bool) -> Result<(), String> {
    state.is_pinned.store(pinned, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn get_pinned(state: tauri::State<'_, AppState>) -> bool {
    state.is_pinned.load(Ordering::SeqCst)
}

#[tauri::command]
fn is_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enable {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_current_shortcut(state: tauri::State<'_, AppState>) -> String {
    let lock = state.current_shortcut.lock().unwrap();
    lock.clone()
}

#[tauri::command]
fn set_global_shortcut(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    shortcut: String,
) -> Result<String, String> {
    let trimmed = shortcut.trim();
    if trimmed.is_empty() {
        return Err("O atalho não pode ser vazio".to_string());
    }

    // Normaliza strings vindas do frontend para o formato aceito pelo Tauri
    let normalized = trimmed
        .replace("Ctrl+", "CommandOrControl+")
        .replace("ctrl+", "CommandOrControl+")
        .replace("Cmd+", "CommandOrControl+")
        .replace("cmd+", "CommandOrControl+");

    let new_shortcut = match Shortcut::from_str(&normalized) {
        Ok(s) => s,
        Err(err) => return Err(format!("Combinação de teclas inválida: {}", err)),
    };

    let old_shortcut_str = {
        let lock = state.current_shortcut.lock().unwrap();
        lock.clone()
    };

    // Desregistra o atalho anterior
    if !old_shortcut_str.is_empty() {
        if let Ok(old_sc) = Shortcut::from_str(&old_shortcut_str) {
            let _ = app.global_shortcut().unregister(old_sc);
        }
    }

    // Registra o novo atalho
    if let Err(err) = app.global_shortcut().register(new_shortcut) {
        // Se falhou, tenta restaurar o atalho anterior
        if let Ok(old_sc) = Shortcut::from_str(&old_shortcut_str) {
            let _ = app.global_shortcut().register(old_sc);
        }
        return Err(format!(
            "Não foi possível registrar o atalho (talvez já esteja em uso por outro aplicativo): {}",
            err
        ));
    }

    // Atualiza AppState
    {
        let mut lock = state.current_shortcut.lock().unwrap();
        *lock = normalized.clone();
    }

    // Persiste em disco
    let settings = AppSettings {
        shortcut: normalized.clone(),
    };
    write_settings_to_disk(&app, &settings).ok();

    // Atualiza o item do menu de contexto na bandeja dinamicamente
    let friendly = format_shortcut_friendly(&normalized);
    if let Ok(mut lock) = state.open_menu_item.lock() {
        if let Some(item) = lock.as_mut() {
            let _ = item.set_text(format!("Abrir Kanban ({})", friendly));
        }
    }

    // Emite evento para o frontend sincronizar
    let _ = app.emit("shortcut-changed", normalized.clone());

    Ok(normalized)
}

// Posiciona a janela no canto inferior direito próximo à bandeja do sistema
fn position_window_near_tray(window: &WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let screen_size = monitor.size();
        let scale = monitor.scale_factor();
        let (win_w, win_h) = if let Ok(size) = window.outer_size() {
            (size.width as i32, size.height as i32)
        } else {
            ((760.0 * scale) as i32, (460.0 * scale) as i32)
        };
        let margin_x = (16.0 * scale) as i32;
        let margin_y = (58.0 * scale) as i32;
        let x = (screen_size.width as i32) - win_w - margin_x;
        let y = (screen_size.height as i32) - win_h - margin_y;
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    }
}

fn show_and_focus_window(window: &WebviewWindow) {
    position_window_near_tray(window);
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let last_blur_time = Arc::new(Mutex::new(None::<Instant>));
    let last_blur_time_event = Arc::clone(&last_blur_time);
    let is_pinned = Arc::new(AtomicBool::new(false));
    let is_pinned_event = Arc::clone(&is_pinned);
    let is_pinned_state = Arc::clone(&is_pinned);

    let current_shortcut = Arc::new(Mutex::new("CommandOrControl+Space".to_string()));
    let current_shortcut_state = Arc::clone(&current_shortcut);
    let current_shortcut_setup = Arc::clone(&current_shortcut);

    let open_menu_item = Arc::new(Mutex::new(None::<MenuItem<tauri::Wry>>));
    let open_menu_item_state = Arc::clone(&open_menu_item);
    let open_menu_item_setup = Arc::clone(&open_menu_item);

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                show_and_focus_window(&window);
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppState {
            is_pinned: is_pinned_state,
            current_shortcut: current_shortcut_state,
            open_menu_item: open_menu_item_state,
        })
        .invoke_handler(tauri::generate_handler![
            get_tasks,
            save_tasks,
            create_task,
            update_task_status,
            update_task,
            delete_task,
            get_tasks_file_path,
            open_tasks_file,
            hide_window,
            set_pinned,
            get_pinned,
            is_autostart_enabled,
            set_autostart,
            get_current_shortcut,
            set_global_shortcut
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Lê as configurações salvas em disco
            let settings = read_settings_from_disk(&app_handle);
            let active_shortcut = settings.shortcut;

            // Atualiza AppState com o atalho inicial carregado
            {
                let mut lock = current_shortcut_setup.lock().unwrap();
                *lock = active_shortcut.clone();
            }

            // Registra o atalho no boot
            if let Ok(sc) = Shortcut::from_str(&active_shortcut) {
                if let Err(e) = app.global_shortcut().register(sc) {
                    eprintln!(
                        "[Kanban Tray] Falha ao registrar atalho salvo '{}': {}. Tentando padrão...",
                        active_shortcut, e
                    );
                    if let Ok(default_sc) = Shortcut::from_str("CommandOrControl+Space") {
                        let _ = app.global_shortcut().register(default_sc);
                    }
                }
            } else if let Ok(default_sc) = Shortcut::from_str("CommandOrControl+Space") {
                let _ = app.global_shortcut().register(default_sc);
            }

            // Menu de contexto com botão direito na bandeja
            let friendly = format_shortcut_friendly(&active_shortcut);
            let open_i = MenuItem::with_id(
                app,
                "open",
                format!("Abrir Kanban ({})", friendly),
                true,
                None::<&str>,
            )?;

            // Salva referência do item de menu para atualização dinâmica
            if let Ok(mut lock) = open_menu_item_setup.lock() {
                *lock = Some(open_i.clone());
            }
            let file_i =
                MenuItem::with_id(app, "open_file", "Abrir tasks.json", true, None::<&str>)?;
            let sep_1 = PredefinedMenuItem::separator(app)?;

            let autostart_state = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_i = CheckMenuItem::with_id(
                app,
                "autostart",
                "Iniciar com o Windows",
                true,
                autostart_state,
                None::<&str>,
            )?;
            let autostart_item_tray = autostart_i.clone();

            let sep_2 = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[&open_i, &file_i, &sep_1, &autostart_i, &sep_2, &quit_i],
            )?;

            // Configuração do Tray Icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Kanban Tray - Gerenciador de Tarefas")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            show_and_focus_window(&window);
                        }
                    }
                    "open_file" => {
                        let path = resolve_tasks_path(app);
                        ensure_tasks_file(&path).ok();
                        #[cfg(target_os = "windows")]
                        {
                            let _ = std::process::Command::new("explorer").arg(&path).spawn();
                        }
                    }
                    "autostart" => {
                        let autolaunch = app.autolaunch();
                        let current = autolaunch.is_enabled().unwrap_or(false);
                        let target = !current;
                        let res = if target {
                            autolaunch.enable()
                        } else {
                            autolaunch.disable()
                        };
                        match res {
                            Ok(()) => {
                                let _ = autostart_item_tray.set_checked(target);
                                let _ = app.emit("autostart-changed", target);
                                eprintln!(
                                    "[Kanban Tray] Iniciar com o Windows: {}",
                                    if target { "ATIVADO" } else { "DESATIVADO" }
                                );
                            }
                            Err(err) => {
                                eprintln!(
                                    "[Kanban Tray] Erro ao alterar início automático: {}",
                                    err
                                );
                                let _ = autostart_item_tray.set_checked(current);
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let now = Instant::now();
                        let was_recently_blurred = {
                            let lock = last_blur_time.lock().unwrap();
                            if let Some(t) = *lock {
                                now.duration_since(t).as_millis() < 300
                            } else {
                                false
                            }
                        };

                        if was_recently_blurred {
                            return;
                        }

                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                show_and_focus_window(&window);
                            }
                        }
                    }
                })
                .build(app)?;

            // Event listener da janela: fechar/ocultar ao perder foco se NÃO estiver fixada
            if let Some(main_window) = app.get_webview_window("main") {
                let win = main_window.clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        if !focused {
                            if !is_pinned_event.load(Ordering::SeqCst) {
                                *last_blur_time_event.lock().unwrap() = Some(Instant::now());
                                let _ = win.hide();
                            }
                        }
                    }
                });
            }

            // Monitoramento contínuo em background para refletir alterações de agentes de IA
            let watcher_app_handle = app_handle.clone();
            std::thread::spawn(move || {
                let path = resolve_tasks_path(&watcher_app_handle);
                let mut last_modified = fs::metadata(&path).and_then(|m| m.modified()).ok();
                loop {
                    std::thread::sleep(Duration::from_millis(1000));
                    let current_modified = fs::metadata(&path).and_then(|m| m.modified()).ok();
                    if current_modified.is_some() && current_modified != last_modified {
                        last_modified = current_modified;
                        let _ = watcher_app_handle.emit("tasks-changed", ());
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
