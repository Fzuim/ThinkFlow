use async_trait::async_trait;
use tokio::sync::mpsc::UnboundedSender;

use serde::{Deserialize, Serialize};

// ── Error types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, thiserror::Error)]
pub enum LlmError {
    #[error("Authentication failed: {0}")]
    Auth(String),
    #[error("Rate limit exceeded: {0}")]
    RateLimit(String),
    #[error("Server error ({status}): {message}")]
    ServerError { status: u16, message: String },
    #[error("Network error: {0}")]
    Network(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("{0}")]
    Other(String),
}

impl LlmError {
    /// Map an HTTP status code and body to the appropriate error variant.
    pub fn from_status(status: u16, body: &str) -> Self {
        match status {
            401 | 403 => LlmError::Auth(body.to_string()),
            429 => LlmError::RateLimit(body.to_string()),
            500..=599 => LlmError::ServerError {
                status,
                message: body.to_string(),
            },
            _ => LlmError::Other(format!("HTTP {}: {}", status, body)),
        }
    }
}

// ── Chat types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_k: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub content: String,
}

// ── Model info ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
}

// ── Connection test result ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: u64,
}

// ── Provider trait ──────────────────────────────────────────

#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Send a (non-streaming) chat completion request.
    async fn chat(
        &self,
        api_key: &str,
        base_url: &str,
        request: ChatCompletionRequest,
    ) -> Result<ChatCompletionResponse, LlmError>;

    /// Send a streaming chat completion request.
    /// Default implementation returns a "not yet implemented" error.
    async fn chat_stream(
        &self,
        _api_key: &str,
        _base_url: &str,
        _request: ChatCompletionRequest,
        _tx: UnboundedSender<String>,
    ) -> Result<ChatCompletionResponse, LlmError> {
        Ok(ChatCompletionResponse { content: String::new() })

    }
    /// List available models for the configured provider.
    async fn list_models(
        &self,
        api_key: &str,
        base_url: &str,
    ) -> Result<Vec<ModelInfo>, LlmError>;

    /// Test the connection to the provider with the given credentials.
    /// Returns latency measurement and success status.
    async fn test_connection(
        &self,
        api_key: &str,
        base_url: &str,
        model: &str,
    ) -> Result<ConnectionTestResult, LlmError>;
}

// ── Provider factory ────────────────────────────────────────

pub fn get_provider(provider_type: &str) -> Box<dyn LlmProvider> {
    match provider_type {
        "anthropic" => Box::new(crate::llm::anthropic::AnthropicProvider),
        "openai" | "deepseek" => Box::new(crate::llm::openai::OpenAiProvider),
        "compatible" => Box::new(crate::llm::compatible::CompatibleProvider),
        _ => Box::new(crate::llm::anthropic::AnthropicProvider),
    }
}
