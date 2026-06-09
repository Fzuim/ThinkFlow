import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "animal-island-ui";
import { Input } from "animal-island-ui";
import { Select } from "animal-island-ui";
import { Button } from "animal-island-ui";
import { Icon } from "animal-island-ui";
import { useSettingsStore, type ProviderType } from "@/stores/settingsStore";
import {
  Save,
  Plug,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Globe,
} from "lucide-react";

const providerDedicatedModels: Record<ProviderType, string[]> = {
  anthropic: ["claude-opus-4-6", "claude-sonnet-4-6"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o4-mini"],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  compatible: ["local-model"],
};

const providerOptions = [
  { key: "anthropic", label: "Anthropic (Claude)" },
  { key: "openai", label: "OpenAI (GPT)" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "compatible", label: "OpenAI Compatible (Ollama/vLLM)" },
];

const languageOptions = [
  { key: "en", label: "English" },
  { key: "zh", label: "中文" },
];

export default function SettingsView() {
  const { t, i18n } = useTranslation();
  const {
    llmConfig,
    isConfigured,
    isSaving,
    isTesting,
    isLoadingModels,
    isLoadingConfig,
    connectionStatus,
    saveSuccess,
    saveError,
    availableModels,
    setLLMConfig,
    setProviderType,
    loadConfig,
    saveConfig,
    testConnection,
    fetchModels,
  } = useSettingsStore();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const temperature =
    (llmConfig.extra_params?.temperature as number) ?? 0.7;
  const maxTokens =
    (llmConfig.extra_params?.max_tokens as number) ?? 4096;

  const handleSave = async () => {
    await saveConfig(false);
  };

  const handleTestConnection = async () => {
    await testConnection();
  };

  const handleProviderChange = (provider: string) => {
    setProviderType(provider as ProviderType);
  };

  const handleFetchModels = async () => {
    await fetchModels();
  };

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
  };

  const dedicatedModels = providerDedicatedModels[llmConfig.provider];
  const fetchedIds = new Set(availableModels.map((m) => m.id));
  const displayModels = [
    ...dedicatedModels
      .filter((m) => !fetchedIds.has(m))
      .map((id) => ({ id, display_name: id })),
    ...availableModels,
  ];

  // Always include the current model so the Select can display it,
  // even if it wasn't fetched from the API or isn't in the defaults.
  const hasCurrentModel = displayModels.some((m) => m.id === llmConfig.model);
  const allModelOptions = hasCurrentModel
    ? displayModels
    : [{ id: llmConfig.model, display_name: llmConfig.model }, ...displayModels];

  const modelOptions = allModelOptions.map((m) => ({
    key: m.id,
    label: m.display_name,
  }));

  return (
    <div className="max-w-5xl mx-auto p-6 h-3/4 flex flex-col">
      <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div className="p-6 pb-2">
          <div style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="icon-critterpedia" size={22} style={{ color: "#19c8b9" }} />
            {t("settings.title")}
          </div>
          {isLoadingConfig && (
            <p className="text-sm flex items-center gap-1 mt-1" style={{ color: "#9f927d" }}>
              <Loader2 size={14} className="animate-spin" />
              {t("settings.loading")}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 pt-3 space-y-5">
          {/* Language */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 80 }}>
              <Globe size={14} />
              {t("settings.language")}
            </label>
            <div className="flex-1">
              <Select
                value={i18n.language}
                onChange={(v) => v && changeLanguage(v)}
                options={languageOptions}
                placeholder="Language"
              />
            </div>
          </div>

          {/* Row: Provider + Base URL */}
          <div className="grid grid-cols-2 gap-x-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 65 }}>
                {t("settings.llmProvider")}
              </label>
              <div className="flex-1">
                <Select
                  value={llmConfig.provider}
                  onChange={handleProviderChange}
                  options={providerOptions}
                  placeholder="Provider"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 65 }}>
                {t("settings.baseUrl")}
              </label>
              <div className="flex-1">
                <Input
                  type="url"
                  placeholder={
                    llmConfig.provider === "anthropic"
                      ? "https://api.anthropic.com"
                      : "https://api.openai.com"
                  }
                  value={llmConfig.base_url}
                  onChange={(e) => setLLMConfig({ base_url: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Row: API Key + Model */}
          <div className="grid grid-cols-2 gap-x-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 65 }}>
                {t("settings.apiKey")}
                {llmConfig.provider === "compatible" && (
                  <span className="text-xs ml-0.5" style={{ color: "#9f927d" }}>
                    ({t("settings.apiKeyOptional")})
                  </span>
                )}
              </label>
              <div className="flex-1">
                <Input
                  type="password"
                  placeholder={
                    llmConfig.provider === "anthropic"
                      ? "sk-ant-..."
                      : "sk-..."
                  }
                  value={llmConfig.api_key}
                  onChange={(e) => setLLMConfig({ api_key: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 40 }}>
                {t("settings.model")}
              </label>
              <div className="flex-1">
                <Select
                  value={llmConfig.model}
                  onChange={(v) => v && setLLMConfig({ model: v })}
                  options={modelOptions}
                  placeholder="Model"
                />
              </div>
              <Button
                type="text"
                size="small"
                onClick={handleFetchModels}
                disabled={isLoadingModels}
                icon={isLoadingModels ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              >
                {t("settings.fetchModels")}
              </Button>
            </div>
          </div>

          {/* Row 5: Temperature + Max Tokens */}
          <div className="grid grid-cols-2 gap-x-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 80 }}>
                {t("settings.temperature", { value: temperature.toFixed(1) })}
              </label>
              <div className="flex-1">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) =>
                    setLLMConfig({
                      extra_params: {
                        ...llmConfig.extra_params,
                        temperature: parseFloat(e.target.value),
                      },
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold shrink-0" style={{ color: "#725d42", minWidth: 80 }}>
                {t("settings.maxTokens")}
              </label>
              <div className="flex-1 min-w-0">
                <Input
                  type="number"
                  min={1}
                  max={384000}
                  step={1}
                  value={maxTokens.toString()}
                  onChange={(e) =>
                    setLLMConfig({
                      extra_params: {
                        ...llmConfig.extra_params,
                        max_tokens: parseInt(e.target.value, 10) || 4096,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-5 pb-5 space-y-5">

          {/* Connection Test Result */}
          {connectionStatus && (
            <div
              className="flex items-start gap-2 p-3 text-sm"
              style={{
                borderRadius: 18,
                background: connectionStatus.success
                  ? "rgba(111,186,44,0.08)"
                  : "rgba(224,90,90,0.08)",
                border: connectionStatus.success
                  ? "1px solid rgba(111,186,44,0.3)"
                  : "1px solid rgba(224,90,90,0.3)",
              }}
            >
              {connectionStatus.success ? (
                <CheckCircle size={16} className="mt-0.5 shrink-0" style={{ color: "#6fba2c" }} />
              ) : (
                <XCircle size={16} className="mt-0.5 shrink-0" style={{ color: "#e05a5a" }} />
              )}
              <div>
                <p className="font-medium" style={{ color: connectionStatus.success ? "#6fba2c" : "#e05a5a" }}>
                  {connectionStatus.success
                    ? t("settings.connected", { latency: connectionStatus.latency_ms })
                    : t("settings.connectionFailed")}
                </p>
                <p className="text-xs mt-0.5" style={{ opacity: 0.8 }}>
                  {connectionStatus.message}
                </p>
                {connectionStatus.latency_ms > 0 && (
                  <p className="text-xs mt-0.5" style={{ opacity: 0.6 }}>
                    {t("settings.latency", { ms: connectionStatus.latency_ms })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Save Success */}
          {saveSuccess && (
            <div
              className="flex items-start gap-2 p-3 text-sm"
              style={{
                borderRadius: 18,
                background: "rgba(111,186,44,0.08)",
                border: "1px solid rgba(111,186,44,0.3)",
              }}
            >
              <CheckCircle size={16} className="mt-0.5 shrink-0" style={{ color: "#6fba2c" }} />
              <div>
                <p className="font-medium" style={{ color: "#6fba2c" }}>{t("settings.saved")}</p>
              </div>
            </div>
          )}

          {/* Save Error */}
          {saveError && (
            <div
              className="flex items-start gap-2 p-3 text-sm"
              style={{
                borderRadius: 18,
                background: "rgba(224,90,90,0.08)",
                border: "1px solid rgba(224,90,90,0.3)",
              }}
            >
              <XCircle size={16} className="mt-0.5 shrink-0" style={{ color: "#e05a5a" }} />
              <div>
                <p className="font-medium" style={{ color: "#e05a5a" }}>{t("settings.saveFailed")}</p>
                <p className="text-xs mt-0.5" style={{ opacity: 0.8 }}>{saveError}</p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              type="dashed"
              onClick={handleTestConnection}
              disabled={isTesting}
              block
              icon={isTesting ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
            >
              {isTesting ? "Testing..." : t("settings.testConnection")}
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              disabled={isSaving}
              block
              icon={isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            >
              {isSaving ? "Saving..." : t("settings.save")}
            </Button>
          </div>

          {isConfigured && (
            <p className="text-xs text-center" style={{ color: "#9f927d" }}>
              LLM provider is configured and ready
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
