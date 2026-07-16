use rusqlite::{Connection, Error as SqliteError, params};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::models::{Goal, Memory, Project, Task};

const TASK_COLUMNS: &str = "id, title, description, priority, urgency, importance, status, \
    deadline, estimated_duration, energy_level, category, tags, stakeholder, dependencies, \
    source_text, created_at, updated_at, completed_at, progress_log, goal_id, parent_id, kind, \
    start_at, planned_end_at, weight, sort_order, schedule_level";

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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_task(id: &str, title: &str, goal_id: Option<&str>, parent_id: Option<&str>) -> Task {
        Task {
            id: id.to_string(),
            title: title.to_string(),
            description: String::new(),
            priority: 5,
            urgency: "normal".to_string(),
            importance: "normal".to_string(),
            status: "todo".to_string(),
            deadline: None,
            estimated_duration: None,
            energy_level: None,
            category: None,
            tags: Vec::new(),
            stakeholder: None,
            dependencies: Vec::new(),
            source_text: None,
            progress_log: Vec::new(),
            goal_id: goal_id.map(String::from),
            parent_id: parent_id.map(String::from),
            kind: if parent_id.is_none() { "milestone" } else { "task" }.to_string(),
            start_at: None,
            planned_end_at: None,
            weight: 1.0,
            sort_order: 0,
            schedule_level: None,
            created_at: "2026-07-16T00:00:00Z".to_string(),
            updated_at: "2026-07-16T00:00:00Z".to_string(),
            completed_at: None,
        }
    }

    #[test]
    fn persists_goal_hierarchy_and_detects_cycles() {
        let dir = std::env::temp_dir().join(format!("thinkflow-goal-test-{}", uuid::Uuid::new_v4()));
        let db = Database::new(dir.clone()).expect("create test database");
        let goal = Goal {
            id: "goal-1".to_string(),
            title: "Pass the exam".to_string(),
            description: String::new(),
            success_criteria: "Pass".to_string(),
            start_date: Some("2026-07-16".to_string()),
            target_date: Some("2026-12-31".to_string()),
            status: "active".to_string(),
            progress_mode: "weighted".to_string(),
            review_cycle: "weekly".to_string(),
            created_at: "2026-07-16T00:00:00Z".to_string(),
            updated_at: "2026-07-16T00:00:00Z".to_string(),
        };
        db.create_goal(&goal).expect("persist goal");
        db.create_task(&test_task("stage-1", "Foundation", Some("goal-1"), None))
            .expect("persist stage");
        db.create_task(&test_task("task-1", "Chapter one", Some("goal-1"), Some("stage-1")))
            .expect("persist child");

        let loaded = db.get_all_tasks().expect("load hierarchy");
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded.iter().find(|task| task.id == "task-1").unwrap().parent_id.as_deref(), Some("stage-1"));
        assert!(db.would_create_task_cycle("stage-1", "task-1").unwrap());
        assert!(!db.would_create_task_cycle("task-1", "stage-1").unwrap());

        drop(db);
        std::fs::remove_dir_all(dir).ok();
    }
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
        progress_log: {
            let raw: String = row.get(18)?;
            serde_json::from_str(&raw).unwrap_or_default()
        },
        goal_id: row.get(19)?,
        parent_id: row.get(20)?,
        kind: row.get(21)?,
        start_at: row.get(22)?,
        planned_end_at: row.get(23)?,
        weight: row.get(24)?,
        sort_order: row.get(25)?,
        schedule_level: row.get(26)?,
    })
}

fn row_to_goal(row: &rusqlite::Row) -> rusqlite::Result<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        success_criteria: row.get(3)?,
        start_date: row.get(4)?,
        target_date: row.get(5)?,
        status: row.get(6)?,
        progress_mode: row.get(7)?,
        review_cycle: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
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
                completed_at TEXT,
                progress_log TEXT DEFAULT '[]',
                goal_id TEXT,
                parent_id TEXT,
                kind TEXT DEFAULT 'task',
                start_at TEXT,
                planned_end_at TEXT,
                weight REAL DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                schedule_level TEXT
            );

            CREATE TABLE IF NOT EXISTS goals (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                success_criteria TEXT DEFAULT '',
                start_date TEXT,
                target_date TEXT,
                status TEXT DEFAULT 'active',
                progress_mode TEXT DEFAULT 'weighted',
                review_cycle TEXT DEFAULT 'weekly',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
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

            ",
        )?;
        // Additive migrations for databases created by earlier releases.
        for migration in [
            "ALTER TABLE tasks ADD COLUMN progress_log TEXT DEFAULT '[]'",
            "ALTER TABLE tasks ADD COLUMN goal_id TEXT",
            "ALTER TABLE tasks ADD COLUMN parent_id TEXT",
            "ALTER TABLE tasks ADD COLUMN kind TEXT DEFAULT 'task'",
            "ALTER TABLE tasks ADD COLUMN start_at TEXT",
            "ALTER TABLE tasks ADD COLUMN planned_end_at TEXT",
            "ALTER TABLE tasks ADD COLUMN weight REAL DEFAULT 1",
            "ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0",
            "ALTER TABLE tasks ADD COLUMN schedule_level TEXT",
        ] {
            conn.execute_batch(migration).ok();
        }
        conn.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
             CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
             CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
             CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
             CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
             CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
             CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
             CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);",
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
             dependencies, source_text, created_at, updated_at, completed_at, progress_log, goal_id, \
             parent_id, kind, start_at, planned_end_at, weight, sort_order, schedule_level)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)",
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
                serde_json::to_string(&task.progress_log).unwrap_or_else(|_| "[]".to_string()),
                task.goal_id,
                task.parent_id,
                task.kind,
                task.start_at,
                task.planned_end_at,
                task.weight,
                task.sort_order,
                task.schedule_level,
            ],
        )?;
        Ok(task.clone())
    }

    /// Fetch a single task by its ID.
    pub fn get_task_by_id(&self, id: &str) -> Result<Task, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1"))?;
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
        let mut stmt = conn.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks ORDER BY created_at DESC"))?;
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
        let mut stmt = conn.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks WHERE status = ?1 ORDER BY created_at DESC"))?;
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
        let mut stmt = conn.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks WHERE category = ?1 ORDER BY created_at DESC"))?;
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
        let mut stmt = conn.prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks WHERE title LIKE ?1 OR description LIKE ?1 ORDER BY created_at DESC"))?;
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
             completed_at=?16, progress_log=?17, goal_id=?18, parent_id=?19, kind=?20, \
             start_at=?21, planned_end_at=?22, weight=?23, sort_order=?24, schedule_level=?25 \
             WHERE id=?26",
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
                serde_json::to_string(&updates.progress_log).unwrap_or_else(|_| "[]".to_string()),
                updates.goal_id,
                updates.parent_id,
                updates.kind,
                updates.start_at,
                updates.planned_end_at,
                updates.weight,
                updates.sort_order,
                updates.schedule_level,
                where_id,
            ],
        )?;

        if affected == 0 {
            return Err(DbError::NotFound(format!("Task '{}' not found", where_id)));
        }
        Ok(updates.clone())
    }

    /// Returns true when assigning `candidate_parent_id` would make a task a
    /// descendant of itself. The recursive CTE walks upward from the proposed parent.
    pub fn would_create_task_cycle(
        &self,
        task_id: &str,
        candidate_parent_id: &str,
    ) -> Result<bool, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let found: i64 = conn.query_row(
            "WITH RECURSIVE ancestors(id, parent_id) AS (
                SELECT id, parent_id FROM tasks WHERE id = ?1
                UNION ALL
                SELECT t.id, t.parent_id FROM tasks t JOIN ancestors a ON t.id = a.parent_id
             )
             SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = ?2)",
            params![candidate_parent_id, task_id],
            |row| row.get(0),
        )?;
        Ok(found != 0)
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
        let mut conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let tx = conn.transaction()?;
        tx.execute("UPDATE tasks SET parent_id = NULL WHERE parent_id = ?1", params![id])?;
        let affected = tx.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Task '{}' not found", id)));
        }
        tx.commit()?;
        Ok(())
    }

    // ---------------------------------------------------------------------------
    // Goal CRUD
    // ---------------------------------------------------------------------------

    pub fn create_goal(&self, goal: &Goal) -> Result<Goal, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        conn.execute(
            "INSERT INTO goals (id, title, description, success_criteria, start_date, target_date, \
             status, progress_mode, review_cycle, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![goal.id, goal.title, goal.description, goal.success_criteria, goal.start_date,
                goal.target_date, goal.status, goal.progress_mode, goal.review_cycle,
                goal.created_at, goal.updated_at],
        )?;
        Ok(goal.clone())
    }

    pub fn get_goal_by_id(&self, id: &str) -> Result<Goal, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        conn.query_row(
            "SELECT id, title, description, success_criteria, start_date, target_date, status, \
             progress_mode, review_cycle, created_at, updated_at FROM goals WHERE id = ?1",
            params![id],
            row_to_goal,
        ).map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => DbError::NotFound(format!("Goal '{}' not found", id)),
            other => DbError::Sqlite(other),
        })
    }

    pub fn get_all_goals(&self) -> Result<Vec<Goal>, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, title, description, success_criteria, start_date, target_date, status, \
             progress_mode, review_cycle, created_at, updated_at FROM goals ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], row_to_goal)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(DbError::Sqlite)
    }

    pub fn update_goal(&self, id: &str, goal: &Goal) -> Result<Goal, DbError> {
        let conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let affected = conn.execute(
            "UPDATE goals SET title=?1, description=?2, success_criteria=?3, start_date=?4, \
             target_date=?5, status=?6, progress_mode=?7, review_cycle=?8, updated_at=?9 WHERE id=?10",
            params![goal.title, goal.description, goal.success_criteria, goal.start_date,
                goal.target_date, goal.status, goal.progress_mode, goal.review_cycle,
                goal.updated_at, id],
        )?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Goal '{}' not found", id)));
        }
        Ok(goal.clone())
    }

    pub fn delete_goal(&self, id: &str) -> Result<(), DbError> {
        let mut conn = self.conn.lock().map_err(|_| DbError::Lock("Mutex poisoned".to_string()))?;
        let tx = conn.transaction()?;
        tx.execute("UPDATE tasks SET goal_id = NULL WHERE goal_id = ?1", params![id])?;
        let affected = tx.execute("DELETE FROM goals WHERE id = ?1", params![id])?;
        if affected == 0 {
            return Err(DbError::NotFound(format!("Goal '{}' not found", id)));
        }
        tx.commit()?;
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
