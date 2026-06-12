import { create } from "zustand";

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function showThenDismiss(set: (partial: Partial<SettingsStore>) => void, partial: Partial<SettingsStore>) {
  if (dismissTimer) clearTimeout(dismissTimer);
  set(partial);
  dismissTimer = setTimeout(() => {
    set({ connectionStatus: null, saveSuccess: false, saveError: null });
  }, 3000);
}

export type ProviderType = "anthropic" | "openai" | "deepseek" | "compatible";

export interface LLMConfig {
  provider: ProviderType;
  api_key: string;
  model: string;
  base_url: string;
  extra_params: Record<string, unknown>;
}

export interface ModelInfo {
  id: string;
  display_name: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

const defaultConfigs: Record<ProviderType, LLMConfig> = {
  anthropic: {
    provider: "anthropic",
    api_key: "",
    model: "claude-sonnet-4-6",
    base_url: "https://api.anthropic.com",
    extra_params: { temperature: 0.7, max_tokens: 4096 },
  },
  openai: {
    provider: "openai",
    api_key: "",
    model: "gpt-4o",
    base_url: "https://api.openai.com",
    extra_params: { temperature: 0.7, max_tokens: 4096 },
  },
  deepseek: {
    provider: "deepseek",
    api_key: "",
    model: "deepseek-v4-pro",
    base_url: "https://api.deepseek.com",
    extra_params: { temperature: 0.7, max_tokens: 384000 },
  },
  compatible: {
    provider: "compatible",
    api_key: "",
    model: "local-model",
    base_url: "http://localhost:11434/v1",
    extra_params: { temperature: 0.7, max_tokens: 4096 },
  },
};

interface SettingsStore {
  llmConfig: LLMConfig;

  // Derived state
  isConfigured: boolean;

  // Async operation states
  isSaving: boolean;
  isTesting: boolean;
  isLoadingModels: boolean;
  isLoadingConfig: boolean;

  // Operation results
  connectionStatus: ConnectionTestResult | null;
  saveSuccess: boolean;
  saveError: string | null;
  availableModels: ModelInfo[];

  // Actions
  setLLMConfig: (config: Partial<LLMConfig>) => void;
  setProviderType: (provider: ProviderType) => void;

  loadConfig: () => Promise<void>;
  saveConfig: (validate?: boolean) => Promise<boolean>;
  testConnection: () => Promise<void>;
  fetchModels: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  llmConfig: defaultConfigs.anthropic,
  isConfigured: false,
  isSaving: false,
  isTesting: false,
  isLoadingModels: false,
  isLoadingConfig: false,
  connectionStatus: null,
  saveSuccess: false,
  saveError: null,
  availableModels: [],

  setLLMConfig: (config) =>
    set((s) => {
      const newConfig = { ...s.llmConfig, ...config };
      return {
        llmConfig: newConfig,
        isConfigured:
          newConfig.api_key.length > 0 || newConfig.provider === "compatible",
        saveSuccess: false,
        connectionStatus: null,
      };
    }),

  setProviderType: (provider) =>
    set(() => ({
      llmConfig: { ...defaultConfigs[provider] },
      isConfigured: false,
      connectionStatus: null,
      saveError: null,
      availableModels: [],
    })),

  loadConfig: async () => {
    set({ isLoadingConfig: true });
    try {
      const config = await tauriInvoke<LLMConfig>("get_llm_config");
      if (config && config.provider) {
        set({
          llmConfig: {
            provider: config.provider as ProviderType,
            api_key: config.api_key,
            model: config.model,
            base_url: config.base_url,
            extra_params: config.extra_params || {},
          },
          isConfigured:
            config.api_key.length > 0 || config.provider === "compatible",
          isLoadingConfig: false,
        });
      } else {
        set({ isLoadingConfig: false });
      }
    } catch (err) {
      console.error("Failed to load LLM config:", err);
      set({ isLoadingConfig: false });
    }
  },

  saveConfig: async (validate = false) => {
    set({ isSaving: true, saveError: null });
    try {
      let llm = get().llmConfig; const maxTok = llm.extra_params?.max_tokens; if (typeof maxTok !== "number" || Number.isNaN(maxTok) || maxTok <= 0) { llm = { ...llm, extra_params: { ...llm.extra_params, max_tokens: 4096 } }; } await tauriInvoke("save_llm_config", {
        config: llm,
        validate,
      });
      showThenDismiss(set, {
        isSaving: false,
        isConfigured:
          get().llmConfig.api_key.length > 0 ||
          get().llmConfig.provider === "compatible",
        saveSuccess: true,
        saveError: null,
      });
      return true;
    } catch (err) {
      const message =
        typeof err === "string" ? err : "Failed to save settings";
      showThenDismiss(set, { isSaving: false, saveError: message });
      return false;
    }
  },

  testConnection: async () => {
    set({ isTesting: true, connectionStatus: null });
    try {
      // Save first so the backend has the latest config
      let llm = get().llmConfig; const maxTok = llm.extra_params?.max_tokens; if (typeof maxTok !== "number" || Number.isNaN(maxTok) || maxTok <= 0) { llm = { ...llm, extra_params: { ...llm.extra_params, max_tokens: 4096 } }; } await tauriInvoke("save_llm_config", {
        config: llm,
        validate: false,
      });
      const result = await tauriInvoke<ConnectionTestResult>("test_connection");
      showThenDismiss(set, { isTesting: false, connectionStatus: result });
    } catch (err) {
      const message =
        typeof err === "string" ? err : "Connection test failed";
      showThenDismiss(set, {
        isTesting: false,
        connectionStatus: {
          success: false,
          message,
          latency_ms: 0,
        },
      });
    }
  },

  fetchModels: async () => {
    set({ isLoadingModels: true });
    try {
      // Save first so the backend has the latest config
      await tauriInvoke("save_llm_config", {
        config: get().llmConfig,
        validate: false,
      });
      const models = await tauriInvoke<ModelInfo[]>("list_models");
      // If the current model is not in the list, prepend it
      const currentModel = get().llmConfig.model;
      const hasCurrent = models.some((m) => m.id === currentModel);
      const modelList = hasCurrent
        ? models
        : [
            { id: currentModel, display_name: currentModel },
            ...models,
          ];
      set({ isLoadingModels: false, availableModels: modelList });
    } catch (err) {
      console.error("Failed to fetch models:", err);
      // On error, provide a static list as fallback
      const fallback: ModelInfo[] = [
        { id: get().llmConfig.model, display_name: get().llmConfig.model },
      ];
      set({ isLoadingModels: false, availableModels: fallback });
    }
  },
}));
