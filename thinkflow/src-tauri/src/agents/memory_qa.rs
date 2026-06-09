use crate::llm::provider::{ChatCompletionRequest, ChatMessage};

pub struct MemoryQAAgent;

impl MemoryQAAgent {
    pub fn build_prompt(question: &str, memories_context: &str) -> ChatCompletionRequest {
        let system_prompt = format!(
            r#"You are an AI assistant with access to the user's stored memories. Answer the user's question based on the memory context below. If the memories don't contain relevant information, say so honestly and suggest what kind of memories to add.

User's stored memories:
{memories_context}

Instructions:
- Answer in the same language as the question
- Reference specific memories when relevant
- Be concise but helpful
- If no relevant memories exist, suggest what the user could capture to get better answers

Return JSON: {{"answer": "your answer here", "relevant_memory_ids": ["id1", "id2"]}}"#
        );

        ChatCompletionRequest {
            model: String::new(),
            messages: vec![
                ChatMessage { role: "system".to_string(), content: system_prompt },
                ChatMessage { role: "user".to_string(), content: question.to_string() },
            ],
            temperature: Some(0.5),
            max_tokens: Some(1024),
            top_p: None,
            top_k: None,
            response_format: Some(serde_json::json!({"type": "json_object"})),
            stream: None,
        }
    }
}
