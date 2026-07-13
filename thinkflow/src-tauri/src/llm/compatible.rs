use async_trait::async_trait;
use std::time::Instant;

use tokio::sync::mpsc::UnboundedSender;

use crate::llm::provider::{
    ChatCompletionRequest, ChatCompletionResponse, ConnectionTestResult, LlmError, LlmProvider,
    ModelInfo,
};

pub struct CompatibleProvider;

impl CompatibleProvider {
    fn build_chat_url(base_url: &str) -> String {
        let base = base_url.trim_end_matches('/');
        if base.ends_with("/v1") {
            format!("{}/chat/completions", base)
        } else {
            format!("{}/v1/chat/completions", base)
        }
    }

    fn build_models_url(base_url: &str) -> String {
        let base = base_url.trim_end_matches('/');
        if base.ends_with("/v1") {
            format!("{}/models", base)
        } else {
            format!("{}/v1/models", base)
        }
    }

    fn build_request_body(request: &ChatCompletionRequest) -> serde_json::Value {
        let mut body = serde_json::json!({
            "model": request.model,
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            }).collect::<Vec<_>>(),
        });

        if let Some(temp) = request.temperature {
            body["temperature"] = serde_json::json!(temp);
        }
        if let Some(max_tok) = request.max_tokens {
            body["max_tokens"] = serde_json::json!(max_tok);
        }
        if let Some(top_p) = request.top_p {
            body["top_p"] = serde_json::json!(top_p);
        }

        body
    }

    fn parse_chat_response(json: &serde_json::Value) -> (String, Option<String>) {
        let choice = json["choices"]
            .as_array()
            .and_then(|arr| arr.first());
        let content = choice
            .and_then(|c| c["message"]["content"].as_str())
            .unwrap_or("")
            .to_string();
        // Extract reasoning_content (e.g. DeepSeek R1 via compatible endpoint)
        let reasoning = choice
            .and_then(|c| c["message"]["reasoning_content"].as_str())
            .map(|s| s.to_string());
        (content, reasoning)
    }
}

#[async_trait]
impl LlmProvider for CompatibleProvider {
    async fn chat(
        &self,
        api_key: &str,
        base_url: &str,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, LlmError> {
        let client = reqwest::Client::new();
        let url = Self::build_chat_url(base_url);
        let body = Self::build_request_body(&request);

        let mut req = client.post(&url).json(&body);

        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        let resp = req.send().await.map_err(|e| LlmError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            return Err(LlmError::from_status(status, &text));
        }

        let json: serde_json::Value =
            resp.json().await.map_err(|e| LlmError::Parse(e.to_string()))?;

        let content;
        let reasoning;
        {
            let (c, r) = Self::parse_chat_response(&json);
            content = c;
            reasoning = r;
        }
        Ok(ChatCompletionResponse { content, reasoning })
    }

    async fn chat_stream(
        &self,
        api_key: &str,
        base_url: &str,
        request: ChatCompletionRequest,
        tx: UnboundedSender<String>,
    ) -> Result<ChatCompletionResponse, LlmError> {
        let client = reqwest::Client::new();
        let url = Self::build_chat_url(base_url);
        let mut body = Self::build_request_body(&request);
        body["stream"] = serde_json::json!(true);

        let mut req = client.post(&url).json(&body);
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        let mut resp = req.send().await.map_err(|e| LlmError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            return Err(LlmError::from_status(status, &text));
        }

        let mut full_content = String::new();
        let mut full_reasoning = String::new();
        let mut buf = String::new();

        while let Some(chunk) = resp.chunk().await.map_err(|e| LlmError::Network(e.to_string()))? {
            buf.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE lines from the buffer
            loop {
                if let Some(line_end) = buf.find('\n') {
                    let line = buf[..line_end].trim().to_string();
                    buf = buf[line_end + 1..].to_string();

                    if line.starts_with("data: ") {
                        let data = &line[6..];
                        if data.trim() == "[DONE]" {
                            break;
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            let choice = json["choices"]
                                .as_array()
                                .and_then(|arr| arr.first());
                            if let Some(content) = choice
                                .and_then(|c| c["delta"]["content"].as_str())
                            {
                                full_content.push_str(content);
                                let _ = tx.send(content.to_string());
                            }
                            // Accumulate reasoning_content from stream
                            if let Some(reasoning_chunk) = choice
                                .and_then(|c| c["delta"]["reasoning_content"].as_str())
                            {
                                full_reasoning.push_str(reasoning_chunk);
                            }
                        }
                    }
                } else {
                    break;
                }
            }
        }

        let reasoning = if full_reasoning.is_empty() { None } else { Some(full_reasoning) };
        Ok(ChatCompletionResponse { content: full_content, reasoning })
    }

    async fn list_models(
        &self,
        api_key: &str,
        base_url: &str,
    ) -> Result<Vec<ModelInfo>, LlmError> {
        let client = reqwest::Client::new();
        let url = Self::build_models_url(base_url);

        let mut req = client.get(&url);
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        let resp = req.send().await.map_err(|e| LlmError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            // For compatible providers, /v1/models may not exist.
            // Fall back to a minimal static list.
            return Ok(vec![ModelInfo {
                id: "local-model".into(),
                display_name: "Local Model".into(),
            }]);
        }

        let json: serde_json::Value =
            resp.json().await.map_err(|e| LlmError::Parse(e.to_string()))?;

        let models: Vec<ModelInfo> = json["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| {
                        let id = m["id"].as_str()?.to_string();
                        Some(ModelInfo {
                            display_name: id.clone(),
                            id,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        // If no models found, provide a fallback
        if models.is_empty() {
            Ok(vec![ModelInfo {
                id: "local-model".into(),
                display_name: "Local Model".into(),
            }])
        } else {
            Ok(models)
        }
    }

    async fn test_connection(
        &self,
        api_key: &str,
        base_url: &str,
        model: &str,
    ) -> Result<ConnectionTestResult, LlmError> {
        let client = reqwest::Client::new();
        let url = Self::build_chat_url(base_url);
        let start = Instant::now();

        let body = serde_json::json!({
            "model": model,
            "messages": [
                {"role": "user", "content": "ping"}
            ],
            "max_tokens": 10,
        });

        let mut req = client.post(&url).json(&body);
        if !api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }

        let resp = req.send().await.map_err(|e| LlmError::Network(e.to_string()))?;
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
