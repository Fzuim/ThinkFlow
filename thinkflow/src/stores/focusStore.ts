import { create } from "zustand";

const FOCUS_KEY = "last_focus_result";

export interface PrioritizeResult {
  task_id: string | null;
  task_title: string | null;
  reasoning: string;
  suggested_focus: number | null;
}

interface FocusStore {
  result: PrioritizeResult | null;
  loading: boolean;
  error: string | null;
  isLoaded: boolean;

  /** Load last result from SQLite (call on init). */
  init: () => Promise<void>;
  /** Run prioritization. Persists result to SQLite. */
  analyze: () => Promise<void>;
  /** Clear error state. */
  clearError: () => void;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

async function saveResultToDisk(result: PrioritizeResult): Promise<void> {
  await tauriInvoke("set_setting", {
    key: FOCUS_KEY,
    value: JSON.stringify(result),
  });
}

export const useFocusStore = create<FocusStore>((set) => ({
  result: null,
  loading: false,
  error: null,
  isLoaded: false,

  init: async () => {
    const saved = await tauriInvoke<string>("get_setting", { key: FOCUS_KEY });
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as PrioritizeResult;
        set({ result: parsed, isLoaded: true });
      } catch {
        set({ isLoaded: true });
      }
    } else {
      set({ isLoaded: true });
    }
  },

  analyze: async () => {
    set({ loading: true, error: null, result: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<PrioritizeResult>("prioritize_tasks");
      set({ result: res, loading: false });
      saveResultToDisk(res).catch(() => {});
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      if (typeof e === "string" && e.includes("API key")) {
        set({ error: "no_llm", loading: false });
      } else {
        set({ error: message, loading: false });
      }
    }
  },

  clearError: () => set({ error: null }),
}));
