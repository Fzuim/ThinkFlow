use crate::llm::provider::{ChatCompletionRequest, ChatMessage};
use crate::models::Task;
use chrono::Local;

pub struct PrioritizationEngine;

impl PrioritizationEngine {
    /// Build a prompt that asks the LLM to recommend the single best task to work on right now.
    pub fn build_prompt(tasks: &[Task]) -> ChatCompletionRequest {
        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let now_str = now.format("%Y-%m-%dT%H:%M:%S").to_string();
        let weekday = now.format("%A").to_string();
        let hour = now.format("%H:%M").to_string();

        // Build a compact task list for the prompt
        let mut task_list = String::new();
        for (i, t) in tasks.iter().enumerate() {
            let deadline_str = t
                .deadline
                .as_ref()
                .map(|d| format!("deadline: {d}"))
                .unwrap_or_else(|| "no deadline".to_string());
            let category_str = t
                .category
                .as_ref()
                .map(|c| c.as_str())
                .unwrap_or("none");
            let energy_str = t
                .energy_level
                .as_ref()
                .map(|e| e.as_str())
                .unwrap_or("medium");
            task_list.push_str(&format!(
                "- [{i}] \"{title}\" | priority:{prio}/10 | {deadline} | category:{cat} | energy:{energy} | status:{status}\n",
                i = i,
                title = t.title,
                prio = t.priority,
                deadline = deadline_str,
                cat = category_str,
                energy = energy_str,
                status = t.status,
            ));
        }

        let system_prompt = format!(
            r#"你是一位个人效率教练。你的任务是推荐当前最适合用户专注去做的唯一任务。

当前时间: {now_str} ({weekday}, {hour})
今天日期: {today}

优先级规则：
1. 紧急截止日期优先——今天到期或已逾期的任务排在最前
2. 高优先级任务（8-10）优先于中优先级（4-7）优先于低优先级（1-3）
3. 已处于"in_progress"的任务具有惯性优势
4. 匹配精力水平——适合深度专注时推荐"deep"任务，适合快速完成时推荐"shallow"任务
5. 考虑实际约束（例如，晚上11点不要推荐需要2小时的任务）

返回 JSON 对象：
- task_index: 推荐任务的序号（使用列表中的 [N]）
- reasoning: 2-3 句话解释为什么现在最适合做这个任务（任务状态请使用中文描述：待办/进行中/已完成）
- suggested_focus: 建议的专注时长（分钟），例如 25 表示一个番茄钟，90 表示深度工作

如果任务列表为空，返回：{{"task_index": null, "reasoning": "暂无可用任务。"}}"#
        );

        let user_message = format!(
            "以下是我当前的任务：\n\n{task_list}\n我现在应该专注做哪一个？"
        );

        ChatCompletionRequest {
            model: String::new(),
            messages: vec![
                ChatMessage {
                    role: "system".into(),
                    content: system_prompt,
                },
                ChatMessage {
                    role: "user".into(),
                    content: user_message,
                },
            ],
            temperature: Some(0.4),
            max_tokens: Some(512),
            top_p: None,
            top_k: None,
            response_format: Some(serde_json::json!({"type": "json_object"})),
            stream: None,
        }
    }
}
