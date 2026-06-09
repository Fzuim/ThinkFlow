use crate::db::sqlite::Database;
use crate::models::{CreateMemoryRequest, Memory, UpdateMemoryRequest, VALID_MEMORY_TYPES};
use tauri::State;

#[tauri::command]
pub fn get_memories(db: State<Database>) -> Result<Vec<Memory>, String> {
    db.get_all_memories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_memories_by_type(db: State<Database>, memory_type: String) -> Result<Vec<Memory>, String> {
    if !VALID_MEMORY_TYPES.contains(&memory_type.as_str()) {
        return Err(format!("Invalid memory type '{}'", memory_type));
    }
    db.get_memories_by_type(&memory_type).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_memories(db: State<Database>, query: String) -> Result<Vec<Memory>, String> {
    if query.trim().is_empty() {
        return db.get_all_memories().map_err(|e| e.to_string());
    }
    db.search_memories(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_memory(db: State<Database>, request: CreateMemoryRequest) -> Result<Memory, String> {
    request.validate()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let memory = request.into_memory(id, now);
    db.create_memory(&memory).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_memory(
    db: State<Database>,
    id: String,
    request: UpdateMemoryRequest,
) -> Result<Memory, String> {
    let existing = db.get_all_memories()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("Memory '{}' not found", id))?;

    let updated = Memory {
        id: existing.id,
        memory_type: request.memory_type.unwrap_or(existing.memory_type),
        content: request.content.unwrap_or(existing.content),
        importance: request.importance.unwrap_or(existing.importance),
        created_at: existing.created_at,
        last_accessed: chrono::Utc::now().to_rfc3339(),
        access_count: existing.access_count,
    };

    if !VALID_MEMORY_TYPES.contains(&updated.memory_type.as_str()) {
        return Err(format!("Invalid memory type '{}'", updated.memory_type));
    }

    db.update_memory(&id, &updated).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_memory(db: State<Database>, id: String) -> Result<(), String> {
    db.delete_memory(&id).map_err(|e| e.to_string())
}
