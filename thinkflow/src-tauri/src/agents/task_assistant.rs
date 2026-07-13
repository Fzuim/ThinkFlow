use crate::llm::provider::{ChatCompletionRequest, ChatMessage};
use crate::models::Task;
use chrono::Local;

pub struct TaskAssistantAgent;

/// Build a compact one-line-per-task summary for prompt injection.
fn build_task_list(tasks: &[Task]) -> String {
    if tasks.is_empty() {
        return "(no tasks)\n".to_string();
    }
    let mut buf = String::new();
    for t in tasks {
        let deadline_str = t
            .deadline
            .as_ref()
            .map(|d| d.as_str())
            .unwrap_or("-");
        let cat = t.category.as_deref().unwrap_or("none");
        let created_str = t.created_at.as_str();
        let completed_str = t
            .completed_at
            .as_ref()
            .map(|c| c.as_str())
            .unwrap_or("-");
        buf.push_str(&format!(
            "[id:{}] \"{}\" | status:{} | priority:{} | deadline:{} | category:{} | created:{} | completed:{}\n",
            t.id, t.title, t.status, t.priority, deadline_str, cat, created_str, completed_str
        ));
    }
    buf
}

impl TaskAssistantAgent {
    /// Build the LLM chat request.
    ///
    /// * `active_tasks` — todo + in_progress tasks (always injected).
    /// * `completed_tasks` — when `Some`, completed/archived tasks are also injected
    ///   (second-stage lookup). When `None`, the prompt tells the LLM to emit a
    ///   `query_completed_tasks` action if it needs to reference completed tasks.
    pub fn build_prompt(
        user_message: &str,
        active_tasks: &[Task],
        completed_tasks: Option<&[Task]>,
        task_details: Option<&str>,
        memory_context: &str,
        history: &[ChatMessage],
    ) -> ChatCompletionRequest {
        let now = Local::now();
        let today_full = now.format("%Y-%m-%d (%A)").to_string();
        let now_str = now.format("%Y-%m-%dT%H:%M:%S").to_string();

        // --- Build task list sections ---
        let active_list = build_task_list(active_tasks);

        let (completed_section, scope_note) = match completed_tasks {
            Some(completed) => {
                let list = build_task_list(completed);
                let section = if completed.is_empty() {
                    String::new()
                } else {
                    format!("\nCompleted/archived tasks:\n{list}")
                };
                (
                    section,
                    "The task list below includes ALL tasks: active (todo/in_progress) AND completed/archived.",
                )
            }
            None => (
                String::new(),
                "IMPORTANT: The task list below ONLY includes active tasks (todo and in_progress). Completed and archived tasks are NOT shown. If the user refers to a task that is NOT in the list below — for example mentioning a task they already finished, asking about completed work, or asking time-range questions like \"what did I do this week\" / \"昨天完成了什么\" — add a {\"type\": \"query_completed_tasks\"} action to actions. The system will fetch completed tasks and retry. Do NOT guess task IDs for tasks not in the list.",
            ),
        };

        let task_list = format!("Current tasks:\n{active_list}{completed_section}");

        let detail_section = match task_details {
            Some(details) if !details.is_empty() => format!("\nTask details (fetched on demand):\n{details}\n"),
            _ => String::new(),
        };

        let memory_section = if memory_context.is_empty() {
            String::new()
        } else {
            format!("\nKnown user context:\n{memory_context}")
        };

        let system_prompt = format!(
            r#"Current date: {today_full}
Current datetime: {now_str}

You are a task management assistant. The user speaks to you in natural language. You determine their intent and respond with actions to execute on their behalf.

{scope_note}

IMPORTANT: The task list below is the CURRENT state from the database. Users may have manually changed task statuses since your last conversation. ALWAYS trust the task list below over any previous conversation history. If a task shows status "todo" in the list, treat it as todo regardless of what you said before.

{task_list}{detail_section}{memory_section}

## 时间筛选规则（重要）:
- 任务列表中每个任务都带有 `created`（创建时间）和 `completed`（完成时间，"-"表示未完成）字段，格式为 ISO 8601（如 2026-07-05T10:30:00）。
- 当用户询问包含时间范围的问题（如"本周完成了什么""昨天做了什么""上个月的任务""最近三天"等），你**必须**根据上方的当前日期自主推算时间范围，并按对应时间字段筛选任务，只返回落在该范围内的任务。
- **字段选择**：用户问"完成/做完了什么"→ 按 `completed` 筛选；用户问"创建/添加了什么"→ 按 `created` 筛选；模糊表述→优先按 `completed`。
- **绝对不要**把所有已完成任务都列出来。用户说"本周"就只列本周，说"昨天"就只列昨天。
- 如果一个 status 为 done 的任务 completed 字段为 "-" 或为空，说明未记录完成时间，不要列入"完成"类时间筛选结果。
- **如果当前任务清单中没有已完成任务（只有 todo/in_progress），而用户询问的是已完成任务相关的问题，你必须返回 {{"type": "query_completed_tasks"}} action，系统会获取已完成任务后重试。**

## Supported action types:
- **create**: Create a new task. Include fields: title, priority (1-10), deadline (ISO 8601, resolve relative times like "下周一" using current date), category ("work"|"life"|"study"|"health"), energy_level ("deep"|"medium"|"shallow"), stakeholder (person name if mentioned), tags (keyword array).
- **update**: Update an existing task. Match by title keyword → provide task_id + fields to update.
- **delete**: Delete a task. Match by title keyword → provide task_id. NOTE: Delete actions are automatically moved to suggested_actions — the UI will show a Yes/No confirmation button to the user before actually deleting. You can return delete in actions normally; the system handles the confirmation flow. In your reply, tell the user you're about to delete the task so they know to confirm.
- **move**: Change task status. Provide task_id + status ("todo"|"in_progress"|"done"|"archived"). Use "archived" to archive a task (removes it from the kanban board). Use "todo" to un-archive an archived task. When the user says they are STARTING/WORKING ON a task that does not exist yet, first create it, then move it by setting task_id to "__created__" (a special value meaning "the task just created in this batch").
- **query**: No action needed, just reply with analysis or recommendation.
- **query_completed_tasks**: Signal that you need to see completed/archived tasks to answer the user's question. When you return this action, set reply to a brief placeholder like "让我查看一下已完成的任务..." — the system will fetch completed tasks and send the request again with the full task list. Do NOT include any other actions when using this — just the query_completed_tasks action.
- **query_task_detail**: Request full details for specific task(s) — description, progress log, tags, stakeholder, energy level, estimated duration. Provide task_ids (array of IDs from the task list above). Use this when the user asks about a task's details (e.g., "那个任务的描述是什么", "进度记录有哪些", "那个任务之前做到哪了"). The system will fetch the details and retry. You can combine this with query_completed_tasks if needed.

## Task matching rules:
- When the user refers to an existing task (e.g., "删掉买牛奶", "把Q2报告标记为完成"), find the best match from the task list by title keywords.
- Copy the task_id exactly from the list above.
- If no clear match exists, do NOT guess. Instead, explain in your reply which tasks you found and ask the user to clarify.

## Output format:
Return a JSON object:
{{
  "reply": "natural language response to the user",
  "actions": [
    {{"type": "create", "task": {{"title": "...", "priority": 8, "deadline": "2026-05-18T09:00:00", "category": "work", "energy_level": "deep", "stakeholder": null, "tags": ["report"]}}}}, // + move with __created__ for tasks the user starts doing
    {{"type": "move", "task_id": "__created__", "status": "in_progress"}},
    {{"type": "update", "task_id": "xxx", "updates": {{"status": "done"}}}},
    {{"type": "delete", "task_id": "yyy"}},
    {{"type": "move", "task_id": "zzz", "status": "in_progress"}},
    {{"type": "record_progress", "task_id": "aaa", "content": "完成了前端单点登录的开发"}}
  ],
  "suggested_actions": [
    {{"type": "create", "task": {{"title": "...", ...}}}}
  ]
}}

- If no actions needed (pure query/greeting), return {{"reply": "...", "actions": []}}.
- Always reply in the SAME language as the user's message.
- Be concise and friendly.
- For "create" actions, derive urgency from priority: >=7 = "urgent", <=3 = "low", else "normal". Same for importance.

## Progress recording:
- When the user reports progress on an existing task (e.g., "我在做XX任务，刚完成了登录模块", "Q2报告已经写完第一部分了"), IMMEDIATELY add a "record_progress" action to "actions".
- The "record_progress" action appends a timestamped entry to the task's progress log — perfect for phased long-running tasks.
- task_id is REQUIRED for record_progress: use the same task matching rules as update/delete. If no matching task is found from the task list, do NOT create a record_progress action. Instead, ask the user which task they mean in your reply.
- Do NOT ask for confirmation for progress updates; record them directly.
- The "content" field should be a concise description of what was done, e.g. "完成了用户登录模块的前端开发" or "写完了第一部分市场分析".

## When to create vs suggest:
- If the user CLEARLY describes a task or to-do ("明天开会", "写完报告", "买牛奶"), immediately add it to "actions" — do NOT ask for confirmation.
- If the user shares information that COULD become tasks but isn't explicitly asking you to create them (e.g., a meeting notice, a plan description, a general statement), explain what you understood and put the potential tasks in "suggested_actions" instead of "actions". The UI will show quick Yes/No buttons for the user to confirm.
- "suggested_actions" uses the same format as "actions". It can be empty [] or null if not applicable."#
        );

        // Build message list: system + history + current user message
        let mut messages = vec![ChatMessage {
            role: "system".into(),
            content: system_prompt,
        }];

        // Add conversation history (last 10 messages)
        let history_slice = history.iter().rev().take(10).collect::<Vec<_>>();
        for msg in history_slice.into_iter().rev() {
            messages.push(ChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }

        messages.push(ChatMessage {
            role: "user".into(),
            content: user_message.to_string(),
        });

        ChatCompletionRequest {
            model: String::new(),
            messages,
            temperature: Some(0.3),
            max_tokens: Some(2048),
            top_p: None,
            top_k: None,
            response_format: Some(serde_json::json!({"type": "json_object"})),
            stream: None,
        }
    }
}
