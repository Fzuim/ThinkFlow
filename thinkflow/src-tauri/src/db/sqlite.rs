use rusqlite::{Connection, Error as SqliteError, params};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::{Memory, Project, Task};

/// Application-level database error.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] SqliteError),

    #[error("Lock error: {0}")]
    Lock(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),
}

impl From<std::sync::MutexGuard<'_, Connection>> for DbError {
    fn from(_: std::sync::MutexGuard<'_, Connection>) -> Self {
        // This arm exists so that `?` on Mutex::lock() poisoning produces a DbError.
        // In practice, Mutex<Connection> is only locked briefly and not held across
        // await points, so a poisoned mutex is extremely unlikely.
        unreachable!("Mutex<Connection> poisoned")
    }
}

impl From<std::sync::PoisonError<std::sync::MutexGuard<'_, Connection>>> for DbError {
    fn from(_: std::sync::PoisonError<std::sync::MutexGuard<'_, Connection>>) -> Self {
        DbError::Lock("Mutex poisoned".to_string())
    }
}

pub struct Database {
    pub conn: Mutex<Connection>,
}

/// Helper to map a single row into a `Task`.
fn row_to_task(row: &rusqlite::Row) -> rusqlite::Result<Task> {
    let tags_str: String = row.get(11)?;
    let deps_str: String = row.get(13)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        priority: row.get(3)?,
        urgency: row.get(4)?,
        importance: row.get(5)?,
        status: row.get(6)?,
        deadline: row.get(7)?,
        estimated_duration: row.get(8)?,
        energy_level: row.get(9)?,
        category: row.get(10)?,
        tags: serde_json::from_str(&tags_str).unwrap_or_default(),
        stakeholder: row.get(12)?,
        dependencies: serde_json::from_str(&deps_str).unwrap_or_default(),
        source_text: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
        completed_at: row.get(17)?,
    })
}

impl Database {
    /// Open (or create) the database file and ensure the schema is up to date.
    pub fn new(app_dir: PathBuf) -> Result<Self, DbError> {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("thinkflow.db");
        let conn = Connection::open(db_path)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.ensure_schema()?;
        Ok(db)
    }

    /// Idempotent schema creation/migration.
    /// Uses `CREATE TABLE IF NOT EXISTS` so it is safe to call repeatedly.
    pub fn ensure_schema(&self) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                priority INTEGER DEFAULT 5,
                urgency TEXT DEFAULT 'normal',
                importance TEXT DEFAULT 'normal',
                status TEXT DEFAULT 'todo',
                deadline TEXT,
                estimated_duration INTEGER,
                energy_level TEXT,
                category TEXT,
                tags TEXT DEFAULT '[]',
                stakeholder TEXT,
                dependencies TEXT DEFAULT '[]',
                source_text TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT DEFAULT 'active',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS llm_config (
                id INTEGER PRIMARY KEY DEFAULT 1,
                provider TEXT NOT NULL,
                api_key TEXT DEFAULT '',
                model TEXT NOT NULL,
                base_url TEXT NOT NULL,
                extra_params TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                importance REAL DEFAULT 0.5,
                created_at TEXT NOT NULL,
                last_accessed TEXT NOT NULL,
                access_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            -- Indexes for common query patterns
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
            CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

            CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
            CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
            ",
        )?;
        Ok(())
    }

    // ---------------------------------------------------------------------------
    // Task CRUD
    // ---------------------------------------------------------------------------

    /// Insert a new task. Returns the inserted task on success.
    pub fn create_task(&self, task: &Task) -> Result<Task, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let tags_json = serde_json::to_string(&task.tags).unwrap_or_else(|_| "[]".to_string());
        let deps_json = serde_json::to_string(&task.dependencies).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO tasks (id, title, description, priority, urgency, importance, status, \
             deadline, estimated_duration, energy_level, category, tags, stakeholder, \
             dependencies, source_text, created_at, updated_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                task.id,
                task.title,
                task.description,
                task.priority,
                task.urgency,
                task.importance,
                task.status,
                task.deadline,
                task.estimated_duration,
                task.energy_level,
                task.category,
                tags_json,
                task.stakeholder,
                deps_json,
                task.source_text,
                task.created_at,
                task.updated_at,
                task.completed_at,
            ],
        )?;
        Ok(task.clone())
    }

    /// Fetch a single task by its ID.
    pub fn get_task_by_id(&self, id: &str) -> Result<Task, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, description, priority, urgency, importance, status, \
             deadline, estimated_duration, energy_level, category, tags, stakeholder, \
             dependencies, source_text, created_at, updated_at, completed_at \
             FROM tasks WHERE id = ?1",
        )?;
        let task = stmt
            .query_row(params![id], row_to_task)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => DbError::NotFound(format!("Task '{}' not found", id)),
                other => DbError::Sqlite(other),
            })?;
        Ok(task)
    }

    /// Return all tasks ordered by created_at descending.
    pub fn get_all_tasks(&self) -> Result<Vec<Task>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, description, priority, urgency, importance, status, \
             deadline, estimated_duration, energy_level, category, tags, stakeholder, \
             dependencies, source_text, created_at, updated_at, completed_at \
             FROM tasks ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_task)?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }
        Ok(tasks)
    }

    /// Return tasks filtered by status.
    pub fn get_tasks_by_status(&self, status: &str) -> Result<Vec<Task>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, description, priority, urgency, importance, status, \
             deadline, estimated_duration, energy_level, category, tags, stakeholder, \
             dependencies, source_text, created_at, updated_at, completed_at \
             FROM tasks WHERE status = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![status], row_to_task)?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }
        Ok(tasks)
    }

    /// Return tasks filtered by category.
    pub fn get_tasks_by_category(&self, category: &str) -> Result<Vec<Task>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, description, priority, urgency, importance, status, \
             deadline, estimated_duration, energy_level, category, tags, stakeholder, \
             dependencies, source_text, created_at, updated_at, completed_at \
             FROM tasks WHERE category = ?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![category], row_to_task)?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }
        Ok(tasks)
    }

    /// Full-text-ish search on title and description using LIKE.
    /// The query string is wrapped with `%` wildcards on both sides.
    pub fn search_tasks(&self, query: &str) -> Result<Vec<Task>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, title, description, priority, urgency, importance, status, \
             deadline, estimated_duration, energy_level, category, tags, stakeholder, \
             dependencies, source_text, created_at, updated_at, completed_at \
             FROM tasks \
             WHERE title LIKE ?1 OR description LIKE ?1 \
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![pattern], row_to_task)?;
        let mut tasks = Vec::new();
        for row in rows {
            tasks.push(row?);
        }
        Ok(tasks)
    }

    /// Fully update an existing task. The `id` field in the `updates` struct is used
    /// to locate the row; the caller must ensure it matches the `where_id`.
    pub fn update_task(&self, where_id: &str, updates: &Task) -> Result<Task, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let tags_json = serde_json::to_string(&updates.tags).unwrap_or_else(|_| "[]".to_string());
        let deps_json =
            serde_json::to_string(&updates.dependencies).unwrap_or_else(|_| "[]".to_string());

        let affected = conn.execute(
            "UPDATE tasks SET title=?1, description=?2, priority=?3, urgency=?4, importance=?5, \
             status=?6, deadline=?7, estimated_duration=?8, energy_level=?9, category=?10, \
             tags=?11, stakeholder=?12, dependencies=?13, source_text=?14, updated_at=?15, \
             completed_at=?16 \
             WHERE id=?17",
            params![
                updates.title,
                updates.description,
                updates.priority,
                updates.urgency,
                updates.importance,
                updates.status,
                updates.deadline,
                updates.estimated_duration,
                updates.energy_level,
                updates.category,
                tags_json,
                updates.stakeholder,
                deps_json,
                updates.source_text,
                updates.updated_at,
                updates.completed_at,
                where_id,
            ],
        )?;

        if affected == 0 {
            return Err(DbError::NotFound(format!("Task '{}' not found", where_id)));
        }
        Ok(updates.clone())
    }

    /// Update only the status of a task.
    /// When transitioning **to** "done", `completed_at` is set to the current timestamp.
    /// When transitioning **away from** "done", `completed_at` is cleared to NULL.
    pub fn update_task_status(&self, id: &str, new_status: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();

        let affected = if new_status == "done" {
            conn.execute(
                "UPDATE tasks SET status=?1, updated_at=?2, completed_at=?2 WHERE id=?3",
                params![new_status, now, id],
            )?
        } else {
            conn.execute(
                "UPDATE tasks SET status=?1, updated_at=?2, completed_at=NULL WHERE id=?3",
                params![new_status, now, id],
            )?
        };

        if affected == 0 {
            return Err(DbError::NotFound(format!("Task '{}' not found", id)));
        }
        Ok(())
    }

    /// Delete a task by ID.
    pub fn delete_task(&self, id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let affected = conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Task '{}' not found", id)));
        }
        Ok(())
    }

    // ---------------------------------------------------------------------------
    // Project CRUD
    // ---------------------------------------------------------------------------

    pub fn create_project(&self, project: &Project) -> Result<Project, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        conn.execute(
            "INSERT INTO projects (id, name, description, status, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                project.id,
                project.name,
                project.description,
                project.status,
                project.created_at,
            ],
        )?;
        Ok(project.clone())
    }

    pub fn get_all_projects(&self) -> Result<Vec<Project>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, name, description, status, created_at \
             FROM projects ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        let mut projects = Vec::new();
        for row in rows {
            projects.push(row?);
        }
        Ok(projects)
    }

    pub fn update_project(&self, id: &str, updates: &Project) -> Result<Project, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let affected = conn.execute(
            "UPDATE projects SET name=?1, description=?2, status=?3 WHERE id=?4",
            params![updates.name, updates.description, updates.status, id],
        )?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Project '{}' not found", id)));
        }
        Ok(updates.clone())
    }

    pub fn delete_project(&self, id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let affected = conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Project '{}' not found", id)));
        }
        Ok(())
    }

    // ---------------------------------------------------------------------------
    // Memory CRUD
    // ---------------------------------------------------------------------------

    fn row_to_memory(row: &rusqlite::Row) -> rusqlite::Result<Memory> {
        Ok(Memory {
            id: row.get(0)?,
            memory_type: row.get(1)?,
            content: row.get(2)?,
            importance: row.get(3)?,
            created_at: row.get(4)?,
            last_accessed: row.get(5)?,
            access_count: row.get(6)?,
        })
    }

    pub fn create_memory(&self, memory: &Memory) -> Result<Memory, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        conn.execute(
            "INSERT INTO memories (id, type, content, importance, created_at, last_accessed, access_count) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                memory.id,
                memory.memory_type,
                memory.content,
                memory.importance,
                memory.created_at,
                memory.last_accessed,
                memory.access_count,
            ],
        )?;
        Ok(memory.clone())
    }

    pub fn get_all_memories(&self) -> Result<Vec<Memory>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, type, content, importance, created_at, last_accessed, access_count \
             FROM memories ORDER BY last_accessed DESC",
        )?;
        let rows = stmt.query_map([], Self::row_to_memory)?;
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        Ok(memories)
    }

    pub fn get_memories_by_type(&self, memory_type: &str) -> Result<Vec<Memory>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, type, content, importance, created_at, last_accessed, access_count \
             FROM memories WHERE type = ?1 ORDER BY last_accessed DESC",
        )?;
        let rows = stmt.query_map(params![memory_type], Self::row_to_memory)?;
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        Ok(memories)
    }

    pub fn search_memories(&self, query: &str) -> Result<Vec<Memory>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let pattern = format!("%{}%", query);
        let mut stmt = conn.prepare(
            "SELECT id, type, content, importance, created_at, last_accessed, access_count \
             FROM memories WHERE content LIKE ?1 ORDER BY importance DESC",
        )?;
        let rows = stmt.query_map(params![pattern], Self::row_to_memory)?;
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        Ok(memories)
    }

    pub fn update_memory(&self, id: &str, updates: &Memory) -> Result<Memory, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let affected = conn.execute(
            "UPDATE memories SET type=?1, content=?2, importance=?3, last_accessed=?4 WHERE id=?5",
            params![
                updates.memory_type,
                updates.content,
                updates.importance,
                updates.last_accessed,
                id,
            ],
        )?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Memory '{}' not found", id)));
        }
        Ok(updates.clone())
    }

    pub fn touch_memory(&self, id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let now = chrono::Utc::now().to_rfc3339();
        let affected = conn.execute(
            "UPDATE memories SET access_count = access_count + 1, last_accessed = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Memory '{}' not found", id)));
        }
        Ok(())
    }

    pub fn delete_memory(&self, id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let affected = conn.execute("DELETE FROM memories WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Memory '{}' not found", id)));
        }
        Ok(())
    }

    /// Get recent memories ordered by importance, used as LLM context.
    pub fn get_recent_memories(&self, limit: i32) -> Result<Vec<Memory>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, type, content, importance, created_at, last_accessed, access_count \
             FROM memories ORDER BY importance DESC, last_accessed DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], Self::row_to_memory)?;
        let mut memories = Vec::new();
        for row in rows {
            memories.push(row?);
        }
        Ok(memories)
    }
}
