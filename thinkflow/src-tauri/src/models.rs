use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Domain models (matching database schema)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: i32,
    pub urgency: String,
    pub importance: String,
    pub status: String,
    pub deadline: Option<String>,
    pub estimated_duration: Option<i32>,
    pub energy_level: Option<String>,
    pub category: Option<String>,
    pub tags: Vec<String>,
    pub stakeholder: Option<String>,
    pub dependencies: Vec<String>,
    pub source_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    pub provider: String,
    pub api_key: String,
    pub model: String,
    pub base_url: String,
    pub extra_params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    #[serde(rename = "type")]
    pub memory_type: String,
    pub content: String,
    pub importance: f64,
    pub created_at: String,
    pub last_accessed: String,
    pub access_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSetting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractionResult {
    pub tasks: Vec<Task>,
}

// ---------------------------------------------------------------------------
// Request types (input validation separate from domain models)
// ---------------------------------------------------------------------------

/// Valid task statuses.
pub const VALID_STATUSES: &[&str] = &["todo", "in_progress", "done", "archived", "cancelled"];

/// Valid transitions between statuses.
/// Returns `true` if the transition from `old_status` to `new_status` is allowed.
pub fn is_valid_status_transition(old_status: &str, new_status: &str) -> bool {
    use std::collections::HashSet;
    let transitions: HashSet<(&str, &str)> = [
        // Forward flow
        ("todo", "in_progress"),
        ("todo", "done"),          // complete directly
        ("in_progress", "done"),
        // Backward / reopening
        ("in_progress", "todo"),
        ("done", "in_progress"),
        ("done", "todo"),          // reopen a completed task
        // Archive (anything can be archived)
        ("todo", "archived"),
        ("in_progress", "archived"),
        ("done", "archived"),
        ("archived", "todo"),       // reactivate archived task
        ("archived", "in_progress"),
        ("archived", "done"),
        // Cancellation (anything can be cancelled)
        ("todo", "cancelled"),
        ("in_progress", "cancelled"),
        ("done", "cancelled"),
        ("cancelled", "todo"),       // reactivate cancelled task
        ("cancelled", "in_progress"),
    ]
    .into_iter()
    .collect();
    // Same status is always allowed (no-op)
    old_status == new_status || transitions.contains(&(old_status, new_status))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    /// Frontend-provided UUID. If omitted, the backend generates one.
    pub id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_priority")]
    pub priority: i32,
    #[serde(default = "default_urgency")]
    pub urgency: String,
    #[serde(default = "default_importance")]
    pub importance: String,
    #[serde(default = "default_status")]
    pub status: String,
    pub deadline: Option<String>,
    pub estimated_duration: Option<i32>,
    pub energy_level: Option<String>,
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub stakeholder: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    pub source_text: Option<String>,
}

fn default_priority() -> i32 {
    5
}
fn default_urgency() -> String {
    "normal".to_string()
}
fn default_importance() -> String {
    "normal".to_string()
}
fn default_status() -> String {
    "todo".to_string()
}

impl CreateTaskRequest {
    /// Validate the request. Returns `Ok(())` or a `String` error message.
    pub fn validate(&self) -> Result<(), String> {
        let title = self.title.trim();
        if title.is_empty() {
            return Err("Title must not be empty".to_string());
        }
        if title.len() > 500 {
            return Err("Title must not exceed 500 characters".to_string());
        }
        if !VALID_STATUSES.contains(&self.status.as_str()) {
            return Err(format!(
                "Invalid status '{}'. Must be one of: {:?}",
                self.status, VALID_STATUSES
            ));
        }
        if self.priority < 1 || self.priority > 10 {
            return Err("Priority must be between 1 and 10".to_string());
        }
        Ok(())
    }

    /// Convert the validated request into a full `Task` with generated fields.
    /// Uses the frontend-provided `id` if present, otherwise generates a new one.
    pub fn into_task(self, id: String, now: String) -> Task {
        let task_id = self.id.unwrap_or(id);
        Task {
            id: task_id,
            title: self.title,
            description: self.description,
            priority: self.priority,
            urgency: self.urgency,
            importance: self.importance,
            status: self.status,
            deadline: self.deadline,
            estimated_duration: self.estimated_duration,
            energy_level: self.energy_level,
            category: self.category,
            tags: self.tags,
            stakeholder: self.stakeholder,
            dependencies: self.dependencies,
            source_text: self.source_text,
            created_at: now.clone(),
            updated_at: now,
            completed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTaskStatusRequest {
    pub id: String,
    pub new_status: String,
}

impl UpdateTaskStatusRequest {
    pub fn validate(&self) -> Result<(), String> {
        if !VALID_STATUSES.contains(&self.new_status.as_str()) {
            return Err(format!(
                "Invalid status '{}'. Must be one of: {:?}",
                self.new_status, VALID_STATUSES
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

impl CreateProjectRequest {
    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("Project name must not be empty".to_string());
        }
        if self.name.len() > 200 {
            return Err("Project name must not exceed 200 characters".to_string());
        }
        Ok(())
    }

    pub fn into_project(self, id: String, now: String) -> Project {
        Project {
            id,
            name: self.name,
            description: self.description,
            status: "active".to_string(),
            created_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchTasksRequest {
    pub query: String,
}

// ---------------------------------------------------------------------------
// Memory request types
// ---------------------------------------------------------------------------

pub const VALID_MEMORY_TYPES: &[&str] = &["episodic", "semantic", "procedural", "preference"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemoryRequest {
    pub memory_type: String,
    pub content: String,
    #[serde(default = "default_memory_importance")]
    pub importance: f64,
}

fn default_memory_importance() -> f64 {
    0.5
}

impl CreateMemoryRequest {
    pub fn validate(&self) -> Result<(), String> {
        if !VALID_MEMORY_TYPES.contains(&self.memory_type.as_str()) {
            return Err(format!(
                "Invalid memory type '{}'. Must be one of: {:?}",
                self.memory_type, VALID_MEMORY_TYPES
            ));
        }
        if self.content.trim().is_empty() {
            return Err("Content must not be empty".to_string());
        }
        if self.importance < 0.0 || self.importance > 1.0 {
            return Err("Importance must be between 0.0 and 1.0".to_string());
        }
        Ok(())
    }

    pub fn into_memory(self, id: String, now: String) -> Memory {
        Memory {
            id,
            memory_type: self.memory_type,
            content: self.content,
            importance: self.importance,
            created_at: now.clone(),
            last_accessed: now,
            access_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMemoryRequest {
    pub memory_type: Option<String>,
    pub content: Option<String>,
    pub importance: Option<f64>,
}
