use crate::llm::provider::{ChatCompletionRequest, ChatMessage};
use chrono::Local;

pub struct ExtractionAgent;

impl ExtractionAgent {
    pub fn build_prompt(user_input: &str, context: &str) -> ChatCompletionRequest {
        let now = Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        let today_full = now.format("%Y-%m-%d (%A)").to_string();
        let now_str = now.format("%Y-%m-%dT%H:%M:%S").to_string();

        let system_prompt = format!(
            r#"Current date: {today_full}
Current datetime: {now_str}

Extract actionable tasks from the user's input. For each task return:
- title: concise action title starting with a verb
- priority: 1-10 (higher = more urgent/important)
- deadline: ISO 8601 datetime. CRITICAL — always resolve relative time expressions using the current datetime above as reference:
  * "8点"/"八点" → "{today}T08:00:00" (if AM) or "{today}T20:00:00" (if PM context)
  * "今晚8点" / "晚上8点" → "{today}T20:00:00"
  * "明早9点" → tomorrow at 09:00
  * "下周一下午3点" → next Monday at 15:00
  * If only a time is given (e.g. "8点提醒我") without a date, default to TODAY. Use AM/PM disambiguation: if the given time is earlier than the current time, prefer PM (future); if later, keep as-is.
  * Words like "提醒"/"叫"/"通知"/"催" indicate a deadline.
  * Omit deadline only if no time reference exists in the input.
- category: "work"|"life"|"study"|"health"
- energy_level: "deep"|"medium"|"shallow"
- stakeholder: person name if mentioned
- tags: keyword array

Return a JSON object: {{"tasks": [...]}}. If no tasks found, return {{"tasks": []}}.

Context:
{context}"#
        );

        let user_message = user_input.to_string();

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
            temperature: Some(0.3),
            max_tokens: Some(1024),
            top_p: None,
            top_k: None,
            response_format: Some(serde_json::json!({"type": "json_object"})),
            stream: None,
        }
    }
}
