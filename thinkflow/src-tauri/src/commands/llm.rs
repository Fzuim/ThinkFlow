use crate::db::sqlite::Database;
use crate::llm::provider::{ChatMessage, ConnectionTestResult, ModelInfo};
use crate::models::LlmConfig;
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
    pub updates: Option<serde_json::Value>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TaskAssistantResult {
    pub reply: String,
    pub actions: Vec<TaskAssistantAction>,
    pub suggested_actions: Vec<TaskAssistantAction>,
}

#[tauri::command]
pub async fn task_assistant(
    db: State<'_, Database>,
    message: String,
    history: String,
) -> Result<TaskAssistantResult, String> {
    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        return Err("API key is not configured.".into());
    }

    // Get tasks and build compact summary
    let tasks = db.get_all_tasks().map_err(|e| e.to_string())?;

    // Get memory context
    let memory_context = match db.get_recent_memories(20) {
        Ok(memories) if !memories.is_empty() => {
            let mut ctx = String::new();
            for m in &memories {
                ctx.push_str(&format!("- [{}] {} (importance: {:.1})\n", m.memory_type, m.content, m.importance));
            }
            ctx
        }
        _ => String::new(),
    };

    // Parse conversation history
    let chat_history: Vec<ChatMessage> = if history.is_empty() {
        vec![]
    } else {
        serde_json::from_str(&history).unwrap_or_default()
    };

    let request = crate::agents::task_assistant::TaskAssistantAgent::build_prompt(
        &message,
        &tasks,
        &memory_context,
        &chat_history,
    );

    let mut request_with_model = request;
    request_with_model.model = config.model.clone();

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

    // Parse JSON response (with fallback for markdown-wrapped JSON)
    let raw = &response.content;
    let parsed: serde_json::Value = {
        if let Ok(v) = serde_json::from_str(raw) {
            v
        } else if let Some(caps) = raw.matches("```").collect::<Vec<_>>().first() {
            // Try extracting from markdown code block
            if let Some(json_match) = raw.split("```").nth(1) {
                let cleaned = json_match.trim_start_matches("json").trim();
                serde_json::from_str(cleaned).unwrap_or_else(|_| {
                    serde_json::from_str("{}").unwrap()
                })
            } else {
                serde_json::from_str("{}").unwrap()
            }
        } else {
            // Try finding JSON object in response
            if let Some(start) = raw.find('{') {
                if let Some(end) = raw.rfind('}') {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw[start..=end]) {
                        v
                    } else {
                        return Err("Could not parse AI response.".into());
                    }
                } else {
                    return Err("Could not parse AI response.".into());
                }
            } else {
                return Err("Could not parse AI response.".into());
            }
        }
    };

    let reply = parsed["reply"]
        .as_str()
        .unwrap_or("Done.")
        .to_string();

    let actions: Vec<TaskAssistantAction> = parsed["actions"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let action_type = a["type"].as_str()?.to_string();
                    Some(TaskAssistantAction {
                        action_type,
                        task_id: a["task_id"].as_str().map(String::from),
                        task: a.get("task").cloned(),
                        updates: a.get("updates").cloned(),
                        status: a["status"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let suggested_actions: Vec<TaskAssistantAction> = parsed["suggested_actions"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|a| {
                    let action_type = a["type"].as_str()?.to_string();
                    Some(TaskAssistantAction {
                        action_type,
                        task_id: a["task_id"].as_str().map(String::from),
                        task: a.get("task").cloned(),
                        updates: a.get("updates").cloned(),
                        status: a["status"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(TaskAssistantResult { reply, actions, suggested_actions })
}

// ---------------------------------------------------------------------------
// Task Assistant Streaming command (typewriter effect)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamChunkPayload {
    pub chunk: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StreamDonePayload {
    pub reply: String,
    pub actions: Vec<TaskAssistantAction>,
    pub suggested_actions: Vec<TaskAssistantAction>,
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
) -> Result<(), String> {
    use tokio::sync::mpsc;

    let config = get_llm_config_internal(&db)?;

    if config.api_key.is_empty() && config.provider != "compatible" {
        let _ = app_handle.emit("task-assistant:error", StreamErrorPayload {
            error: "API key is not configured.".to_string(),
        });
        return Err("API key is not configured.".into());
    }

    // Get tasks and build compact summary
    let tasks = db.get_all_tasks().map_err(|e| e.to_string())?;

    // Get memory context
    let memory_context = match db.get_recent_memories(20) {
        Ok(memories) if !memories.is_empty() => {
            let mut ctx = String::new();
            for m in &memories {
                ctx.push_str(&format!("- [{}] {} (importance: {:.1})\n", m.memory_type, m.content, m.importance));
            }
            ctx
        }
        _ => String::new(),
    };

    // Parse conversation history
    let chat_history: Vec<ChatMessage> = if history.is_empty() {
        vec![]
    } else {
        serde_json::from_str(&history).unwrap_or_default()
    };

    let request = crate::agents::task_assistant::TaskAssistantAgent::build_prompt(
        &message,
        &tasks,
        &memory_context,
        &chat_history,
    );

    let mut request_with_model = request;
    request_with_model.model = config.model.clone();

    if let Some(temp) = config.extra_params.get("temperature").and_then(|v| v.as_f64()) {
        request_with_model.temperature = Some(temp);
    }
    if let Some(max_tok) = config.extra_params.get("max_tokens").and_then(|v| v.as_i64()) {
        request_with_model.max_tokens = Some(max_tok as i32);
    }

    // Create channel for streaming
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Consume the channel in background (keeps it alive for the provider)
    // We don't forward raw SSE tokens to the frontend - they contain raw JSON
    let _consumer = tokio::spawn(async move {
        while let Some(_) = rx.recv().await { /* discard */ }
    });

    // Call the streaming provider
    let provider = crate::llm::provider::get_provider(&config.provider);
    let result = provider
        .chat_stream(&config.api_key, &config.base_url, request_with_model, tx.clone())
        .await;

    // Drop our sender so the consumer terminates
    drop(tx);
    let _ = _consumer.await;

    match result {
        Ok(response) => {
            let raw = &response.content;

            // Parse JSON response (with fallback for markdown-wrapped JSON)
            let parsed: serde_json::Value = {
                if let Ok(v) = serde_json::from_str(raw) {
                    v
                } else {
                    // Try extracting from markdown code block
                    if let Some(json_match) = raw.split("```").nth(1) {
                        let cleaned = json_match.trim_start_matches("json").trim();
                        serde_json::from_str(cleaned).unwrap_or_else(|_| {
                            serde_json::from_str("{}").unwrap()
                        })
                    } else {
                        // Try finding JSON object in response
                        if let Some(start) = raw.find('{') {
                            if let Some(end) = raw.rfind('}') {
                                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw[start..=end]) {
                                    v
                                } else {
                                    serde_json::json!({"reply": raw, "actions": [], "suggested_actions": []})
                                }
                            } else {
                                serde_json::json!({"reply": raw, "actions": [], "suggested_actions": []})
                            }
                        } else {
                            serde_json::json!({"reply": raw, "actions": [], "suggested_actions": []})
                        }
                    }
                }
            };

            let reply = parsed["reply"]
                .as_str()
                .unwrap_or(raw)
                .to_string();

            let actions: Vec<TaskAssistantAction> = parsed["actions"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| {
                            let action_type = a["type"].as_str()?.to_string();
                            Some(TaskAssistantAction {
                                action_type,
                                task_id: a["task_id"].as_str().map(String::from),
                                task: a.get("task").cloned(),
                                updates: a.get("updates").cloned(),
                                status: a["status"].as_str().map(String::from),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            let suggested_actions: Vec<TaskAssistantAction> = parsed["suggested_actions"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|a| {
                            let action_type = a["type"].as_str()?.to_string();
                            Some(TaskAssistantAction {
                                action_type,
                                task_id: a["task_id"].as_str().map(String::from),
                                task: a.get("task").cloned(),
                                updates: a.get("updates").cloned(),
                                status: a["status"].as_str().map(String::from),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();

            // Stream reply text character by character for typewriter effect
            // (don't forward raw SSE tokens - they contain unparsed JSON)
            for ch in reply.chars() {
                let _ = app_handle.emit(
                    "task-assistant:chunk",
                    StreamChunkPayload { chunk: ch.to_string() },
                );
                tokio::time::sleep(Duration::from_millis(15)).await;
            }

            let _ = app_handle.emit(
                "task-assistant:done",
                StreamDonePayload { reply, actions, suggested_actions },
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
