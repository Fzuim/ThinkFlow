use tauri::State;

use crate::db::sqlite::Database;
use crate::models::{
    is_valid_status_transition, CreateProjectRequest, CreateTaskRequest, Project, SearchTasksRequest,
    Task, UpdateTaskStatusRequest,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Generate a v4 UUID as the primary key for new entities.
fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Current time in RFC 3339 format.
fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ---------------------------------------------------------------------------
// Task commands
// ---------------------------------------------------------------------------

/// Create a new task from a validated `CreateTaskRequest`.
#[tauri::command]
pub fn create_task(db: State<Database>, request: CreateTaskRequest) -> Result<Task, String> {
    request.validate()?;

    let id = new_id();
    let now = now_utc();
    let task = request.into_task(id, now);
    db.create_task(&task).map_err(|e| e.to_string())
}

/// Fetch a single task by its ID.
#[tauri::command]
pub fn get_task(db: State<Database>, id: String) -> Result<Task, String> {
    if id.trim().is_empty() {
        return Err("Task ID must not be empty".to_string());
    }
    db.get_task_by_id(&id).map_err(|e| e.to_string())
}

/// Return all tasks, ordered by creation date (newest first).
#[tauri::command]
pub fn get_all_tasks(db: State<Database>) -> Result<Vec<Task>, String> {
    db.get_all_tasks().map_err(|e| e.to_string())
}

/// Return tasks filtered by a specific status value.
#[tauri::command]
pub fn get_tasks_by_status(db: State<Database>, status: String) -> Result<Vec<Task>, String> {
    let s = status.trim();
    if s.is_empty() {
        return Err("Status must not be empty".to_string());
    }
    db.get_tasks_by_status(s).map_err(|e| e.to_string())
}

/// Search tasks whose title or description contains the given query string.
#[tauri::command]
pub fn search_tasks(
    db: State<Database>,
    request: SearchTasksRequest,
) -> Result<Vec<Task>, String> {
    let query = request.query.trim();
    if query.is_empty() {
        return Err("Search query must not be empty".to_string());
    }
    db.search_tasks(query).map_err(|e| e.to_string())
}

/// Fully update an existing task. The caller provides the task ID and the new
/// field values. The task's `id` and `created_at` are preserved from the
/// existing row.
#[tauri::command]
pub fn update_task(db: State<Database>, id: String, updates: Task) -> Result<Task, String> {
    if id.trim().is_empty() {
        return Err("Task ID must not be empty".to_string());
    }
    if updates.title.trim().is_empty() {
        return Err("Title must not be empty".to_string());
    }
    db.update_task(&id, &updates).map_err(|e| e.to_string())
}

/// Transition a task to a new status, with validation of the state machine.
/// The `completed_at` timestamp is auto-managed (set when moving to "done",
/// cleared when moving away from "done").
#[tauri::command]
pub fn update_task_status(
    db: State<Database>,
    request: UpdateTaskStatusRequest,
) -> Result<(), String> {
    request.validate()?;

    // Fetch current task to validate the status transition.
    let current = db.get_task_by_id(&request.id).map_err(|e| e.to_string())?;

    if !is_valid_status_transition(&current.status, &request.new_status) {
        return Err(format!(
            "Invalid status transition: '{}' -> '{}' is not allowed",
            current.status, request.new_status
        ));
    }

    db.update_task_status(&request.id, &request.new_status)
        .map_err(|e| e.to_string())
}

/// Append a progress entry to a task.
#[tauri::command]
pub fn append_task_progress(
    db: State<Database>,
    task_id: String,
    content: String,
) -> Result<(), String> {
    if task_id.trim().is_empty() {
        return Err("Task ID must not be empty".to_string());
    }
    if content.trim().is_empty() {
        return Err("Progress content must not be empty".to_string());
    }
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    let progress_line = format!("{}  {}", now, content);

    let conn = db.conn.lock().map_err(|_| "DB lock failed".to_string())?;
    let desc: String = conn.query_row(
        "SELECT description FROM tasks WHERE id = ?1",
        rusqlite::params![task_id],
        |row| row.get(0),
    ).map_err(|e| format!("{}", e))?;

    let new_desc = if desc.trim().is_empty() {
        progress_line
    } else {
        format!("{}\n\n{}", desc, progress_line)
    };

    conn.execute(
        "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_desc, now, task_id],
    ).map_err(|e| format!("{}", e))?;

    Ok(())
}

/// Delete a task by ID.
#[tauri::command]
pub fn delete_task(db: State<Database>, id: String) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("Task ID must not be empty".to_string());
    }
    db.delete_task(&id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Project commands
// ---------------------------------------------------------------------------

/// Create a new project.
#[tauri::command]
pub fn create_project(
    db: State<Database>,
    request: CreateProjectRequest,
) -> Result<Project, String> {
    request.validate()?;

    let id = new_id();
    let now = now_utc();
    let project = request.into_project(id, now);
    db.create_project(&project).map_err(|e| e.to_string())
}

/// Return tasks filtered by category.
#[tauri::command]
pub fn get_tasks_by_category(
    db: State<Database>,
    category: String,
) -> Result<Vec<Task>, String> {
    let c = category.trim();
    if c.is_empty() {
        return Err("Category must not be empty".to_string());
    }
    db.get_tasks_by_category(c).map_err(|e| e.to_string())
}

/// Return all projects.
#[tauri::command]
pub fn get_all_projects(db: State<Database>) -> Result<Vec<Project>, String> {
    db.get_all_projects().map_err(|e| e.to_string())
}
