import { create } from "zustand";

interface FableStore {
  concept: string;
  fable: string | null;
  loading: boolean;
  error: string | null;

  setConcept: (concept: string) => void;
  setFable: (fable: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  generateFable: () => Promise<void>;
}

export const useFableStore = create<FableStore>((set, get) => ({
  concept: "",
  fable: null,
  loading: false,
  error: null,

  setConcept: (concept) => set({ concept }),
  setFable: (fable) => set({ fable }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  generateFable: async () => {
    const trimmed = get().concept.trim();
    if (!trimmed) return;

    set({ loading: true, error: null, fable: null });

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<{ fable: string }>("generate_fable", {
        concept: trimmed,
      });
      set({ fable: res.fable, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (typeof e === "string" && (e.includes("API key") || e.includes("not configured"))) {
        set({ error: "no_llm", loading: false });
      } else {
        set({ error: message, loading: false });
      }
    }
  },
}));
