use async_trait::async_trait;
use std::time::Instant;

use crate::llm::provider::{
    ChatCompletionRequest, ChatCompletionResponse, ConnectionTestResult, LlmError, LlmProvider,
    ModelInfo,
};

pub struct AnthropicProvider;

impl AnthropicProvider {
    fn build_url(base_url: &str) -> String {
        let base = base_url.trim_end_matches('/');
        if base.ends_with("/v1") {
            format!("{}/messages", base)
        } else {
            format!("{}/v1/messages", base)
        }
    }
}

#[async_trait]
impl LlmProvider for AnthropicProvider {
    async fn chat(
        &self,
        api_key: &str,
        base_url: &str,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, LlmError> {
        let client = reqwest::Client::new();
        let url = Self::build_url(base_url);

        // Extract system message (Anthropic uses a top-level "system" field)
        let system_msg = request
            .messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone());

        let user_messages: Vec<_> = request
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .collect();

        let mut body = serde_json::json!({
            "model": request.model,
            "max_tokens": request.max_tokens.unwrap_or(4096),
            "messages": user_messages.iter().map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
        });

        if let Some(sys) = system_msg {
            body["system"] = serde_json::json!(sys);
        }
        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(top_p) = request.top_p {
            body["top_p"] = serde_json::json!(top_p);
        }
        if let Some(top_k) = request.top_k {
            body["top_k"] = serde_json::json!(top_k);
        }

        let resp = client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            return Err(LlmError::from_status(status, &text));
        }

        let json: serde_json::Value =
            resp.json().await.map_err(|e| LlmError::Parse(e.to_string()))?;

        let content = json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|block| block["text"].as_str())
            .unwrap_or("")
            .to_string();

        Ok(ChatCompletionResponse { content })
    }

    async fn list_models(
        &self,
        _api_key: &str,
        _base_url: &str,
    ) -> Result<Vec<ModelInfo>, LlmError> {
        // Anthropic does not expose a public model-listing endpoint.
        // Return a curated static list of current models.
        Ok(vec![
            ModelInfo {
                id: "claude-sonnet-4-6".into(),
                display_name: "Claude Sonnet 4.6".into(),
            },
            ModelInfo {
                id: "claude-haiku-4-5-20251001".into(),
                display_name: "Claude Haiku 4.5".into(),
            },
            ModelInfo {
                id: "claude-opus-4-7".into(),
                display_name: "Claude Opus 4.7".into(),
            },
            ModelInfo {
                id: "claude-sonnet-4-5".into(),
                display_name: "Claude Sonnet 4.5".into(),
            },
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".into(),
                display_name: "Claude 3.5 Sonnet".into(),
            },
        ])
    }

    async fn test_connection(
        &self,
        api_key: &str,
        base_url: &str,
        model: &str,
    ) -> Result<ConnectionTestResult, LlmError> {
        let client = reqwest::Client::new();
        let url = Self::build_url(base_url);
        let start = Instant::now();

        let body = serde_json::json!({
            "model": model,
            "max_tokens": 10,
            "messages": [
                {"role": "user", "content": "ping"}
            ],
        });

        let resp = client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| LlmError::Network(e.to_string()))?;

        let latency_ms = start.elapsed().as_millis() as u64;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            let err = LlmError::from_status(status, &text);
            return Ok(ConnectionTestResult {
                success: false,
                message: err.to_string(),
                latency_ms,
            });
        }

        // Verify JSON is well-formed
        let _json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| LlmError::Parse(e.to_string()))?;

        Ok(ConnectionTestResult {
            success: true,
            message: format!("Connected successfully in {}ms", latency_ms),
            latency_ms,
        })
    }
}
