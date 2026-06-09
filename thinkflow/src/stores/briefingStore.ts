import { create } from "zustand";

const BRIEFING_KEY = "last_daily_briefing";
const BRIEFING_DATE_KEY = "last_daily_briefing_date";

interface BriefingStore {
  briefing: string | null;
  loading: boolean;
  error: string | null;
  /** Date string (YYYY-MM-DD) of the last generated briefing */
  briefingDate: string | null;
  /** True when the store has attempted to load from disk */
  isLoaded: boolean;

  /** Load last briefing from SQLite (call on init). */
  init: () => Promise<void>;
  /** Generate a new briefing. Persists result to SQLite. */
  generate: () => Promise<void>;
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

async function saveBriefingToDisk(briefing: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await tauriInvoke("set_setting", { key: BRIEFING_KEY, value: briefing });
  await tauriInvoke("set_setting", { key: BRIEFING_DATE_KEY, value: today });
}

export const useBriefingStore = create<BriefingStore>((set, _get) => ({
  briefing: null,
  loading: false,
  error: null,
  briefingDate: null,
  isLoaded: false,

  init: async () => {
    const [savedBriefing, savedDate] = await Promise.all([
      tauriInvoke<string>("get_setting", { key: BRIEFING_KEY }),
      tauriInvoke<string>("get_setting", { key: BRIEFING_DATE_KEY }),
    ]);
    if (savedBriefing) {
      set({ briefing: savedBriefing, briefingDate: savedDate, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  generate: async () => {
    set({ loading: true, error: null, briefing: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<{ briefing: string }>("daily_brief");
      const today = new Date().toISOString().slice(0, 10);
      set({ briefing: res.briefing, loading: false, briefingDate: today });
      // Persist to disk (fire-and-forget)
      saveBriefingToDisk(res.briefing).catch(() => {});
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
