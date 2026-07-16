use crate::db::sqlite::Database;
use crate::llm::provider::{ChatCompletionRequest, ChatMessage, ConnectionTestResult, ModelInfo};
use crate::models::LlmConfig;
use std::collections::HashSet;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

/// Helper: read the LLM config from the database (non-async, does not hold lock across await).
fn get_llm_config_internal(db: &Database) -> Result<LlmConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT provider, api_key, model, base_url, extra_params FROM llm_config WHERE id = 1",
        )
        .map_err(|e| e.to_string())?;
    stmt.query_row([], |row| {
        let extra_str: String = row.get(4)?;
        Ok(LlmConfig {
            provider: row.get(0)?,
            api_key: row.get(1)?,
            model: row.get(2)?,
            base_url: row.get(3)?,
            extra_params: serde_json::from_str(&extra_str).unwrap_or(serde_json::json!({})),
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_llm_config(db: State<Database>) -> Result<LlmConfig, String> {
    get_llm_config_internal(&db)
}

#[tauri::command]
pub async fn save_llm_config(
    db: State<'_, Database>,
    config: LlmConfig,
    validate: bool,
) -> Result<(), String> {
    if validate {
        let provider = crate::llm::provider::get_provider(&config.provider);
        match provider
            .test_connection(&config.api_key, &config.base_url, &config.model)
            .await
        {
            Ok(result) if result.success => {}
            Ok(result) => return Err(result.message),
            Err(e) => return Err(e.to_string()),
        }
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO llm_config (id, provider, api_key, model, base_url, extra_params)
         VALUES (1, ?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            config.provider,
            config.api_key,
            config.model,
            config.base_url,
            serde_json::to_string(&config.extra_params).unwrap_or_default(),
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn test_connection(
    db: State<'_, Database>,
) -> Result<ConnectionTestResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Ok(ConnectionTestResult {
            success: false,
            message: "API key is not configured".into(),
            latency_ms: 0,
        });
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    match provider
        .test_connection(&config.api_key, &config.base_url, &config.model)
        .await
    {
        Ok(result) => Ok(result),
        Err(e) => Ok(ConnectionTestResult {
            success: false,
            message: e.to_string(),
            latency_ms: 0,
        }),
    }
}

#[tauri::command]
pub async fn list_models(db: State<'_, Database>) -> Result<Vec<ModelInfo>, String> {
    let config = get_llm_config_internal(&db)?;
    let provider = crate::llm::provider::get_provider(&config.provider);
    provider
        .list_models(&config.api_key, &config.base_url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn extract_tasks(
    db: State<'_, Database>,
    input: String,
) -> Result<String, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err(
            "API key is not configured. Please configure an LLM provider in Settings.".into(),
        );
    }

    // Build the prompt using the extraction agent
    // Inject memory context if available
    let memory_context = match db.get_recent_memories(20) {
        Ok(memories) if !memories.is_empty() => {
            let mut ctx = String::from("Known user context:\n");
            for m in &memories {
                ctx.push_str(&format!("- [{}] {} (importance: {:.1})\n", m.memory_type, m.content, m.importance));
            }
            ctx
        }
        _ => String::new(),
    };
    let request = crate::agents::extraction::ExtractionAgent::build_prompt(&input, &memory_context);

    let mut request_with_model = request;
    request_with_model.model = config.model.clone();

    // Apply temperature and max_tokens from extra_params if present
    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request_with_model.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request_with_model.max_tokens = Some(max_tok as i32);
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    let response = provider
        .chat(&config.api_key, &config.base_url, request_with_model)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.content)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PrioritizeResult {
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    pub reasoning: String,
    pub suggested_focus: Option<i32>,
}

#[tauri::command]
pub async fn prioritize_tasks(db: State<'_, Database>) -> Result<PrioritizeResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured. Please configure an LLM provider in Settings.".into());
    }

    // Gather all non-done, non-archived tasks
    let all_tasks = db.get_all_tasks().map_err(|e| e.to_string())?;
    let active_tasks: Vec<_> = all_tasks
        .into_iter()
        .filter(|t| t.status == "todo" || t.status == "in_progress")
        .collect();

    if active_tasks.is_empty() {
        return Ok(PrioritizeResult {
            task_id: None,
            task_title: None,
            reasoning: "No active tasks. Capture some tasks first!".into(),
            suggested_focus: None,
        });
    }

    let mut request = crate::agents::prioritization::PrioritizationEngine::build_prompt(&active_tasks);
    request.model = config.model.clone();

    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request.max_tokens = Some(max_tok as i32);
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    let response = provider
        .chat(&config.api_key, &config.base_url, request)
        .await
        .map_err(|e| e.to_string())?;

    let parsed: serde_json::Value =
        serde_json::from_str(&response.content).map_err(|e| format!("Failed to parse LLM response: {e}"))?;

    let task_index = parsed["task_index"].as_i64().map(|v| v as i32);
    let reasoning = parsed["reasoning"]
        .as_str()
        .unwrap_or("No reasoning provided")
        .to_string();
    let suggested_focus = parsed["suggested_focus"].as_i64().map(|v| v as i32);

    let recommended = task_index
        .and_then(|idx| active_tasks.get(idx as usize));

    Ok(PrioritizeResult {
        task_id: recommended.map(|t| t.id.clone()),
        task_title: recommended.map(|t| t.title.clone()),
        reasoning,
        suggested_focus,
    })
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DailyBriefResult {
    pub briefing: String,
}

#[tauri::command]
pub async fn daily_brief(db: State<'_, Database>) -> Result<DailyBriefResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured.".into());
    }

    let tasks = db.get_all_tasks().map_err(|e| e.to_string())?;

    if tasks.is_empty() {
        return Ok(DailyBriefResult {
            briefing: "No tasks yet. Capture some tasks in Quick Capture to get your daily briefing!".into(),
        });
    }

    let mut request = crate::agents::briefing::BriefingAgent::build_prompt(&tasks);
    request.model = config.model.clone();

    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request.max_tokens = Some(max_tok as i32);
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    let response = provider
        .chat(&config.api_key, &config.base_url, request)
        .await
        .map_err(|e| e.to_string())?;

    let parsed: serde_json::Value =
        serde_json::from_str(&response.content).map_err(|e| format!("Failed to parse: {e}"))?;

    let briefing = parsed["briefing"]
        .as_str()
        .unwrap_or("Could not generate briefing.")
        .to_string();

    Ok(DailyBriefResult { briefing })
}

// ---------------------------------------------------------------------------
// Memory AI commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn extract_memories(
    db: State<'_, Database>,
    input: String,
) -> Result<String, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured.".into());
    }

    let mut request = crate::agents::memory_extraction::MemoryExtractionAgent::build_prompt(&input);
    request.model = config.model.clone();

    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request.max_tokens = Some(max_tok as i32);
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    let response = provider
        .chat(&config.api_key, &config.base_url, request)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.content)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MemoryQAResult {
    pub answer: String,
    pub relevant_memory_ids: Vec<String>,
}

#[tauri::command]
pub async fn ask_memory(
    db: State<'_, Database>,
    question: String,
) -> Result<MemoryQAResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured.".into());
    }

    let memories = db.get_recent_memories(50).map_err(|e| e.to_string())?;

    if memories.is_empty() {
        return Ok(MemoryQAResult {
            answer: "No memories stored yet. Start capturing tasks and AI will learn your patterns over time.".to_string(),
            relevant_memory_ids: vec![],
        });
    }

    let memories_context = memories
        .iter()
        .map(|m| format!("[{}] {} (id: {})", m.memory_type, m.content, m.id))
        .collect::<Vec<_>>()
        .join("\n");

    let mut request = crate::agents::memory_qa::MemoryQAAgent::build_prompt(&question, &memories_context);
    request.model = config.model.clone();

    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request.max_tokens = Some(max_tok as i32);
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    let response = provider
        .chat(&config.api_key, &config.base_url, request)
        .await
        .map_err(|e| e.to_string())?;

    let parsed: serde_json::Value =
        serde_json::from_str(&response.content).map_err(|e| format!("Failed to parse: {e}"))?;

    let answer = parsed["answer"].as_str().unwrap_or("Could not generate answer.").to_string();
    let relevant_ids: Vec<String> = parsed["relevant_memory_ids"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    // Touch referenced memories to track access
    for id in &relevant_ids {
        let _ = db.touch_memory(id);
    }

    Ok(MemoryQAResult {
        answer,
        relevant_memory_ids: relevant_ids,
    })
}

// ---------------------------------------------------------------------------
// Fable (concept explanation via fable) command
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct FableResult {
    pub fable: String,
}

#[tauri::command]
pub async fn generate_fable(
    db: State<'_, Database>,
    concept: String,
) -> Result<FableResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured.".into());
    }

    let mut request = crate::agents::fable::FableAgent::build_prompt(&concept);
    request.model = config.model.clone();

    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request.max_tokens = Some(max_tok as i32);
    }

    let provider = crate::llm::provider::get_provider(&config.provider);
    let response = provider
        .chat(&config.api_key, &config.base_url, request)
        .await
        .map_err(|e| e.to_string())?;

    Ok(FableResult {
        fable: response.content,
    })
}

// ---------------------------------------------------------------------------
// Task Assistant command
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct TaskAssistantAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub task_id: Option<String>,
    pub task: Option<serde_json::Value>,
    pub goal: Option<serde_json::Value>,
    pub updates: Option<serde_json::Value>,
    pub status: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TaskAssistantResult {
    pub reply: String,
    pub actions: Vec<TaskAssistantAction>,
    pub suggested_actions: Vec<TaskAssistantAction>,
    /// LLM thinking / reasoning content (if the model produced any)
    pub reasoning: Option<String>,
}

// ---------------------------------------------------------------------------
// Shared helpers for task_assistant / task_assistant_stream
// ---------------------------------------------------------------------------

/// Parse the LLM raw response into a JSON value, handling markdown-wrapped JSON.
fn parse_llm_json(raw: &str) -> serde_json::Value {
    if let Ok(v) = serde_json::from_str(raw) {
        return v;
    }
    // Try extracting from markdown code block
    if raw.contains("```") {
        if let Some(json_match) = raw.split("```").nth(1) {
            let cleaned = json_match.trim_start_matches("json").trim();
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(cleaned) {
                return v;
            }
        }
    }
    // Try finding JSON object in response
    if let Some(start) = raw.find('{') {
        if let Some(end) = raw.rfind('}') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw[start..=end]) {
                return v;
            }
        }
    }
    // Fallback: treat raw text as the reply.
    // Trim whitespace — if the LLM returned only spaces/newlines (which happens
    // with some models when thinking is enabled or content is filtered), using
    // the raw text as-is would stream a wall of spaces to the frontend.
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        serde_json::json!({"reply": "", "actions": [], "suggested_actions": []})
    } else {
        serde_json::json!({"reply": trimmed, "actions": [], "suggested_actions": []})
    }
}

/// Parse a JSON array of actions into typed structs.
fn parse_task_actions(arr_val: Option<&serde_json::Value>) -> Vec<TaskAssistantAction> {
    arr_val
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let action_type = a["type"].as_str()?.to_string();
                    Some(TaskAssistantAction {
                        action_type,
                        task_id: a["task_id"].as_str().map(String::from),
                        task: a.get("task").cloned(),
                        goal: a.get("goal").cloned(),
                        updates: a.get("updates").cloned(),
                        status: a["status"].as_str().map(String::from),
                        content: a["content"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Extract the reply text from the parsed LLM JSON, with fallbacks for empty or
/// whitespace-only replies. If the reply is blank but actions exist, returns a
/// brief "done" message; if there are no actions either, returns an apology so
/// the user is never left staring at a blank bubble.
fn extract_reply_with_fallback(parsed: &serde_json::Value) -> String {
    let raw_reply = parsed["reply"].as_str().unwrap_or("");
    let trimmed = raw_reply.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    // Reply is empty — check if there are actions to execute
    let has_actions = parsed["actions"]
        .as_array()
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);
    let has_suggested = parsed["suggested_actions"]
        .as_array()
        .map(|arr| !arr.is_empty())
        .unwrap_or(false);
    if has_actions || has_suggested {
        "已为你处理。".to_string()
    } else {
        "抱歉，我暂时无法处理这个请求，请换个方式描述试试。".to_string()
    }
}

/// Check whether the LLM response contains a `query_completed_tasks` action,
/// signalling that a second-stage lookup with completed/archived tasks is needed.
fn needs_completed_lookup(parsed: &serde_json::Value) -> bool {
    parsed["actions"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .any(|a| a["type"].as_str() == Some("query_completed_tasks"))
        })
        .unwrap_or(false)
}

/// Extract task_ids from `query_task_detail` actions in the LLM response.
/// Supports both `task_ids: ["id1","id2"]` (array) and `task_id: "id1"` (single).
fn extract_query_task_detail_ids(parsed: &serde_json::Value) -> Vec<String> {
    let mut ids = Vec::new();
    if let Some(arr) = parsed["actions"].as_array() {
        for a in arr {
            if a["type"].as_str() == Some("query_task_detail") {
                if let Some(ids_arr) = a["task_ids"].as_array() {
                    for id in ids_arr {
                        if let Some(s) = id.as_str() {
                            ids.push(s.to_string());
                        }
                    }
                } else if let Some(id) = a["task_id"].as_str() {
                    ids.push(id.to_string());
                }
            }
        }
    }
    ids
}

/// Format task details (description, progress log, tags, etc.) as text for prompt injection.
fn format_task_details(tasks: &[crate::models::Task]) -> String {
    let mut buf = String::new();
    for t in tasks {
        buf.push_str(&format!("[id:{}] \"{}\" (status:{})\n", t.id, t.title, t.status));
        if !t.description.is_empty() {
            buf.push_str(&format!("  description: {}\n", t.description));
        }
        if !t.progress_log.is_empty() {
            buf.push_str("  progress log:\n");
            for p in &t.progress_log {
                buf.push_str(&format!("    [{}] {}\n", p.recorded_at, p.content));
            }
        }
        let tags = if t.tags.is_empty() { "none".to_string() } else { t.tags.join(", ") };
        buf.push_str(&format!("  tags: {}", tags));
        if let Some(ref s) = t.stakeholder {
            buf.push_str(&format!(" | stakeholder: {}", s));
        }
        if let Some(ref e) = t.energy_level {
            buf.push_str(&format!(" | energy: {}", e));
        }
        if let Some(d) = t.estimated_duration {
            buf.push_str(&format!(" | est: {}min", d));
        }
        buf.push('\n');
    }
    buf
}

/// Move `delete` actions from `actions` to `suggested_actions` so the UI
/// shows a Yes/No confirmation button before actually deleting.
fn move_delete_to_suggested(parsed: &mut serde_json::Value) {
    let mut delete_actions: Vec<serde_json::Value> = Vec::new();

    if let Some(actions) = parsed["actions"].as_array_mut() {
        actions.retain(|a| {
            if a["type"].as_str() == Some("delete") {
                delete_actions.push(a.clone());
                false
            } else {
                true
            }
        });
    }

    if !delete_actions.is_empty() {
        if parsed["suggested_actions"].is_null() {
            parsed["suggested_actions"] = serde_json::json!([]);
        }
        if let Some(suggested) = parsed["suggested_actions"].as_array_mut() {
            suggested.extend(delete_actions);
        }
    }
}

/// Fetch active tasks (todo + in_progress) from the database.
fn get_active_tasks(db: &Database) -> Result<Vec<crate::models::Task>, String> {
    let mut tasks = db.get_tasks_by_status("todo").map_err(|e| e.to_string())?;
    tasks.extend(db.get_tasks_by_status("in_progress").map_err(|e| e.to_string())?);
    Ok(tasks)
}

/// Fetch completed tasks (done + archived) from the database.
fn get_completed_tasks(db: &Database) -> Result<Vec<crate::models::Task>, String> {
    let mut tasks = db.get_tasks_by_status("done").map_err(|e| e.to_string())?;
    tasks.extend(db.get_tasks_by_status("archived").map_err(|e| e.to_string())?);
    Ok(tasks)
}

/// Apply user-configured model/temperature/max_tokens overrides to a request.
fn apply_model_config(
    mut request: ChatCompletionRequest,
    config: &LlmConfig,
) -> ChatCompletionRequest {
    request.model = config.model.clone();
    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request.max_tokens = Some(max_tok as i32);
    }
    request
}

/// Defense-in-depth for goal-scoped conversations. The model only sees the
/// selected goal, and its returned actions are also constrained before they
/// leave the backend.
fn enforce_goal_scope(
    parsed: &mut serde_json::Value,
    goal_id: &str,
    allowed_task_ids: &HashSet<String>,
) {
    for key in ["actions", "suggested_actions"] {
        let Some(actions) = parsed.get_mut(key).and_then(|value| value.as_array_mut()) else {
            continue;
        };

        actions.retain_mut(|action| {
            let Some(action_type) = action.get("type").and_then(|value| value.as_str()) else {
                return false;
            };

            match action_type {
                "create_goal" => false,
                "create" => {
                    let Some(task) = action.get_mut("task").and_then(|value| value.as_object_mut()) else {
                        return false;
                    };
                    task.insert("goal_id".into(), serde_json::Value::String(goal_id.into()));
                    match task.get("parent_id").and_then(|value| value.as_str()) {
                        Some(parent_id) if parent_id.starts_with("__ref:") => true,
                        Some(parent_id) => allowed_task_ids.contains(parent_id),
                        None => true,
                    }
                }
                "update" => {
                    let Some(task_id) = action.get("task_id").and_then(|value| value.as_str()) else {
                        return false;
                    };
                    if !allowed_task_ids.contains(task_id) {
                        return false;
                    }
                    if let Some(updates) = action.get_mut("updates").and_then(|value| value.as_object_mut()) {
                        updates.insert("goal_id".into(), serde_json::Value::String(goal_id.into()));
                        if let Some(parent_id) = updates.get("parent_id").and_then(|value| value.as_str()) {
                            if !allowed_task_ids.contains(parent_id) {
                                return false;
                            }
                        }
                    }
                    true
                }
                "delete" | "move" | "record_progress" => action
                    .get("task_id")
                    .and_then(|value| value.as_str())
                    .is_some_and(|task_id| allowed_task_ids.contains(task_id)),
                _ => true,
            }
        });
    }
}

/// Execute the two-stage LLM call and return the final parsed JSON
/// along with any reasoning/thinking content produced by the model.
///
/// Stage 1: inject only active (todo + in_progress) tasks.
/// Stage 2 (if the LLM requests it): also inject completed/archived tasks
///         and/or task details (description, progress log, etc.).
async fn do_task_assistant_llm(
    db: &Database,
    config: &LlmConfig,
    message: &str,
    memory_context: &str,
    chat_history: &[ChatMessage],
    goal_id: Option<&str>,
) -> Result<(serde_json::Value, Option<String>), String> {
    let scope_goal = goal_id
        .map(|id| db.get_goal_by_id(id).map_err(|e| e.to_string()))
        .transpose()?;
    let mut active_tasks = get_active_tasks(db)?;
    if let Some(id) = goal_id {
        active_tasks.retain(|task| task.goal_id.as_deref() == Some(id));
    }
    let goals = match scope_goal.as_ref() {
        Some(goal) => vec![goal.clone()],
        None => db.get_all_goals().map_err(|e| e.to_string())?,
    };
    let provider = crate::llm::provider::get_provider(&config.provider);

    // --- Stage 1: active tasks only ---
    let request = crate::agents::task_assistant::TaskAssistantAgent::build_prompt(
        message,
        &active_tasks,
        &goals,
        None,
        None,
        memory_context,
        chat_history,
        scope_goal.as_ref(),
    );
    let request = apply_model_config(request, config);
    let response = provider
        .chat(&config.api_key, &config.base_url, request)
        .await
        .map_err(|e| e.to_string())?;
    let mut parsed = parse_llm_json(&response.content);
    let mut reasoning = response.reasoning.clone();

    // --- Stage 2: if LLM needs more info, retry with supplemented data ---
    let needs_completed = needs_completed_lookup(&parsed);
    let detail_ids = extract_query_task_detail_ids(&parsed);

    if needs_completed || !detail_ids.is_empty() {
        // Fetch completed tasks if requested
        let completed_tasks: Option<Vec<crate::models::Task>> = if needs_completed {
            let mut tasks = get_completed_tasks(db)?;
            if let Some(id) = goal_id {
                tasks.retain(|task| task.goal_id.as_deref() == Some(id));
            }
            Some(tasks)
        } else {
            None
        };

        // Fetch task details if requested
        let task_details_text: Option<String> = if !detail_ids.is_empty() {
            let all_tasks = db.get_all_tasks().map_err(|e| e.to_string())?;
            let found: Vec<crate::models::Task> = all_tasks
                .into_iter()
                .filter(|task| {
                    detail_ids.contains(&task.id)
                        && goal_id.is_none_or(|id| task.goal_id.as_deref() == Some(id))
                })
                .collect();
            Some(format_task_details(&found))
        } else {
            None
        };

        let request = crate::agents::task_assistant::TaskAssistantAgent::build_prompt(
            message,
            &active_tasks,
            &goals,
            completed_tasks.as_ref().map(|v| v.as_slice()),
            task_details_text.as_deref(),
            memory_context,
            chat_history,
            scope_goal.as_ref(),
        );
        let request = apply_model_config(request, config);
        let response = provider
            .chat(&config.api_key, &config.base_url, request)
            .await
            .map_err(|e| e.to_string())?;
        parsed = parse_llm_json(&response.content);
        reasoning = response.reasoning.clone();
    }

    // Move delete actions to suggested_actions so the UI shows a confirmation button
    move_delete_to_suggested(&mut parsed);

    if let Some(id) = goal_id {
        let allowed_task_ids = db
            .get_all_tasks()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|task| task.goal_id.as_deref() == Some(id))
            .map(|task| task.id)
            .collect::<HashSet<_>>();
        enforce_goal_scope(&mut parsed, id, &allowed_task_ids);
    }

    Ok((parsed, reasoning))
}

#[tauri::command]
pub async fn task_assistant(
    db: State<'_, Database>,
    message: String,
    history: String,
    goal_id: Option<String>,
) -> Result<TaskAssistantResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured.".into());
    }

    // Get memory context
    let memory_context = if goal_id.is_some() {
        String::new()
    } else { match db.get_recent_memories(20) {
        Ok(memories) if !memories.is_empty() => {
            let mut ctx = String::new();
            for m in &memories {
                ctx.push_str(&format!("- [{}] {} (importance: {:.1})\n", m.memory_type, m.content, m.importance));
            }
            ctx
        }
        _ => String::new(),
    }};

    // Parse conversation history
    let chat_history: Vec<ChatMessage> = if history.is_empty() {
        vec![]
    } else {
        serde_json::from_str(&history).unwrap_or_default()
    };

    // Two-stage LLM call: stage 1 with active tasks, stage 2 (if needed) with completed tasks
    let (parsed, reasoning) = do_task_assistant_llm(
        &db,
        &config,
        &message,
        &memory_context,
        &chat_history,
        goal_id.as_deref(),
    ).await?;

    let reply = extract_reply_with_fallback(&parsed);

    let actions = parse_task_actions(parsed.get("actions"));
    let suggested_actions = parse_task_actions(parsed.get("suggested_actions"));

    Ok(TaskAssistantResult { reply, actions, suggested_actions, reasoning })
}

// ---------------------------------------------------------------------------
// Task Assistant Streaming command (typewriter effect)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamChunkPayload {
    pub chunk: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamThinkingPayload {
    pub chunk: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamDonePayload {
    pub reply: String,
    pub actions: Vec<TaskAssistantAction>,
    pub suggested_actions: Vec<TaskAssistantAction>,
    /// LLM thinking / reasoning content (if the model produced any)
    pub reasoning: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamErrorPayload {
    pub error: String,
}

#[tauri::command]
pub async fn task_assistant_stream(
    app_handle: AppHandle,
    db: State<'_, Database>,
    message: String,
    history: String,
    goal_id: Option<String>,
) -> Result<(), String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        let _ = app_handle.emit("task-assistant:error", StreamErrorPayload {
            error: "API key is not configured.".to_string(),
        });
        return Err("API key is not configured.".into());
    }

    // Get memory context
    let memory_context = if goal_id.is_some() {
        String::new()
    } else { match db.get_recent_memories(20) {
        Ok(memories) if !memories.is_empty() => {
            let mut ctx = String::new();
            for m in &memories {
                ctx.push_str(&format!("- [{}] {} (importance: {:.1})\n", m.memory_type, m.content, m.importance));
            }
            ctx
        }
        _ => String::new(),
    }};

    // Parse conversation history
    let chat_history: Vec<ChatMessage> = if history.is_empty() {
        vec![]
    } else {
        serde_json::from_str(&history).unwrap_or_default()
    };

    // Two-stage LLM call (stage 1: active tasks; stage 2 if needed: + completed tasks)
    let result = do_task_assistant_llm(
        &db,
        &config,
        &message,
        &memory_context,
        &chat_history,
        goal_id.as_deref(),
    ).await;

    match result {
        Ok((parsed, reasoning)) => {
            let reply = extract_reply_with_fallback(&parsed);

            let actions = parse_task_actions(parsed.get("actions"));
            let suggested_actions = parse_task_actions(parsed.get("suggested_actions"));

            // Phase 1: Stream reasoning (thinking) character by character if present.
            // The frontend auto-expands the reasoning section while this is active,
            // then auto-collapses it when Phase 2 (reply) begins.
            if let Some(ref reasoning_text) = reasoning {
                if !reasoning_text.is_empty() {
                    for ch in reasoning_text.chars() {
                        let _ = app_handle.emit(
                            "task-assistant:thinking",
                            StreamThinkingPayload { chunk: ch.to_string() },
                        );
                        tokio::time::sleep(Duration::from_millis(3)).await;
                    }
                }
            }

            // Phase 2: Stream reply text character by character for typewriter effect
            for ch in reply.chars() {
                let _ = app_handle.emit(
                    "task-assistant:chunk",
                    StreamChunkPayload { chunk: ch.to_string() },
                );
                tokio::time::sleep(Duration::from_millis(15)).await;
            }

            let _ = app_handle.emit(
                "task-assistant:done",
                StreamDonePayload { reply, actions, suggested_actions, reasoning },
            );
        }
        Err(e) => {
            let _ = app_handle.emit(
                "task-assistant:error",
                StreamErrorPayload { error: e.to_string() },
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod goal_scope_tests {
    use super::*;

    #[test]
    fn goal_scope_binds_creates_and_removes_cross_scope_actions() {
        let mut parsed = serde_json::json!({
            "reply": "ok",
            "actions": [
                {"type": "create", "task": {"title": "scoped child"}},
                {"type": "move", "task_id": "outside", "status": "done"},
                {"type": "update", "task_id": "inside", "updates": {"goal_id": "other", "title": "updated"}}
            ],
            "suggested_actions": [
                {"type": "create_goal", "goal": {"title": "another goal"}},
                {"type": "create", "task": {"title": "bad parent", "parent_id": "outside"}}
            ]
        });
        let allowed = HashSet::from(["inside".to_string()]);

        enforce_goal_scope(&mut parsed, "goal-1", &allowed);

        let actions = parsed["actions"].as_array().unwrap();
        assert_eq!(actions.len(), 2);
        assert_eq!(actions[0]["task"]["goal_id"], "goal-1");
        assert_eq!(actions[1]["updates"]["goal_id"], "goal-1");
        assert!(parsed["suggested_actions"].as_array().unwrap().is_empty());
    }
}
