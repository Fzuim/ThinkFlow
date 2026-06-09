use crate::llm::provider::{ChatCompletionRequest, ChatMessage};

pub struct MemoryExtractionAgent;

impl MemoryExtractionAgent {
    pub fn build_prompt(input_text: &str) -> ChatCompletionRequest {
        let system_prompt = r#"You are a memory extraction assistant. Analyze the user's text and extract facts, preferences, habits, and contextual information worth remembering for future interactions.

For each extracted item, provide:
- content: a concise, self-contained statement (one sentence, in the same language as the input)
- type: one of "episodic" (events/experiences), "semantic" (facts/knowledge about the user), "procedural" (habits/workflow patterns), "preference" (likes/dislikes/work style)
- importance: 0.0 to 1.0 (how useful this memory is for future task management)

Rules:
- Only extract non-obvious, user-specific information that would help personalize future interactions
- Do NOT extract one-time trivial tasks (e.g., "buy milk")
- DO extract: relationships (who they work with), project context, work patterns, time preferences, recurring commitments, domain expertise, tool preferences
- If nothing worth remembering, return empty array
- Keep each memory item concise and actionable

Return JSON: {"memories": [{"content": "...", "type": "...", "importance": 0.7}, ...]}"#.to_string();

        ChatCompletionRequest {
            model: String::new(),
            messages: vec![
                ChatMessage { role: "system".to_string(), content: system_prompt },
                ChatMessage { role: "user".to_string(), content: input_text.to_string() },
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
